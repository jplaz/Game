import { getSql } from "@/server/db/client";
import { assertFamilyRole, assertResourceAccess, type FamilyScopedTable } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";
import { hashPassword, hashToken, opaqueToken, verifyPassword } from "@/lib/tokens";
import { audit } from "@/server/observability/audit";
import { env } from "@/server/env";

/**
 * Share links: opaque, revocable, default family-only, never indexable.
 * Tokens are stored hashed; the raw token exists only in the URL the owner
 * copies. Policy is re-evaluated on every resolution.
 */

const TARGET_TABLES: Record<string, FamilyScopedTable> = {
  chapter: "chapters",
  memory: "memories",
  book: "books",
  recap: "video_recaps",
};

export async function createShareLink(opts: {
  userId: string;
  familyId: string;
  targetType: "chapter" | "memory" | "book" | "recap";
  targetId: string;
  visibility: "family" | "link" | "password";
  password?: string;
  expiresAt?: string | null;
  allowDownload?: boolean;
  allowComments?: boolean;
}): Promise<{ shareUrl: string; shareLinkId: string }> {
  await assertFamilyRole(opts.userId, opts.familyId, "parent");
  const table = TARGET_TABLES[opts.targetType];
  if (!table) throw new ValidationError("Unknown share target");
  const ctx = await assertResourceAccess(opts.userId, table, opts.targetId, "parent");
  if (ctx.familyId !== opts.familyId) throw new NotFoundError();

  let passwordHash: string | null = null;
  let passwordSalt: string | null = null;
  if (opts.visibility === "password") {
    if (!opts.password || opts.password.length < 4) {
      throw new ValidationError("Password must be at least 4 characters");
    }
    const hashed = hashPassword(opts.password);
    passwordHash = hashed.hash;
    passwordSalt = hashed.salt;
  }

  const token = opaqueToken(26);
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into share_links
      (family_id, created_by, target_type, target_id, token_hash, visibility,
       password_hash, password_salt, expires_at, allow_download, allow_comments)
    values
      (${opts.familyId}, ${opts.userId}, ${opts.targetType}, ${opts.targetId},
       ${hashToken(token)}, ${opts.visibility}, ${passwordHash}, ${passwordSalt},
       ${opts.expiresAt ?? null}, ${opts.allowDownload ?? false}, ${opts.allowComments ?? false})
    returning id
  `;
  await audit({
    familyId: opts.familyId, actorId: opts.userId, action: "share_link.created",
    targetType: "share_link", targetId: rows[0]!.id,
    detail: { visibility: opts.visibility, target: opts.targetType },
  });
  return {
    shareLinkId: rows[0]!.id,
    shareUrl: `${env().NEXT_PUBLIC_APP_URL}/s/${token}`,
  };
}

export interface ResolvedShare {
  shareLinkId: string;
  familyId: string;
  targetType: string;
  targetId: string;
  allowDownload: boolean;
  allowComments: boolean;
  /** what the viewer still needs to provide */
  requires: "none" | "password" | "family_auth";
}

export async function resolveShareLink(
  token: string,
  opts: { password?: string; viewerUserId?: string | null } = {}
): Promise<ResolvedShare> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; target_type: string; target_id: string;
      visibility: string; password_hash: string | null; password_salt: string | null;
      expires_at: Date | null; revoked_at: Date | null;
      allow_download: boolean; allow_comments: boolean }[]
  >`
    select id, family_id, target_type, target_id, visibility, password_hash,
           password_salt, expires_at, revoked_at, allow_download, allow_comments
    from share_links where token_hash = ${hashToken(token)}
  `;
  const link = rows[0];
  if (!link || link.revoked_at) throw new NotFoundError("This link is no longer available");
  if (link.expires_at && link.expires_at < new Date()) {
    throw new NotFoundError("This link has expired");
  }

  let requires: ResolvedShare["requires"] = "none";
  if (link.visibility === "family") {
    if (!opts.viewerUserId) {
      requires = "family_auth";
    } else {
      const member = await sql`
        select 1 from family_members
        where family_id = ${link.family_id} and user_id = ${opts.viewerUserId}
      `;
      if (member.length === 0) throw new NotFoundError("This link is for family members");
    }
  } else if (link.visibility === "password") {
    if (!opts.password) {
      requires = "password";
    } else if (
      !link.password_hash || !link.password_salt ||
      !verifyPassword(opts.password, link.password_hash, link.password_salt)
    ) {
      throw new NotFoundError("That password isn't right");
    }
  }

  if (requires === "none") {
    await sql`
      update share_links set view_count = view_count + 1, last_viewed_at = now()
      where id = ${link.id}
    `;
  }
  return {
    shareLinkId: link.id,
    familyId: link.family_id,
    targetType: link.target_type,
    targetId: link.target_id,
    allowDownload: link.allow_download,
    allowComments: link.allow_comments,
    requires,
  };
}

export async function revokeShareLink(userId: string, shareLinkId: string): Promise<void> {
  const ctx = await assertResourceAccess(userId, "share_links", shareLinkId, "parent");
  const sql = getSql();
  await sql`update share_links set revoked_at = now() where id = ${shareLinkId}`;
  await audit({
    familyId: ctx.familyId, actorId: userId, action: "share_link.revoked",
    targetType: "share_link", targetId: shareLinkId,
  });
}

export async function listShareLinks(
  userId: string,
  familyId: string
): Promise<Array<{
  id: string; targetType: string; targetId: string; visibility: string;
  expiresAt: Date | null; revokedAt: Date | null; viewCount: number; createdAt: Date;
}>> {
  await assertFamilyRole(userId, familyId, "parent");
  const sql = getSql();
  const rows = await sql<
    { id: string; target_type: string; target_id: string; visibility: string;
      expires_at: Date | null; revoked_at: Date | null; view_count: number; created_at: Date }[]
  >`
    select id, target_type, target_id, visibility, expires_at, revoked_at,
           view_count, created_at
    from share_links where family_id = ${familyId}
    order by created_at desc limit 200
  `;
  return rows.map((r) => ({
    id: r.id, targetType: r.target_type, targetId: r.target_id,
    visibility: r.visibility, expiresAt: r.expires_at, revokedAt: r.revoked_at,
    viewCount: r.view_count, createdAt: r.created_at,
  }));
}
