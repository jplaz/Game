import { getSql } from "@/server/db/client";
import { assertChildAccess, assertResourceAccess } from "@/server/authz";
import { ConflictError, NotFoundError } from "@/server/errors";
import { runAiTask } from "@/server/ai/run";
import { monthlyNarrativeTask, type ConfirmedMemoryFact } from "@/server/ai/tasks/narrative";
import { captionTask } from "@/server/ai/tasks/writing";
import { mediaRelevanceTask } from "@/server/ai/tasks/suggestions";
import { selectBest, type SelectableMedia } from "@/server/media/selection";
import { chapterAgeTitle, computeAge, formatAge } from "@/lib/age";
import { formatMonth } from "@/lib/format";
import { enqueueJob } from "@/server/jobs/queue";
import { addFeedItem } from "@/server/domain/feed";
import { logger } from "@/server/observability/logger";

/**
 * Monthly chapter generation — the product's defining flow.
 *
 * All facts come from confirmed data (approved memories, confirmed milestones,
 * parent-entered growth). AI writes prose over those facts and every section
 * lands as an editable chapter_section. Regeneration never touches sections
 * with edited_by_user = true.
 */

export interface ChapterSectionContent {
  text?: string;
  items?: Array<{ label: string; value?: string; date?: string; memoryId?: string }>;
  mediaIds?: string[];
  captions?: Record<string, string>;
  [key: string]: unknown;
}

/** Request generation (enqueues the job; runs in the worker). */
export async function requestChapterGeneration(opts: {
  userId: string;
  childId: string;
  month: string; // YYYY-MM
}): Promise<{ chapterId: string; jobId: string | null }> {
  const ctx = await assertChildAccess(opts.userId, opts.childId, "parent");
  if (!/^\d{4}-\d{2}$/.test(opts.month)) throw new ConflictError("Invalid month");
  const periodStart = `${opts.month}-01`;
  const sql = getSql();

  const child = await sql<{ nickname: string | null; full_name: string; birth_date: string | null }[]>`
    select nickname, full_name, birth_date::text as birth_date from children where id = ${opts.childId}
  `;
  const c = child[0];
  if (!c) throw new NotFoundError("Child");
  const displayName = c.nickname || c.full_name.split(" ")[0] || c.full_name;
  const ageTitle = c.birth_date
    ? chapterAgeTitle(computeAge(new Date(`${c.birth_date}T00:00:00`), new Date(`${periodStart}T00:00:00`)).totalMonths)
    : formatMonth(periodStart);

  const rows = await sql<{ id: string }[]>`
    insert into chapters
      (family_id, child_id, kind, period_start, period_end, title, subtitle, status)
    values
      (${ctx.familyId}, ${opts.childId}, 'month', ${periodStart},
       (${periodStart}::date + interval '1 month' - interval '1 day')::date,
       ${`${displayName} — ${ageTitle}`}, ${formatMonth(periodStart)}, 'generating')
    on conflict (child_id, kind, period_start) do update set status = 'generating'
    returning id
  `;
  const chapterId = rows[0]!.id;
  const jobId = await enqueueJob({
    type: "chapter.generate",
    familyId: ctx.familyId,
    payload: { chapterId },
    idempotencyKey: `chapter:${chapterId}`,
    priority: 2,
  });
  await sql`update chapters set generation_job_id = ${jobId} where id = ${chapterId}`;
  return { chapterId, jobId };
}

/** The actual generation — invoked by the worker job handler. */
export async function generateChapter(chapterId: string): Promise<void> {
  const sql = getSql();
  const chapterRows = await sql<
    { id: string; family_id: string; child_id: string; period_start: string; period_end: string }[]
  >`
    select id, family_id, child_id, period_start::text as period_start,
           period_end::text as period_end
    from chapters where id = ${chapterId} and deleted_at is null
  `;
  const chapter = chapterRows[0];
  if (!chapter) throw new Error("chapter missing");

  const childRows = await sql<
    { full_name: string; nickname: string | null; pronouns: string | null; birth_date: string | null }[]
  >`
    select full_name, nickname, pronouns, birth_date::text as birth_date
    from children where id = ${chapter.child_id}
  `;
  const child = childRows[0]!;
  const displayName = child.nickname || child.full_name.split(" ")[0] || child.full_name;
  const birthDate = child.birth_date ? new Date(`${child.birth_date}T00:00:00`) : null;
  const midMonth = new Date(`${chapter.period_start}T00:00:00`);
  const ageText = birthDate ? formatAge(computeAge(birthDate, midMonth)) : "";

  // 1–4: gather confirmed facts and ready media for the period
  const memories = await sql<
    { id: string; kind: string; title: string | null; body: string | null;
      happened_at: string; is_favorite: boolean; tags: string[] }[]
  >`
    select id, kind, title, body, happened_at::text as happened_at, is_favorite, tags
    from memories
    where child_id = ${chapter.child_id} and deleted_at is null
      and approval_status = 'approved'
      and happened_at between ${chapter.period_start} and ${chapter.period_end}
    order by happened_at
  `;
  const milestones = await sql<
    { id: string; title: string; category: string; happened_at: string }[]
  >`
    select id, title, category, happened_at::text as happened_at from milestones
    where child_id = ${chapter.child_id} and status = 'confirmed'
      and happened_at between ${chapter.period_start} and ${chapter.period_end}
    order by happened_at
  `;
  const growth = await sql<
    { measured_at: string; weight_grams: number | null; height_mm: number | null;
      clothing_size: string | null; shoe_size: string | null; diaper_size: string | null }[]
  >`
    select measured_at::text as measured_at, weight_grams, height_mm,
           clothing_size, shoe_size, diaper_size
    from growth_entries
    where child_id = ${chapter.child_id}
      and measured_at between ${chapter.period_start} and ${chapter.period_end}
    order by measured_at desc
  `;
  const media = await sql<
    { id: string; kind: "photo" | "video"; captured_at: Date | null; phash: string | null;
      quality_score: number | null; is_favorite: boolean; memory_text: string | null; alt_text: string | null }[]
  >`
    select m.id, m.kind, m.captured_at, m.phash, m.quality_score, m.is_favorite,
      m.alt_text,
      (select mem.body from memory_media mm join memories mem on mem.id = mm.memory_id
        where mm.media_id = m.id and mem.deleted_at is null limit 1) as memory_text
    from media m
    where m.family_id = ${chapter.family_id}
      and (m.child_id = ${chapter.child_id} or m.child_id is null)
      and m.deleted_at is null and m.status = 'ready' and m.hidden = false
      and m.approval_status = 'approved'
      and m.kind in ('photo','video')
      and m.captured_at >= ${chapter.period_start}::date
      and m.captured_at < (${chapter.period_end}::date + interval '1 day')
    order by m.captured_at
  `;

  // 5–8: relevance scoring + duplicate-aware, chronologically diverse selection
  const relevance = await runAiTask(
    mediaRelevanceTask,
    {
      items: media.map((m) => ({
        id: m.id,
        kind: m.kind,
        caption: m.alt_text,
        memoryContext: m.memory_text ? m.memory_text.slice(0, 280) : null,
        qualityScore: m.quality_score ?? 0.5,
      })),
    },
    { familyId: chapter.family_id, childId: chapter.child_id }
  );
  const relevanceById = new Map(relevance.output.scores.map((s) => [s.id, s.relevance]));
  const selectable: SelectableMedia[] = media.map((m) => ({
    id: m.id,
    kind: m.kind,
    capturedAt: m.captured_at,
    phash: m.phash,
    qualityScore: m.quality_score ?? 0.5,
    relevance: relevanceById.get(m.id) ?? 0.4,
    isFavorite: m.is_favorite,
    hasMemoryContext: Boolean(m.memory_text),
  }));
  const photoPick = selectBest(selectable.filter((s) => s.kind === "photo"), 14);
  const videoPick = selectBest(selectable.filter((s) => s.kind === "video"), 4, { maxPerBurst: 1 });

  // favorite photo/video = highest relevance among picks (favorites win)
  const favoritePhoto = pickFavorite(selectable, photoPick.selected);
  const favoriteVideo = pickFavorite(selectable, videoPick.selected);

  // 15: grounded monthly narrative
  const facts: ConfirmedMemoryFact[] = memories
    .filter((m) => m.body?.trim())
    .map((m) => ({
      date: m.happened_at,
      title: m.title,
      text: m.body!.trim(),
      isMilestone: milestones.some((ms) => ms.happened_at === m.happened_at && ms.title === m.title),
    }));
  const narrative = facts.length > 0
    ? await runAiTask(
        monthlyNarrativeTask,
        {
          childName: displayName,
          childPronouns: child.pronouns,
          ageTitle: birthDate
            ? chapterAgeTitle(computeAge(birthDate, midMonth).totalMonths)
            : formatMonth(chapter.period_start),
          monthLabel: formatMonth(chapter.period_start),
          memories: facts,
        },
        { familyId: chapter.family_id, childId: chapter.child_id }
      )
    : null;

  // 14: caption the favorite photo when it has confirmed context
  let favoritePhotoCaption: string | null = null;
  const favoriteMeta = media.find((m) => m.id === favoritePhoto);
  if (favoritePhoto && favoriteMeta?.memory_text) {
    const captionResult = await runAiTask(
      captionTask,
      {
        childName: displayName,
        ageText,
        memoryContext: favoriteMeta.memory_text.slice(0, 500),
        mediaKind: "photo",
      },
      { familyId: chapter.family_id, childId: chapter.child_id }
    );
    favoritePhotoCaption = captionResult.output.caption;
  }

  // 16: compose sections (never clobber user-edited ones)
  const editedTypes = new Set(
    (
      await sql<{ section_type: string }[]>`
        select section_type from chapter_sections
        where chapter_id = ${chapterId} and edited_by_user = true
      `
    ).map((r) => r.section_type)
  );

  const favoriteMemories = memories.filter((m) => m.is_favorite);
  const funnyMemories = memories.filter(
    (m) => m.tags.includes("funny") || /laugh|giggl|funny/i.test(m.body ?? "")
  );
  const firsts = milestones.filter((m) => m.category === "firsts" || /^first\b/i.test(m.title));
  const latestGrowth = growth[0];

  type SectionDef = { type: string; title: string | null; content: ChapterSectionContent; include: boolean };
  const sections: SectionDef[] = [
    { type: "cover", title: null, include: true,
      content: { mediaIds: favoritePhoto ? [favoritePhoto] : [] } },
    { type: "story", title: "This Month", include: Boolean(narrative),
      content: narrative
        ? { text: narrative.output.story, openingLine: narrative.output.openingLine,
            isDraft: narrative.isFallback ? false : true,
            lookingAheadText: narrative.output.lookingAhead ?? null }
        : {} },
    { type: "milestones", title: "Milestones", include: milestones.length > 0,
      content: { items: milestones.map((m) => ({ label: m.title, date: m.happened_at })) } },
    { type: "firsts", title: "Firsts", include: firsts.length > 0,
      content: { items: firsts.map((m) => ({ label: m.title, date: m.happened_at })) } },
    { type: "favorite_moments", title: "Favorite Moments", include: favoriteMemories.length > 0,
      content: { items: favoriteMemories.map((m) => ({
        label: m.title ?? (m.body ?? "").slice(0, 80), memoryId: m.id, date: m.happened_at })) } },
    { type: "laughs", title: "Things That Made You Laugh", include: funnyMemories.length > 0,
      content: { items: funnyMemories.map((m) => ({
        label: m.title ?? (m.body ?? "").slice(0, 80), memoryId: m.id, date: m.happened_at })) } },
    { type: "growth", title: "Growing", include: Boolean(latestGrowth),
      content: latestGrowth
        ? { items: [
            ...(latestGrowth.weight_grams ? [{ label: "Weight", value: String(latestGrowth.weight_grams) }] : []),
            ...(latestGrowth.height_mm ? [{ label: "Height", value: String(latestGrowth.height_mm) }] : []),
            ...(latestGrowth.clothing_size ? [{ label: "Clothes", value: latestGrowth.clothing_size }] : []),
            ...(latestGrowth.diaper_size ? [{ label: "Diapers", value: latestGrowth.diaper_size }] : []),
          ] }
        : {} },
    { type: "favorite_photo", title: "The Photo We Kept Coming Back To",
      include: Boolean(favoritePhoto),
      content: favoritePhoto
        ? { mediaIds: [favoritePhoto],
            captions: favoritePhotoCaption ? { [favoritePhoto]: favoritePhotoCaption } : {} }
        : {} },
    { type: "favorite_video", title: "A Moment Worth Watching Again",
      include: Boolean(favoriteVideo),
      content: favoriteVideo ? { mediaIds: [favoriteVideo] } : {} },
    { type: "collage", title: `${formatMonth(chapter.period_start)} in Photos`,
      include: photoPick.selected.length > 0,
      content: { mediaIds: photoPick.selected } },
    { type: "video_memories", title: "Video Memories", include: videoPick.selected.length > 0,
      content: { mediaIds: videoPick.selected } },
    { type: "looking_ahead", title: "Looking Ahead",
      include: Boolean(narrative?.output.lookingAhead),
      content: narrative?.output.lookingAhead ? { text: narrative.output.lookingAhead } : {} },
  ];

  await sql.begin(async (tx) => {
    let order = 0;
    for (const section of sections) {
      order += 10;
      if (editedTypes.has(section.type)) continue; // parent's edit is sacred
      if (!section.include) {
        await tx`
          delete from chapter_sections
          where chapter_id = ${chapterId} and section_type = ${section.type}
            and edited_by_user = false
        `;
        continue;
      }
      await tx`
        delete from chapter_sections
        where chapter_id = ${chapterId} and section_type = ${section.type}
          and edited_by_user = false
      `;
      await tx`
        insert into chapter_sections (chapter_id, section_type, title, content, sort_order)
        values (${chapterId}, ${section.type}, ${section.title},
                ${tx.json(section.content as never)}, ${order})
      `;
    }
    await tx`
      update chapters set status = 'ready', generated_at = now(),
        cover_media_id = coalesce(cover_media_id, ${favoritePhoto ?? null})
      where id = ${chapterId}
    `;
  });

  await addFeedItem({
    familyId: chapter.family_id, eventType: "chapter.ready",
    targetType: "chapter", targetId: chapterId,
    summary: `${displayName}'s ${formatMonth(chapter.period_start)} chapter is ready`,
  });
  await enqueueJob({
    type: "notify.dispatch",
    familyId: chapter.family_id,
    payload: { kind: "chapter.ready", chapterId, childId: chapter.child_id },
    idempotencyKey: `notify:chapter:${chapterId}`,
  });
  logger.info("chapter generated", {
    chapterId, familyId: chapter.family_id, childId: chapter.child_id,
    count: memories.length,
  });
}

function pickFavorite(pool: SelectableMedia[], selectedIds: string[]): string | null {
  const selected = pool.filter((p) => selectedIds.includes(p.id));
  if (selected.length === 0) return null;
  selected.sort((a, b) => {
    const fav = Number(b.isFavorite) - Number(a.isFavorite);
    if (fav !== 0) return fav;
    return b.relevance + b.qualityScore - (a.relevance + a.qualityScore);
  });
  return selected[0]!.id;
}

export interface ChapterView {
  id: string;
  childId: string;
  familyId: string;
  title: string;
  subtitle: string | null;
  status: string;
  themeId: string;
  periodStart: string;
  coverMediaId: string | null;
  sections: Array<{
    id: string;
    type: string;
    title: string | null;
    content: ChapterSectionContent;
    sortOrder: number;
    hidden: boolean;
    editedByUser: boolean;
  }>;
}

export async function getChapter(userId: string, chapterId: string): Promise<ChapterView> {
  const ctx = await assertResourceAccess(userId, "chapters", chapterId, "viewer");
  return getChapterUnchecked(chapterId, ctx.familyId);
}

/** For share-link rendering after policy checks. */
export async function getChapterUnchecked(
  chapterId: string,
  familyId?: string
): Promise<ChapterView> {
  const sql = getSql();
  const rows = await sql<
    { id: string; child_id: string; family_id: string; title: string; subtitle: string | null;
      status: string; theme_id: string; period_start: string; cover_media_id: string | null }[]
  >`
    select id, child_id, family_id, title, subtitle, status, theme_id,
           period_start::text as period_start, cover_media_id
    from chapters where id = ${chapterId} and deleted_at is null
      and (${familyId ?? null}::uuid is null or family_id = ${familyId ?? null})
  `;
  const chapter = rows[0];
  if (!chapter) throw new NotFoundError("Chapter");
  const sections = await sql<
    { id: string; section_type: string; title: string | null; content: ChapterSectionContent;
      sort_order: number; hidden: boolean; edited_by_user: boolean }[]
  >`
    select id, section_type, title, content, sort_order, hidden, edited_by_user
    from chapter_sections where chapter_id = ${chapterId}
    order by sort_order
  `;
  return {
    id: chapter.id,
    childId: chapter.child_id,
    familyId: chapter.family_id,
    title: chapter.title,
    subtitle: chapter.subtitle,
    status: chapter.status,
    themeId: chapter.theme_id,
    periodStart: chapter.period_start,
    coverMediaId: chapter.cover_media_id,
    sections: sections.map((s) => ({
      id: s.id, type: s.section_type, title: s.title, content: s.content,
      sortOrder: s.sort_order, hidden: s.hidden, editedByUser: s.edited_by_user,
    })),
  };
}

export async function updateChapterSection(opts: {
  userId: string;
  chapterId: string;
  sectionId: string;
  title?: string | null;
  content?: ChapterSectionContent;
  hidden?: boolean;
  sortOrder?: number;
}): Promise<void> {
  await assertResourceAccess(opts.userId, "chapters", opts.chapterId, "parent");
  const sql = getSql();
  const result = await sql`
    update chapter_sections set
      title = coalesce(${opts.title ?? null}, title),
      content = coalesce(${opts.content ? sql.json(opts.content as never) : null}, content),
      hidden = coalesce(${opts.hidden ?? null}, hidden),
      sort_order = coalesce(${opts.sortOrder ?? null}, sort_order),
      edited_by_user = true
    where id = ${opts.sectionId} and chapter_id = ${opts.chapterId}
    returning id
  `;
  if (result.length === 0) throw new NotFoundError("Section");
}

export async function setChapterTheme(opts: {
  userId: string;
  chapterId: string;
  themeId: string;
}): Promise<void> {
  await assertResourceAccess(opts.userId, "chapters", opts.chapterId, "parent");
  const sql = getSql();
  const result = await sql`
    update chapters set theme_id = ${opts.themeId}
    where id = ${opts.chapterId}
      and exists (select 1 from themes where id = ${opts.themeId})
    returning id
  `;
  if (result.length === 0) throw new NotFoundError("Theme");
}

export async function listChapters(
  userId: string,
  childId: string
): Promise<Array<{ id: string; title: string; subtitle: string | null; status: string;
  periodStart: string; coverMediaId: string | null }>> {
  await assertChildAccess(userId, childId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; title: string; subtitle: string | null; status: string;
      period_start: string; cover_media_id: string | null }[]
  >`
    select id, title, subtitle, status, period_start::text as period_start, cover_media_id
    from chapters
    where child_id = ${childId} and deleted_at is null
    order by period_start desc
  `;
  return rows.map((r) => ({
    id: r.id, title: r.title, subtitle: r.subtitle, status: r.status,
    periodStart: r.period_start, coverMediaId: r.cover_media_id,
  }));
}
