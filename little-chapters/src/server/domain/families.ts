import { getSql } from "@/server/db/client";
import { assertFamilyRole, type FamilyRole } from "@/server/authz";
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from "@/server/errors";
import { hashToken, opaqueToken } from "@/lib/tokens";
import { audit } from "@/server/observability/audit";
import { assertWithinLimit } from "@/server/billing/usage";
import { addFeedItem } from "@/server/domain/feed";

/** Families: creation, membership, invitations, contributor approvals. */

export async function createFamily(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Family name is required");
  const sql = getSql();
  const familyId = await sql.begin(async (tx) => {
    const fam = await tx<{ id: string }[]>`
      insert into families (name, created_by) values (${trimmed}, ${userId})
      returning id
    `;
    const id = fam[0]!.id;
    await tx`
      insert into family_members (family_id, user_id, role)
      values (${id}, ${userId}, 'owner')
    `;
    return id;
  });
  return familyId;
}

const INVITABLE_ROLES: FamilyRole[] = ["parent", "contributor", "viewer"];
const INVITE_TTL_DAYS = 14;

export async function createInvitation(opts: {
  userId: string;
  familyId: string;
  email: string;
  role: FamilyRole;
  label?: string;
  message?: string;
}): Promise<{ inviteToken: string; invitationId: string }> {
  await assertFamilyRole(opts.userId, opts.familyId, "parent");
  if (!INVITABLE_ROLES.includes(opts.role)) {
    throw new ValidationError("Members can be invited as parent, contributor, or viewer");
  }
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("That doesn't look like an email address");
  }
  await assertWithinLimit(opts.familyId, "members", 1, "family member");

  const sql = getSql();
  const existing = await sql`
    select 1 from family_members fm join users u on u.id = fm.user_id
    where fm.family_id = ${opts.familyId} and u.email = ${email}
  `;
  if (existing.length > 0) throw new ConflictError("They're already in this family");

  const token = opaqueToken(32);
  const rows = await sql<{ id: string }[]>`
    insert into family_invitations
      (family_id, invited_by, email, role, label, message, token_hash, expires_at)
    values
      (${opts.familyId}, ${opts.userId}, ${email}, ${opts.role},
       ${opts.label ?? null}, ${opts.message?.slice(0, 500) ?? null},
       ${hashToken(token)}, now() + make_interval(days => ${INVITE_TTL_DAYS}))
    returning id
  `;
  await audit({
    familyId: opts.familyId, actorId: opts.userId, action: "invitation.created",
    targetType: "family_invitation", targetId: rows[0]!.id, detail: { role: opts.role },
  });
  return { inviteToken: token, invitationId: rows[0]!.id };
}

export async function acceptInvitation(userId: string, token: string): Promise<{ familyId: string }> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; email: string; role: FamilyRole; label: string | null }[]
  >`
    select id, family_id, email, role, label from family_invitations
    where token_hash = ${hashToken(token)}
      and accepted_at is null and revoked_at is null and expires_at > now()
  `;
  const invite = rows[0];
  if (!invite) throw new NotFoundError("Invitation (it may have expired)");

  const user = await sql<{ email: string }[]>`select email from users where id = ${userId}`;
  if (user[0]?.email.toLowerCase() !== invite.email) {
    throw new ForbiddenError("This invitation was sent to a different email address");
  }

  await sql.begin(async (tx) => {
    await tx`
      insert into family_members (family_id, user_id, role, label)
      values (${invite.family_id}, ${userId}, ${invite.role}, ${invite.label})
      on conflict (family_id, user_id) do nothing
    `;
    await tx`
      update family_invitations set accepted_by = ${userId}, accepted_at = now()
      where id = ${invite.id}
    `;
  });
  await audit({
    familyId: invite.family_id, actorId: userId, action: "invitation.accepted",
    targetType: "family_invitation", targetId: invite.id,
  });
  return { familyId: invite.family_id };
}

export async function revokeInvitation(userId: string, invitationId: string): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ family_id: string }[]>`
    select family_id from family_invitations where id = ${invitationId}
  `;
  if (!rows[0]) throw new NotFoundError("Invitation");
  await assertFamilyRole(userId, rows[0].family_id, "parent");
  await sql`update family_invitations set revoked_at = now() where id = ${invitationId} and accepted_at is null`;
  await audit({
    familyId: rows[0].family_id, actorId: userId, action: "invitation.revoked",
    targetType: "family_invitation", targetId: invitationId,
  });
}

export async function changeMemberRole(opts: {
  userId: string;
  familyId: string;
  memberId: string;
  role: FamilyRole;
}): Promise<void> {
  const ctx = await assertFamilyRole(opts.userId, opts.familyId, "owner");
  const sql = getSql();
  const rows = await sql<{ user_id: string; role: FamilyRole }[]>`
    select user_id, role from family_members
    where id = ${opts.memberId} and family_id = ${opts.familyId}
  `;
  const member = rows[0];
  if (!member) throw new NotFoundError("Member");
  if (member.user_id === ctx.userId && opts.role !== "owner") {
    // owners can't demote themselves into an ownerless family
    const owners = await sql`
      select count(*)::int as n from family_members
      where family_id = ${opts.familyId} and role = 'owner'
    `;
    if (Number(owners[0]?.n ?? 0) <= 1) {
      throw new ConflictError("A family needs at least one owner");
    }
  }
  await sql`
    update family_members set role = ${opts.role}
    where id = ${opts.memberId} and family_id = ${opts.familyId}
  `;
  await audit({
    familyId: opts.familyId, actorId: opts.userId, action: "member.role_changed",
    targetType: "family_member", targetId: opts.memberId, detail: { role: opts.role },
  });
}

export async function removeMember(opts: {
  userId: string;
  familyId: string;
  memberId: string;
}): Promise<void> {
  await assertFamilyRole(opts.userId, opts.familyId, "owner");
  const sql = getSql();
  const rows = await sql<{ user_id: string; role: string }[]>`
    select user_id, role from family_members
    where id = ${opts.memberId} and family_id = ${opts.familyId}
  `;
  const member = rows[0];
  if (!member) throw new NotFoundError("Member");
  if (member.role === "owner") {
    throw new ConflictError("Transfer ownership before removing an owner");
  }
  await sql`delete from family_members where id = ${opts.memberId}`;
  await audit({
    familyId: opts.familyId, actorId: opts.userId, action: "member.removed",
    targetType: "family_member", targetId: opts.memberId,
  });
}

/** Parent approval of contributor submissions (memories and media). */
export async function reviewSubmission(opts: {
  userId: string;
  familyId: string;
  targetType: "memory" | "media";
  targetId: string;
  decision: "approved" | "declined";
}): Promise<void> {
  await assertFamilyRole(opts.userId, opts.familyId, "parent");
  const sql = getSql();
  if (opts.targetType === "memory") {
    const r = await sql`
      update memories set approval_status = ${opts.decision}
      where id = ${opts.targetId} and family_id = ${opts.familyId}
        and approval_status = 'pending'
      returning id, title
    `;
    if (r.length === 0) throw new NotFoundError("Submission");
    if (opts.decision === "approved") {
      await addFeedItem({
        familyId: opts.familyId, actorId: opts.userId, eventType: "memory.approved",
        targetType: "memory", targetId: opts.targetId,
        summary: "A family memory was approved",
      });
    }
  } else {
    const r = await sql`
      update media set approval_status = ${opts.decision}
      where id = ${opts.targetId} and family_id = ${opts.familyId}
        and approval_status = 'pending'
      returning id
    `;
    if (r.length === 0) throw new NotFoundError("Submission");
  }
  await audit({
    familyId: opts.familyId, actorId: opts.userId,
    action: `submission.${opts.decision}`,
    targetType: opts.targetType, targetId: opts.targetId,
  });
}
