import { z } from "zod";
import { getSql } from "@/server/db/client";
import { assertChildAccess, assertResourceAccess } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";
import { runAiTask } from "@/server/ai/run";
import { rewriteMemoryTask } from "@/server/ai/tasks/writing";
import { milestoneSuggestTask } from "@/server/ai/tasks/suggestions";
import { computeAge, formatAge } from "@/lib/age";
import { addFeedItem } from "@/server/domain/feed";
import { enqueueJob } from "@/server/jobs/queue";

/**
 * Memories: the atomic unit of the archive.
 * The parent's original words are always preserved in memory_versions;
 * AI keepsake versions are drafts until explicitly accepted.
 */

export const memoryInputSchema = z.object({
  childId: z.string().uuid(),
  kind: z
    .enum(["moment", "milestone", "voice", "growth", "event", "trip", "holiday", "first", "pregnancy"])
    .default("moment"),
  title: z.string().max(200).nullish(),
  body: z.string().max(20000).nullish(),
  happenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string().max(40)).max(20).default([]),
  mediaIds: z.array(z.string().uuid()).max(200).default([]),
  personIds: z.array(z.string().uuid()).max(50).default([]),
  requestKeepsakeDraft: z.boolean().default(false),
});

export type MemoryInput = z.infer<typeof memoryInputSchema>;

export interface CreatedMemory {
  memoryId: string;
  keepsakeDraft: { text: string; title: string; generationId: string | null; isFallback: boolean } | null;
  milestoneSuggestions: Array<{ id: string; title: string; category: string; reason: string }>;
}

export async function createMemory(userId: string, input: MemoryInput): Promise<CreatedMemory> {
  const ctx = await assertChildAccess(userId, input.childId, "contributor");
  if (!input.body?.trim() && input.mediaIds.length === 0) {
    throw new ValidationError("A memory needs some words or at least one photo/video");
  }
  const sql = getSql();
  const approval = ctx.role === "contributor" ? "pending" : "approved";

  const memoryId = await sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into memories
        (family_id, child_id, created_by, kind, title, body, happened_at, tags, approval_status)
      values
        (${ctx.familyId}, ${input.childId}, ${userId}, ${input.kind},
         ${input.title ?? null}, ${input.body?.trim() ?? null}, ${input.happenedAt},
         ${input.tags}, ${approval})
      returning id
    `;
    const id = rows[0]!.id;
    if (input.body?.trim()) {
      await tx`
        insert into memory_versions (memory_id, source, title, body, created_by)
        values (${id}, 'user', ${input.title ?? null}, ${input.body.trim()}, ${userId})
      `;
    }
    for (const [i, mediaId] of input.mediaIds.entries()) {
      // only attach media belonging to the same family
      await tx`
        insert into memory_media (memory_id, media_id, sort_order)
        select ${id}, m.id, ${i} from media m
        where m.id = ${mediaId} and m.family_id = ${ctx.familyId} and m.deleted_at is null
        on conflict do nothing
      `;
    }
    for (const personId of input.personIds) {
      await tx`
        insert into memory_people (memory_id, person_id)
        select ${id}, p.id from people p
        where p.id = ${personId} and p.family_id = ${ctx.familyId} and p.deleted_at is null
        on conflict do nothing
      `;
    }
    return id;
  });

  await addFeedItem({
    familyId: ctx.familyId, actorId: userId,
    eventType: approval === "pending" ? "memory.submitted" : "memory.created",
    targetType: "memory", targetId: memoryId,
    summary: approval === "pending" ? "added a memory for review" : "added a memory",
  });

  const child = await getChildBasics(input.childId);
  const ageText = child.birthDate
    ? formatAge(computeAge(new Date(`${child.birthDate}T00:00:00`), new Date(`${input.happenedAt}T00:00:00`)))
    : "";

  // optional AI keepsake draft (never auto-applied)
  let keepsakeDraft: CreatedMemory["keepsakeDraft"] = null;
  if (input.requestKeepsakeDraft && input.body?.trim()) {
    const result = await runAiTask(
      rewriteMemoryTask,
      {
        childName: child.displayName,
        childPronouns: child.pronouns,
        ageText,
        originalText: input.body.trim(),
      },
      { familyId: ctx.familyId, childId: input.childId, userId }
    );
    keepsakeDraft = {
      text: result.output.keepsakeText,
      title: result.output.suggestedTitle,
      generationId: result.generationId,
      isFallback: result.isFallback,
    };
    if (keepsakeDraft.generationId) {
      await sql`
        insert into memory_versions (memory_id, source, title, body, ai_generation_id)
        values (${memoryId}, 'ai', ${keepsakeDraft.title}, ${keepsakeDraft.text}, ${keepsakeDraft.generationId})
      `;
    }
  }

  // milestone suggestions (status='suggested'; invisible until confirmed)
  const milestoneSuggestions = input.body?.trim()
    ? await suggestMilestones({
        familyId: ctx.familyId, childId: input.childId, memoryId,
        childName: child.displayName, ageText, memoryText: input.body.trim(),
        happenedAt: input.happenedAt,
      })
    : [];

  return { memoryId, keepsakeDraft, milestoneSuggestions };
}

async function getChildBasics(childId: string): Promise<{
  displayName: string;
  pronouns: string | null;
  birthDate: string | null;
}> {
  const sql = getSql();
  const rows = await sql<
    { full_name: string; nickname: string | null; pronouns: string | null; birth_date: string | null }[]
  >`
    select full_name, nickname, pronouns, birth_date::text as birth_date
    from children where id = ${childId}
  `;
  const c = rows[0];
  if (!c) throw new NotFoundError("Child");
  return {
    displayName: c.nickname || c.full_name.split(" ")[0] || c.full_name,
    pronouns: c.pronouns,
    birthDate: c.birth_date,
  };
}

async function suggestMilestones(opts: {
  familyId: string;
  childId: string;
  memoryId: string;
  childName: string;
  ageText: string;
  memoryText: string;
  happenedAt: string;
}): Promise<Array<{ id: string; title: string; category: string; reason: string }>> {
  const sql = getSql();
  const catalog = await sql<{ slug: string; title: string; category: string; id: string }[]>`
    select id, slug, title, category from milestone_catalog
    where family_id is null or family_id = ${opts.familyId}
  `;
  const result = await runAiTask(
    milestoneSuggestTask,
    {
      childName: opts.childName,
      ageText: opts.ageText,
      memoryText: opts.memoryText,
      catalog: catalog.map((c) => ({ slug: c.slug, title: c.title, category: c.category })),
    },
    { familyId: opts.familyId, childId: opts.childId }
  );

  const created: Array<{ id: string; title: string; category: string; reason: string }> = [];
  for (const suggestion of result.output.suggestions) {
    const catalogRow = suggestion.catalogSlug
      ? catalog.find((c) => c.slug === suggestion.catalogSlug)
      : undefined;
    // skip duplicates of already-recorded milestones for this child
    const existing = await sql`
      select 1 from milestones
      where child_id = ${opts.childId} and title = ${suggestion.title}
        and status in ('suggested','confirmed')
    `;
    if (existing.length > 0) continue;
    const rows = await sql<{ id: string }[]>`
      insert into milestones
        (family_id, child_id, catalog_id, title, category, happened_at, memory_id,
         status, suggested_reason)
      values
        (${opts.familyId}, ${opts.childId}, ${catalogRow?.id ?? null},
         ${suggestion.title}, ${suggestion.category}, ${opts.happenedAt},
         ${opts.memoryId}, 'suggested', ${suggestion.reason})
      returning id
    `;
    created.push({
      id: rows[0]!.id,
      title: suggestion.title,
      category: suggestion.category,
      reason: suggestion.reason,
    });
  }
  return created;
}

/** Accept an AI keepsake version (or any stored version) as the display text. */
export async function acceptMemoryVersion(
  userId: string,
  memoryId: string,
  versionId: string
): Promise<void> {
  const ctx = await assertResourceAccess(userId, "memories", memoryId, "parent");
  const sql = getSql();
  const rows = await sql<{ title: string | null; body: string | null; source: string }[]>`
    select title, body, source from memory_versions
    where id = ${versionId} and memory_id = ${memoryId}
  `;
  const version = rows[0];
  if (!version) throw new NotFoundError("Version");
  await sql.begin(async (tx) => {
    await tx`
      update memories set
        title = coalesce(${version.title}, title),
        body = ${version.body}
      where id = ${memoryId} and family_id = ${ctx.familyId}
    `;
    if (version.source === "ai") {
      await tx`
        update ai_generations set accepted = true
        where id = (select ai_generation_id from memory_versions where id = ${versionId})
      `;
    }
  });
}

export async function updateMemory(opts: {
  userId: string;
  memoryId: string;
  title?: string | null;
  body?: string | null;
  happenedAt?: string;
  tags?: string[];
  isFavorite?: boolean;
  commentsEnabled?: boolean;
}): Promise<void> {
  const ctx = await assertResourceAccess(opts.userId, "memories", opts.memoryId, "parent");
  const sql = getSql();
  if (opts.body !== undefined && opts.body !== null) {
    await sql`
      insert into memory_versions (memory_id, source, title, body, created_by)
      values (${opts.memoryId}, 'user', ${opts.title ?? null}, ${opts.body}, ${opts.userId})
    `;
  }
  await sql`
    update memories set
      title = coalesce(${opts.title ?? null}, title),
      body = coalesce(${opts.body ?? null}, body),
      happened_at = coalesce(${opts.happenedAt ?? null}, happened_at),
      tags = coalesce(${opts.tags ?? null}, tags),
      is_favorite = coalesce(${opts.isFavorite ?? null}, is_favorite),
      comments_enabled = coalesce(${opts.commentsEnabled ?? null}, comments_enabled)
    where id = ${opts.memoryId} and family_id = ${ctx.familyId} and deleted_at is null
  `;
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const ctx = await assertResourceAccess(userId, "memories", memoryId, "parent");
  const sql = getSql();
  await sql`
    update memories set deleted_at = now()
    where id = ${memoryId} and family_id = ${ctx.familyId}
  `;
}

/**
 * Voice memory: created after the audio upload completes. Transcription runs
 * as a background job; the memory carries the audio and fills in text later.
 */
export async function createVoiceMemory(opts: {
  userId: string;
  childId: string;
  audioMediaId: string;
  happenedAt: string;
}): Promise<{ memoryId: string }> {
  const ctx = await assertChildAccess(opts.userId, opts.childId, "contributor");
  const sql = getSql();
  const media = await sql<{ id: string; kind: string }[]>`
    select id, kind from media
    where id = ${opts.audioMediaId} and family_id = ${ctx.familyId} and deleted_at is null
  `;
  if (!media[0] || media[0].kind !== "audio") throw new NotFoundError("Recording");

  const approval = ctx.role === "contributor" ? "pending" : "approved";
  const rows = await sql<{ id: string }[]>`
    insert into memories
      (family_id, child_id, created_by, kind, happened_at, audio_media_id, approval_status, title)
    values
      (${ctx.familyId}, ${opts.childId}, ${opts.userId}, 'voice', ${opts.happenedAt},
       ${opts.audioMediaId}, ${approval}, 'Voice memory')
    returning id
  `;
  const memoryId = rows[0]!.id;
  await enqueueJob({
    type: "voice.transcribe",
    familyId: ctx.familyId,
    payload: { memoryId, audioMediaId: opts.audioMediaId },
    idempotencyKey: `transcribe:${memoryId}`,
    priority: 3,
  });
  await addFeedItem({
    familyId: ctx.familyId, actorId: opts.userId, eventType: "memory.voice",
    targetType: "memory", targetId: memoryId, summary: "recorded a voice memory",
  });
  return { memoryId };
}

export interface MemoryDetail {
  id: string;
  familyId: string;
  childId: string;
  kind: string;
  title: string | null;
  body: string | null;
  transcript: string | null;
  happenedAt: string;
  ageText: string | null;
  tags: string[];
  isFavorite: boolean;
  commentsEnabled: boolean;
  approvalStatus: string;
  audioMediaId: string | null;
  media: Array<{ id: string; kind: string; altText: string | null }>;
  people: Array<{ id: string; name: string }>;
  versions: Array<{ id: string; source: string; title: string | null; body: string | null; createdAt: Date }>;
  milestones: Array<{ id: string; title: string; status: string }>;
  canEdit: boolean;
}

export async function getMemory(userId: string, memoryId: string): Promise<MemoryDetail> {
  const ctx = await assertResourceAccess(userId, "memories", memoryId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; child_id: string; kind: string; title: string | null;
      body: string | null; transcript: string | null; happened_at: string; tags: string[];
      is_favorite: boolean; comments_enabled: boolean; approval_status: string;
      audio_media_id: string | null; created_by: string; birth_date: string | null }[]
  >`
    select m.id, m.family_id, m.child_id, m.kind, m.title, m.body, m.transcript,
           m.happened_at::text as happened_at, m.tags, m.is_favorite,
           m.comments_enabled, m.approval_status, m.audio_media_id, m.created_by,
           c.birth_date::text as birth_date
    from memories m join children c on c.id = m.child_id
    where m.id = ${memoryId} and m.deleted_at is null
  `;
  const memory = rows[0];
  if (!memory) throw new NotFoundError("Memory");
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  if (!isParent && memory.approval_status !== "approved" && memory.created_by !== userId) {
    throw new NotFoundError("Memory");
  }
  const media = await sql<{ id: string; kind: string; alt_text: string | null }[]>`
    select md.id, md.kind, md.alt_text from memory_media mm
    join media md on md.id = mm.media_id
    where mm.memory_id = ${memoryId} and md.deleted_at is null and md.status = 'ready'
    order by mm.sort_order
  `;
  const people = await sql<{ id: string; name: string }[]>`
    select p.id, p.name from memory_people mp
    join people p on p.id = mp.person_id
    where mp.memory_id = ${memoryId} and p.deleted_at is null
  `;
  const versions = isParent
    ? await sql<{ id: string; source: string; title: string | null; body: string | null; created_at: Date }[]>`
        select id, source, title, body, created_at from memory_versions
        where memory_id = ${memoryId} order by created_at desc limit 10
      `
    : [];
  const milestones = await sql<{ id: string; title: string; status: string }[]>`
    select id, title, status from milestones
    where memory_id = ${memoryId}
      and (status = 'confirmed' or ${isParent})
  `;
  return {
    id: memory.id,
    familyId: memory.family_id,
    childId: memory.child_id,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    transcript: memory.transcript,
    happenedAt: memory.happened_at,
    ageText: memory.birth_date
      ? formatAge(computeAge(new Date(`${memory.birth_date}T00:00:00`), new Date(`${memory.happened_at}T00:00:00`)))
      : null,
    tags: memory.tags,
    isFavorite: memory.is_favorite,
    commentsEnabled: memory.comments_enabled,
    approvalStatus: memory.approval_status,
    audioMediaId: memory.audio_media_id,
    media: media.map((m) => ({ id: m.id, kind: m.kind, altText: m.alt_text })),
    people,
    versions: versions.map((v) => ({
      id: v.id, source: v.source, title: v.title, body: v.body, createdAt: v.created_at,
    })),
    milestones,
    canEdit: isParent,
  };
}

export interface TimelineEntry {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  happenedAt: string;
  ageText: string | null;
  isFavorite: boolean;
  isMilestone: boolean;
  approvalStatus: string;
  mediaCount: number;
  coverMediaId: string | null;
  coverMediaKind: string | null;
  hasAudio: boolean;
}

export async function getTimeline(
  userId: string,
  childId: string,
  opts: {
    before?: string;         // happened_at cursor (ISO date)
    limit?: number;
    kind?: "photo" | "video" | "milestone" | null;
    year?: number | null;
    month?: string | null;   // YYYY-MM
  } = {}
): Promise<TimelineEntry[]> {
  const ctx = await assertChildAccess(userId, childId, "viewer");
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 40, 100);
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  const monthStart = opts.month ? `${opts.month}-01` : null;

  const rows = await sql<
    Array<{
      id: string; kind: string; title: string | null; body: string | null;
      happened_at: string; is_favorite: boolean; approval_status: string;
      media_count: number; cover_media_id: string | null; cover_media_kind: string | null;
      audio_media_id: string | null; is_milestone: boolean; birth_date: string | null;
    }>
  >`
    select m.id, m.kind, m.title, m.body, m.happened_at::text as happened_at,
      m.is_favorite, m.approval_status, m.audio_media_id,
      (select count(*)::int from memory_media mm
        join media md on md.id = mm.media_id and md.deleted_at is null
        where mm.memory_id = m.id) as media_count,
      cover.media_id as cover_media_id,
      cover.kind as cover_media_kind,
      exists (select 1 from milestones ms where ms.memory_id = m.id and ms.status = 'confirmed') as is_milestone,
      c.birth_date::text as birth_date
    from memories m
    join children c on c.id = m.child_id
    left join lateral (
      select mm.media_id, md.kind from memory_media mm
      join media md on md.id = mm.media_id
        and md.deleted_at is null and md.status = 'ready'
      where mm.memory_id = m.id
      order by mm.sort_order limit 1
    ) cover on true
    where m.child_id = ${childId} and m.deleted_at is null
      and (${isParent} or m.approval_status = 'approved' or m.created_by = ${userId})
      and (${opts.before ?? null}::date is null or m.happened_at < ${opts.before ?? null})
      and (${opts.year ?? null}::int is null
           or extract(year from m.happened_at) = ${opts.year ?? 0})
      and (${monthStart}::date is null
           or (m.happened_at >= ${monthStart}
               and m.happened_at < (${monthStart}::date + interval '1 month')))
      and (
        ${opts.kind ?? null}::text is null
        or (${opts.kind ?? null} = 'milestone'
            and exists (select 1 from milestones ms where ms.memory_id = m.id and ms.status = 'confirmed'))
        or (${opts.kind ?? null} in ('photo','video')
            and exists (select 1 from memory_media mm join media md on md.id = mm.media_id
                        where mm.memory_id = m.id and md.kind = ${opts.kind ?? null}))
      )
    order by m.happened_at desc, m.created_at desc
    limit ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    happenedAt: r.happened_at,
    ageText: r.birth_date
      ? formatAge(computeAge(new Date(`${r.birth_date}T00:00:00`), new Date(`${r.happened_at}T00:00:00`)))
      : null,
    isFavorite: r.is_favorite,
    isMilestone: r.is_milestone,
    approvalStatus: r.approval_status,
    mediaCount: r.media_count,
    coverMediaId: r.cover_media_id,
    coverMediaKind: r.cover_media_kind,
    hasAudio: Boolean(r.audio_media_id),
  }));
}
