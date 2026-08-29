import { z } from "zod";
import { getSql } from "@/server/db/client";
import { assertResourceAccess } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";
import { assertWithinLimit } from "@/server/billing/usage";
import { enqueueJob } from "@/server/jobs/queue";
import { getChapterUnchecked } from "@/server/domain/chapters";
import { addFeedItem } from "@/server/domain/feed";

/**
 * Monthly video recaps: 30–120s, storyboard-driven, rendered by the worker
 * (ffmpeg). The storyboard is fully editable — choose media, reorder scenes,
 * edit captions, pick duration/theme/aspect — before rendering.
 */

export const storyboardSceneSchema = z.object({
  mediaId: z.string().uuid(),
  kind: z.enum(["photo", "video"]),
  caption: z.string().max(140).nullable().default(null),
  durationMs: z.number().int().min(800).max(15000),
  /** for video scenes: which segment of the clip to use */
  segment: z
    .object({ startMs: z.number().int().min(0), endMs: z.number().int().min(1) })
    .nullable()
    .default(null),
  useClipAudio: z.boolean().default(false),
});

export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;

export async function createRecapFromChapter(opts: {
  userId: string;
  chapterId: string;
  aspect?: "9:16" | "16:9" | "1:1";
  targetDurationS?: number;
}): Promise<{ recapId: string }> {
  const ctx = await assertResourceAccess(opts.userId, "chapters", opts.chapterId, "parent");
  await assertWithinLimit(ctx.familyId, "recaps_month", 1, "video recaps");
  const chapter = await getChapterUnchecked(opts.chapterId, ctx.familyId);

  // seed the storyboard from the chapter's selected media
  const collage = chapter.sections.find((s) => s.type === "collage");
  const videos = chapter.sections.find((s) => s.type === "video_memories");
  const favoritePhoto = chapter.sections.find((s) => s.type === "favorite_photo");
  const story = chapter.sections.find((s) => s.type === "story");

  const sql = getSql();
  const photoIds = [
    ...(favoritePhoto?.content.mediaIds ?? []),
    ...(collage?.content.mediaIds ?? []),
  ];
  const videoIds = videos?.content.mediaIds ?? [];
  const target = opts.targetDurationS ?? 60;

  const scenes: StoryboardScene[] = [];
  let budget = target * 1000;
  for (const id of videoIds.slice(0, 3)) {
    const dur = Math.min(8000, budget * 0.25);
    scenes.push({ mediaId: id, kind: "video", caption: null, durationMs: Math.round(dur),
      segment: null, useClipAudio: true });
    budget -= dur;
  }
  const perPhoto = Math.max(1500, Math.min(4000, budget / Math.max(photoIds.length, 1)));
  for (const id of photoIds.slice(0, Math.floor(budget / perPhoto))) {
    if (scenes.some((s) => s.mediaId === id)) continue;
    scenes.push({ mediaId: id, kind: "photo", caption: null,
      durationMs: Math.round(perPhoto), segment: null, useClipAudio: false });
  }
  if (scenes[0] && story?.content.openingLine) {
    scenes[0].caption = String(story.content.openingLine).slice(0, 140);
  }

  const rows = await sql<{ id: string }[]>`
    insert into video_recaps
      (family_id, child_id, chapter_id, title, aspect, target_duration_s,
       theme_id, storyboard, status)
    values
      (${ctx.familyId}, ${chapter.childId}, ${opts.chapterId}, ${chapter.title},
       ${opts.aspect ?? "9:16"}, ${target}, ${chapter.themeId},
       ${sql.json(scenes as never)}, 'draft')
    returning id
  `;
  return { recapId: rows[0]!.id };
}

export async function updateRecapStoryboard(opts: {
  userId: string;
  recapId: string;
  storyboard?: StoryboardScene[];
  title?: string;
  aspect?: "9:16" | "16:9" | "1:1";
  targetDurationS?: number;
  themeId?: string;
  musicTrackId?: string | null;
}): Promise<void> {
  const ctx = await assertResourceAccess(opts.userId, "video_recaps", opts.recapId, "parent");
  const sql = getSql();
  if (opts.storyboard) {
    z.array(storyboardSceneSchema).max(60).parse(opts.storyboard);
    // every referenced media must belong to this family
    for (const scene of opts.storyboard) {
      const m = await sql`
        select 1 from media where id = ${scene.mediaId}
          and family_id = ${ctx.familyId} and deleted_at is null
      `;
      if (m.length === 0) throw new ValidationError("A scene references unavailable media");
    }
  }
  if (opts.musicTrackId) {
    const track = await sql`
      select 1 from music_tracks where id = ${opts.musicTrackId}
        and (family_id is null or family_id = ${ctx.familyId})
    `;
    if (track.length === 0) throw new NotFoundError("Music track");
  }
  await sql`
    update video_recaps set
      storyboard = coalesce(${opts.storyboard ? sql.json(opts.storyboard as never) : null}, storyboard),
      title = coalesce(${opts.title ?? null}, title),
      aspect = coalesce(${opts.aspect ?? null}, aspect),
      target_duration_s = coalesce(${opts.targetDurationS ?? null}, target_duration_s),
      theme_id = coalesce(${opts.themeId ?? null}, theme_id),
      music_track_id = ${opts.musicTrackId === undefined ? sql`music_track_id` : opts.musicTrackId}
    where id = ${opts.recapId}
  `;
}

export async function requestRecapRender(opts: {
  userId: string;
  recapId: string;
}): Promise<{ jobId: string | null }> {
  const ctx = await assertResourceAccess(opts.userId, "video_recaps", opts.recapId, "parent");
  const sql = getSql();
  await sql`update video_recaps set status = 'rendering' where id = ${opts.recapId}`;
  const jobId = await enqueueJob({
    type: "recap.render",
    familyId: ctx.familyId,
    payload: { recapId: opts.recapId },
    idempotencyKey: `recap:${opts.recapId}`,
    priority: 4,
  });
  return { jobId };
}

export async function markRecapReady(recapId: string, outputObjectId: string): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ family_id: string; title: string }[]>`
    update video_recaps set status = 'ready', output_object_id = ${outputObjectId}
    where id = ${recapId}
    returning family_id, title
  `;
  const recap = rows[0];
  if (recap) {
    await addFeedItem({
      familyId: recap.family_id, eventType: "recap.ready",
      targetType: "recap", targetId: recapId,
      summary: `A video recap is ready: ${recap.title}`,
    });
  }
}
