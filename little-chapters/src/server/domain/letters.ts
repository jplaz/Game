import { getSql } from "@/server/db/client";
import { assertChildAccess, assertResourceAccess } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Letters: birthday, annual, future ("Open on your 10th birthday"), general.
 * Future letters stay sealed — visible only to their author — until unlock_at.
 */

type LetterKind =
  | "birthday" | "annual" | "future" | "first_day_of_school" | "graduation" | "general";

export async function createLetter(opts: {
  userId: string;
  childId: string;
  kind: LetterKind;
  title: string;
  body: string;
  unlockAt?: string | null;
  unlockLabel?: string | null;
}): Promise<string> {
  const ctx = await assertChildAccess(opts.userId, opts.childId, "contributor");
  const title = opts.title.trim();
  const body = opts.body.trim();
  if (!title || !body) throw new ValidationError("A letter needs a title and some words");
  if (opts.kind === "future" && !opts.unlockAt) {
    throw new ValidationError("Choose when this letter should open");
  }
  if (opts.unlockAt && new Date(`${opts.unlockAt}T00:00:00`) <= new Date()) {
    throw new ValidationError("The unlock date must be in the future");
  }
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into letters
      (family_id, child_id, author_id, kind, title, body, unlock_at, unlock_label)
    values
      (${ctx.familyId}, ${opts.childId}, ${opts.userId}, ${opts.kind},
       ${title}, ${body}, ${opts.unlockAt ?? null}, ${opts.unlockLabel ?? null})
    returning id
  `;
  return rows[0]!.id;
}

export interface LetterRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;   // null when sealed for this viewer
  authorName: string;
  isAuthor: boolean;
  unlockAt: string | null;
  unlockLabel: string | null;
  sealed: boolean;
  createdAt: Date;
}

export async function listLetters(userId: string, childId: string): Promise<LetterRow[]> {
  await assertChildAccess(userId, childId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; kind: string; title: string; body: string; author_id: string;
      display_name: string; email: string; unlock_at: string | null;
      unlock_label: string | null; created_at: Date }[]
  >`
    select l.id, l.kind, l.title, l.body, l.author_id, u.display_name, u.email,
           l.unlock_at::text as unlock_at, l.unlock_label, l.created_at
    from letters l join users u on u.id = l.author_id
    where l.child_id = ${childId} and l.deleted_at is null
    order by l.created_at desc
  `;
  const today = new Date();
  return rows.map((r) => {
    const sealed =
      r.unlock_at !== null &&
      new Date(`${r.unlock_at}T00:00:00`) > today &&
      r.author_id !== userId;
    return {
      id: r.id,
      kind: r.kind,
      title: sealed ? (r.unlock_label ?? "A sealed letter") : r.title,
      body: sealed ? null : r.body,
      authorName: r.display_name || r.email.split("@")[0] || "Family",
      isAuthor: r.author_id === userId,
      unlockAt: r.unlock_at,
      unlockLabel: r.unlock_label,
      sealed,
      createdAt: r.created_at,
    };
  });
}

export async function deleteLetter(userId: string, letterId: string): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ author_id: string; family_id: string }[]>`
    select author_id, family_id from letters where id = ${letterId} and deleted_at is null
  `;
  const letter = rows[0];
  if (!letter) throw new NotFoundError("Letter");
  if (letter.author_id !== userId) {
    // only the author or the family owner may remove a letter
    await assertResourceAccess(userId, "letters", letterId, "owner");
  }
  await sql`update letters set deleted_at = now() where id = ${letterId}`;
}
