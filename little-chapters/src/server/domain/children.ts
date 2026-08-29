import { z } from "zod";
import { getSql } from "@/server/db/client";
import { assertChildAccess, assertFamilyRole } from "@/server/authz";
import { assertWithinLimit } from "@/server/billing/usage";
import { computeAge, formatAge } from "@/lib/age";

/** Child profiles: flexible family structures, ages 0–18+, pregnancy support. */

export const childInputSchema = z.object({
  fullName: z.string().min(1).max(120),
  nickname: z.string().max(60).nullish(),
  pronouns: z.string().max(40).nullish(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  birthTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullish(),
  birthLocation: z.string().max(200).nullish(),
  birthWeightGrams: z.number().int().min(100).max(15000).nullish(),
  birthLengthMm: z.number().int().min(100).max(1000).nullish(),
  status: z.enum(["expected", "active"]).default("active"),
  pregnancyStory: z.string().max(20000).nullish(),
  birthStory: z.string().max(20000).nullish(),
  personalityNotes: z.string().max(20000).nullish(),
});

export type ChildInput = z.infer<typeof childInputSchema>;

export interface ChildSummary {
  id: string;
  familyId: string;
  fullName: string;
  nickname: string | null;
  displayName: string;
  pronouns: string | null;
  birthDate: string | null;
  status: string;
  ageText: string | null;
  profileMediaId: string | null;
}

function toSummary(r: {
  id: string; family_id: string; full_name: string; nickname: string | null;
  pronouns: string | null; birth_date: string | null; status: string;
  profile_media_id: string | null;
}): ChildSummary {
  const birthDate = r.birth_date;
  return {
    id: r.id,
    familyId: r.family_id,
    fullName: r.full_name,
    nickname: r.nickname,
    displayName: r.nickname || r.full_name.split(" ")[0] || r.full_name,
    pronouns: r.pronouns,
    birthDate,
    status: r.status,
    ageText: birthDate ? formatAge(computeAge(new Date(`${birthDate}T00:00:00`))) : null,
    profileMediaId: r.profile_media_id,
  };
}

const CHILD_COLUMNS = `id, family_id, full_name, nickname, pronouns,
  birth_date::text as birth_date, status, profile_media_id`;

export async function createChild(
  userId: string,
  familyId: string,
  input: ChildInput
): Promise<ChildSummary> {
  await assertFamilyRole(userId, familyId, "parent");
  await assertWithinLimit(familyId, "children", 1, "children");
  const sql = getSql();
  const rows = await sql<never[]>`
    insert into children
      (family_id, full_name, nickname, pronouns, birth_date, due_date, birth_time,
       birth_location, birth_weight_grams, birth_length_mm, status,
       pregnancy_story, birth_story, personality_notes)
    values
      (${familyId}, ${input.fullName}, ${input.nickname ?? null}, ${input.pronouns ?? null},
       ${input.birthDate ?? null}, ${input.dueDate ?? null}, ${input.birthTime ?? null},
       ${input.birthLocation ?? null}, ${input.birthWeightGrams ?? null},
       ${input.birthLengthMm ?? null}, ${input.status},
       ${input.pregnancyStory ?? null}, ${input.birthStory ?? null},
       ${input.personalityNotes ?? null})
    returning ${sql.unsafe(CHILD_COLUMNS)}
  `;
  return toSummary(rows[0]!);
}

export async function updateChild(
  userId: string,
  childId: string,
  input: Partial<ChildInput>
): Promise<void> {
  await assertChildAccess(userId, childId, "parent");
  const sql = getSql();
  await sql`
    update children set
      full_name = coalesce(${input.fullName ?? null}, full_name),
      nickname = coalesce(${input.nickname ?? null}, nickname),
      pronouns = coalesce(${input.pronouns ?? null}, pronouns),
      birth_date = coalesce(${input.birthDate ?? null}, birth_date),
      due_date = coalesce(${input.dueDate ?? null}, due_date),
      birth_time = coalesce(${input.birthTime ?? null}, birth_time),
      birth_location = coalesce(${input.birthLocation ?? null}, birth_location),
      birth_weight_grams = coalesce(${input.birthWeightGrams ?? null}, birth_weight_grams),
      birth_length_mm = coalesce(${input.birthLengthMm ?? null}, birth_length_mm),
      status = coalesce(${input.status ?? null}, status),
      pregnancy_story = coalesce(${input.pregnancyStory ?? null}, pregnancy_story),
      birth_story = coalesce(${input.birthStory ?? null}, birth_story),
      personality_notes = coalesce(${input.personalityNotes ?? null}, personality_notes)
    where id = ${childId} and deleted_at is null
  `;
}

export async function listChildren(userId: string, familyId: string): Promise<ChildSummary[]> {
  await assertFamilyRole(userId, familyId, "viewer");
  const sql = getSql();
  const rows = await sql<never[]>`
    select ${sql.unsafe(CHILD_COLUMNS)} from children
    where family_id = ${familyId} and deleted_at is null
    order by sort_order, created_at
  `;
  return rows.map(toSummary);
}

export async function getChild(userId: string, childId: string): Promise<
  ChildSummary & {
    dueDate: string | null;
    birthTime: string | null;
    birthLocation: string | null;
    birthWeightGrams: number | null;
    birthLengthMm: number | null;
    pregnancyStory: string | null;
    birthStory: string | null;
    personalityNotes: string | null;
  }
> {
  await assertChildAccess(userId, childId, "viewer");
  const sql = getSql();
  const rows = await sql<never[]>`
    select ${sql.unsafe(CHILD_COLUMNS)},
      due_date::text as due_date, birth_time::text as birth_time, birth_location,
      birth_weight_grams, birth_length_mm, pregnancy_story, birth_story, personality_notes
    from children where id = ${childId} and deleted_at is null
  `;
  const r = rows[0]! as never as {
    id: string; family_id: string; full_name: string; nickname: string | null;
    pronouns: string | null; birth_date: string | null; status: string;
    profile_media_id: string | null; due_date: string | null; birth_time: string | null;
    birth_location: string | null; birth_weight_grams: number | null;
    birth_length_mm: number | null; pregnancy_story: string | null;
    birth_story: string | null; personality_notes: string | null;
  };
  return {
    ...toSummary(r),
    dueDate: r.due_date,
    birthTime: r.birth_time,
    birthLocation: r.birth_location,
    birthWeightGrams: r.birth_weight_grams,
    birthLengthMm: r.birth_length_mm,
    pregnancyStory: r.pregnancy_story,
    birthStory: r.birth_story,
    personalityNotes: r.personality_notes,
  };
}
