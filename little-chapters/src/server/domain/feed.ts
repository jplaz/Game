import { getSql } from "@/server/db/client";
import { assertFamilyRole } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";

/** Private family feed, comments, reactions. Intimate by design: no public
 *  mechanics, no follower counts, chronological only. */

export async function addFeedItem(opts: {
  familyId: string;
  actorId?: string | null;
  eventType: string;
  targetType?: string;
  targetId?: string;
  summary: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    insert into feed_items (family_id, actor_id, event_type, target_type, target_id, summary)
    values (${opts.familyId}, ${opts.actorId ?? null}, ${opts.eventType},
            ${opts.targetType ?? null}, ${opts.targetId ?? null}, ${opts.summary})
  `;
}

export interface FeedEntry {
  id: number;
  actorName: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  createdAt: Date;
}

export async function getFeed(
  userId: string,
  familyId: string,
  opts: { before?: number; limit?: number } = {}
): Promise<FeedEntry[]> {
  await assertFamilyRole(userId, familyId, "viewer");
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 30, 100);
  const rows = await sql<
    { id: string; display_name: string | null; event_type: string; target_type: string | null;
      target_id: string | null; summary: string; created_at: Date }[]
  >`
    select fi.id, u.display_name, fi.event_type, fi.target_type, fi.target_id,
           fi.summary, fi.created_at
    from feed_items fi
    left join users u on u.id = fi.actor_id
    where fi.family_id = ${familyId}
      and (${opts.before ?? null}::bigint is null or fi.id < ${opts.before ?? 0})
    order by fi.id desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    actorName: r.display_name,
    eventType: r.event_type,
    targetType: r.target_type,
    targetId: r.target_id,
    summary: r.summary,
    createdAt: r.created_at,
  }));
}

const COMMENTABLE = ["memory", "media", "chapter", "recap", "letter"] as const;
type CommentTarget = (typeof COMMENTABLE)[number];

async function assertTargetInFamily(
  targetType: CommentTarget,
  targetId: string,
  familyId: string
): Promise<void> {
  const sql = getSql();
  const table =
    targetType === "memory" ? "memories"
    : targetType === "media" ? "media"
    : targetType === "chapter" ? "chapters"
    : targetType === "recap" ? "video_recaps"
    : "letters";
  const rows = await sql`
    select 1 from ${sql(table)} where id = ${targetId} and family_id = ${familyId}
  `;
  if (rows.length === 0) throw new NotFoundError();
}

export async function addComment(opts: {
  userId: string;
  familyId: string;
  targetType: CommentTarget;
  targetId: string;
  body: string;
}): Promise<string> {
  await assertFamilyRole(opts.userId, opts.familyId, "viewer");
  const body = opts.body.trim();
  if (!body || body.length > 4000) throw new ValidationError("Comment must be 1–4000 characters");
  await assertTargetInFamily(opts.targetType, opts.targetId, opts.familyId);

  const sql = getSql();
  if (opts.targetType === "memory") {
    const enabled = await sql<{ comments_enabled: boolean }[]>`
      select comments_enabled from memories where id = ${opts.targetId}
    `;
    if (enabled[0] && !enabled[0].comments_enabled) {
      throw new ValidationError("Comments are turned off for this memory");
    }
  }
  const rows = await sql<{ id: string }[]>`
    insert into comments (family_id, author_id, target_type, target_id, body)
    values (${opts.familyId}, ${opts.userId}, ${opts.targetType}, ${opts.targetId}, ${body})
    returning id
  `;
  await addFeedItem({
    familyId: opts.familyId, actorId: opts.userId, eventType: "comment.added",
    targetType: opts.targetType, targetId: opts.targetId,
    summary: "left a comment",
  });
  return rows[0]!.id;
}

export async function toggleReaction(opts: {
  userId: string;
  familyId: string;
  targetType: "memory" | "media" | "chapter" | "recap" | "comment";
  targetId: string;
  emoji: "❤️" | "😂" | "🥹" | "🎉";
}): Promise<{ added: boolean }> {
  await assertFamilyRole(opts.userId, opts.familyId, "viewer");
  const sql = getSql();
  if (opts.targetType !== "comment") {
    await assertTargetInFamily(opts.targetType, opts.targetId, opts.familyId);
  } else {
    const rows = await sql`
      select 1 from comments where id = ${opts.targetId} and family_id = ${opts.familyId}
    `;
    if (rows.length === 0) throw new NotFoundError();
  }
  const deleted = await sql`
    delete from reactions
    where author_id = ${opts.userId} and target_type = ${opts.targetType}
      and target_id = ${opts.targetId} and emoji = ${opts.emoji}
    returning id
  `;
  if (deleted.length > 0) return { added: false };
  await sql`
    insert into reactions (family_id, author_id, target_type, target_id, emoji)
    values (${opts.familyId}, ${opts.userId}, ${opts.targetType}, ${opts.targetId}, ${opts.emoji})
    on conflict do nothing
  `;
  return { added: true };
}

export async function getComments(
  userId: string,
  familyId: string,
  targetType: CommentTarget,
  targetId: string
): Promise<Array<{ id: string; authorName: string; body: string; createdAt: Date }>> {
  await assertFamilyRole(userId, familyId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; display_name: string; email: string; body: string; created_at: Date }[]
  >`
    select c.id, u.display_name, u.email, c.body, c.created_at
    from comments c join users u on u.id = c.author_id
    where c.family_id = ${familyId} and c.target_type = ${targetType}
      and c.target_id = ${targetId} and c.deleted_at is null
    order by c.created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    authorName: r.display_name || r.email.split("@")[0] || "Family member",
    body: r.body,
    createdAt: r.created_at,
  }));
}
