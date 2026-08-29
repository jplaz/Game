import { getSql } from "@/server/db/client";
import { assertChildAccess } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";
import { addFeedItem } from "@/server/domain/feed";

/**
 * Milestones: memory preservation, never assessment.
 * AI/worker proposals live as status='suggested' and appear nowhere except
 * the parent's review queue until confirmed.
 */

const CATEGORIES = [
  "movement", "communication", "food", "sleep", "social", "travel",
  "holidays", "family", "personality", "firsts", "custom",
] as const;

export async function createMilestone(opts: {
  userId: string;
  childId: string;
  title: string;
  category: (typeof CATEGORIES)[number];
  happenedAt: string;
  memoryId?: string | null;
}): Promise<string> {
  const ctx = await assertChildAccess(opts.userId, opts.childId, "parent");
  const title = opts.title.trim();
  if (!title) throw new ValidationError("Milestone needs a title");
  if (!CATEGORIES.includes(opts.category)) throw new ValidationError("Unknown category");
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into milestones
      (family_id, child_id, title, category, happened_at, memory_id, status, created_by)
    values
      (${ctx.familyId}, ${opts.childId}, ${title}, ${opts.category},
       ${opts.happenedAt}, ${opts.memoryId ?? null}, 'confirmed', ${opts.userId})
    returning id
  `;
  await addFeedItem({
    familyId: ctx.familyId, actorId: opts.userId, eventType: "milestone.confirmed",
    targetType: "milestone", targetId: rows[0]!.id, summary: `added a milestone: ${title}`,
  });
  return rows[0]!.id;
}

export async function reviewMilestoneSuggestion(opts: {
  userId: string;
  milestoneId: string;
  decision: "confirmed" | "dismissed";
  happenedAt?: string;   // parent may correct the date while confirming
  title?: string;        // …or the wording
}): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ child_id: string; family_id: string; title: string }[]>`
    select child_id, family_id, title from milestones
    where id = ${opts.milestoneId} and status = 'suggested'
  `;
  const suggestion = rows[0];
  if (!suggestion) throw new NotFoundError("Suggestion");
  await assertChildAccess(opts.userId, suggestion.child_id, "parent");
  await sql`
    update milestones set
      status = ${opts.decision},
      happened_at = coalesce(${opts.happenedAt ?? null}, happened_at),
      title = coalesce(${opts.title?.trim() || null}, title),
      created_by = ${opts.userId}
    where id = ${opts.milestoneId}
  `;
  if (opts.decision === "confirmed") {
    await addFeedItem({
      familyId: suggestion.family_id, actorId: opts.userId,
      eventType: "milestone.confirmed", targetType: "milestone",
      targetId: opts.milestoneId,
      summary: `confirmed a milestone: ${opts.title?.trim() || suggestion.title}`,
    });
  }
}

export interface MilestoneRow {
  id: string;
  title: string;
  category: string;
  happenedAt: string;
  status: string;
  suggestedReason: string | null;
  memoryId: string | null;
}

export async function listMilestones(
  userId: string,
  childId: string,
  opts: { includeSuggested?: boolean } = {}
): Promise<MilestoneRow[]> {
  const ctx = await assertChildAccess(userId, childId, "viewer");
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  const includeSuggested = Boolean(opts.includeSuggested) && isParent;
  const sql = getSql();
  const rows = await sql<
    { id: string; title: string; category: string; happened_at: string; status: string;
      suggested_reason: string | null; memory_id: string | null }[]
  >`
    select id, title, category, happened_at::text as happened_at, status,
           suggested_reason, memory_id
    from milestones
    where child_id = ${childId}
      and (status = 'confirmed' or (${includeSuggested} and status = 'suggested'))
    order by happened_at, created_at
  `;
  return rows.map((r) => ({
    id: r.id, title: r.title, category: r.category, happenedAt: r.happened_at,
    status: r.status, suggestedReason: r.suggested_reason, memoryId: r.memory_id,
  }));
}

/** Growth entries: optional, display-only, no medical interpretation. */
export async function addGrowthEntry(opts: {
  userId: string;
  childId: string;
  measuredAt: string;
  weightGrams?: number | null;
  heightMm?: number | null;
  headCircumferenceMm?: number | null;
  clothingSize?: string | null;
  shoeSize?: string | null;
  diaperSize?: string | null;
  note?: string | null;
}): Promise<string> {
  const ctx = await assertChildAccess(opts.userId, opts.childId, "parent");
  if (
    !opts.weightGrams && !opts.heightMm && !opts.headCircumferenceMm &&
    !opts.clothingSize && !opts.shoeSize && !opts.diaperSize
  ) {
    throw new ValidationError("Add at least one measurement or size");
  }
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into growth_entries
      (family_id, child_id, measured_at, weight_grams, height_mm,
       head_circumference_mm, clothing_size, shoe_size, diaper_size, note, created_by)
    values
      (${ctx.familyId}, ${opts.childId}, ${opts.measuredAt},
       ${opts.weightGrams ?? null}, ${opts.heightMm ?? null},
       ${opts.headCircumferenceMm ?? null}, ${opts.clothingSize ?? null},
       ${opts.shoeSize ?? null}, ${opts.diaperSize ?? null},
       ${opts.note ?? null}, ${opts.userId})
    returning id
  `;
  return rows[0]!.id;
}

export async function listGrowthEntries(
  userId: string,
  childId: string
): Promise<
  Array<{
    id: string; measuredAt: string; weightGrams: number | null; heightMm: number | null;
    headCircumferenceMm: number | null; clothingSize: string | null;
    shoeSize: string | null; diaperSize: string | null; note: string | null;
  }>
> {
  await assertChildAccess(userId, childId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; measured_at: string; weight_grams: number | null; height_mm: number | null;
      head_circumference_mm: number | null; clothing_size: string | null;
      shoe_size: string | null; diaper_size: string | null; note: string | null }[]
  >`
    select id, measured_at::text as measured_at, weight_grams, height_mm,
           head_circumference_mm, clothing_size, shoe_size, diaper_size, note
    from growth_entries where child_id = ${childId}
    order by measured_at
  `;
  return rows.map((r) => ({
    id: r.id, measuredAt: r.measured_at, weightGrams: r.weight_grams,
    heightMm: r.height_mm, headCircumferenceMm: r.head_circumference_mm,
    clothingSize: r.clothing_size, shoeSize: r.shoe_size,
    diaperSize: r.diaper_size, note: r.note,
  }));
}
