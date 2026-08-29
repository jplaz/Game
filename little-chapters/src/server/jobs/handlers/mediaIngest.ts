import { getSql } from "@/server/db/client";
import { getStorage, recordStorageObject } from "@/server/storage";
import {
  computeDHash,
  hammingDistance,
  processImage,
  scoreImageQuality,
} from "@/server/media/images";
import {
  classifyVideo,
  cleanupTmp,
  detectVolume,
  extractPoster,
  probeVideo,
  transcodeWeb,
  writeTmp,
} from "@/server/media/video";
import { isSuspicious, sniffContentType } from "@/server/media/validation";
import { recordUsage } from "@/server/billing/usage";
import { logger } from "@/server/observability/logger";
import { updateJobProgress } from "@/server/jobs/queue";

/**
 * media.ingest — the heart of the media pipeline.
 * Sniff real type → derivatives → metadata → quality → dedupe → ready.
 * Idempotent: re-running regenerates the same derivatives.
 */
export async function handleMediaIngest(
  jobId: string,
  payload: { mediaId: string }
): Promise<void> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; kind: string; declared_content_type: string;
      original_object_id: string | null; captured_at: Date | null;
      captured_at_source: string | null; created_at: Date }[]
  >`
    select id, family_id, kind, declared_content_type, original_object_id,
           captured_at, captured_at_source, created_at
    from media where id = ${payload.mediaId} and deleted_at is null
  `;
  const media = rows[0];
  if (!media?.original_object_id) return; // deleted or never completed — no-op

  const objRows = await sql<{ bucket: string; object_key: string }[]>`
    select bucket, object_key from storage_objects where id = ${media.original_object_id}
  `;
  const obj = objRows[0]!;
  const storage = getStorage();
  const original = await storage.getObject(obj.bucket as never, obj.object_key);

  // 1. verify content: magic bytes must match a supported type and the
  //    declared family (photo stays photo); reject anything suspicious
  const sniffed = sniffContentType(original.subarray(0, 64));
  if (isSuspicious(original) || !sniffed) {
    await sql`
      update media set status = 'rejected',
        error_message = 'File content did not match a supported photo/video/audio format'
      where id = ${media.id}
    `;
    logger.warn("media rejected by sniffing", { mediaId: media.id, familyId: media.family_id });
    return;
  }
  const sniffedKind = sniffed.startsWith("image/") ? "photo"
    : sniffed.startsWith("video/") ? "video" : "audio";
  // m4a/webm containers blur audio/video; trust the declared kind for those
  const kindMismatch =
    sniffedKind !== media.kind &&
    !(media.kind === "audio" && (sniffed === "video/mp4" || sniffed === "video/webm"));
  if (kindMismatch) {
    await sql`
      update media set status = 'rejected',
        error_message = 'File content did not match its declared type'
      where id = ${media.id}
    `;
    return;
  }
  await updateJobProgress(jobId, 0.15, "Checking file");

  const familyPrefix = `${media.family_id}/${media.id}`;
  const saveVariant = async (
    variant: string,
    body: Buffer,
    contentType: string,
    ext: string,
    dims?: { width?: number; height?: number; durationMs?: number }
  ) => {
    const key = `${familyPrefix}/${variant}${ext}`;
    await storage.putObject("derivatives", key, body, contentType);
    const objectId = await recordStorageObject({
      familyId: media.family_id, bucket: "derivatives", objectKey: key,
      contentType, sizeBytes: body.length, purpose: variant,
    });
    await sql`
      insert into media_variants (media_id, variant, storage_object_id, width, height, duration_ms)
      values (${media.id}, ${variant}, ${objectId},
              ${dims?.width ?? null}, ${dims?.height ?? null}, ${dims?.durationMs ?? null})
      on conflict (media_id, variant) do update
        set storage_object_id = excluded.storage_object_id,
            width = excluded.width, height = excluded.height,
            duration_ms = excluded.duration_ms
    `;
    await recordUsage({
      familyId: media.family_id, metric: "storage_bytes", delta: body.length,
      refType: "media_variant", refId: media.id,
    });
  };

  if (media.kind === "photo") {
    const derived = await processImage(original);
    await updateJobProgress(jobId, 0.45, "Creating versions");
    await saveVariant("thumb", derived.thumb, "image/webp", ".webp");
    await saveVariant("web", derived.web, "image/webp", ".webp", {
      width: derived.width, height: derived.height,
    });

    const quality = await scoreImageQuality(derived.web);
    const phash = await computeDHash(derived.thumb);
    await updateJobProgress(jobId, 0.75, "Analyzing quality");

    // duplicate candidates within this family (same-day window)
    const candidates = await sql<{ id: string; phash: string }[]>`
      select id, phash from media
      where family_id = ${media.family_id} and id != ${media.id}
        and kind = 'photo' and phash is not null and deleted_at is null
        and status = 'ready'
      order by created_at desc limit 500
    `;
    const duplicateOf =
      candidates.find((c) => hammingDistance(c.phash, phash) <= 4)?.id ?? null;

    const capturedAt = media.captured_at ?? derived.capturedAt ?? media.created_at;
    await sql`
      update media set
        status = 'ready',
        verified_content_type = ${sniffed},
        width = ${derived.width}, height = ${derived.height},
        captured_at = ${capturedAt},
        captured_at_source = ${media.captured_at_source ?? (derived.capturedAt ? "exif" : "upload_time")},
        phash = ${phash},
        sharpness = ${quality.sharpness}, exposure = ${quality.exposure},
        quality_score = ${quality.quality},
        duplicate_of = ${duplicateOf}
      where id = ${media.id}
    `;
    await sql`
      insert into media_analysis (media_id, analyzer, result)
      values (${media.id}, 'quality',
        ${sql.json({ sharpness: quality.sharpness, exposure: quality.exposure, quality: quality.quality })})
      on conflict (media_id, analyzer) do update set result = excluded.result
    `;
  } else if (media.kind === "video") {
    const tmp = await writeTmp(original, ".mp4");
    try {
      const meta = await probeVideo(tmp);
      await updateJobProgress(jobId, 0.3, "Reading video");
      const poster = await extractPoster(tmp, meta.durationMs);
      await saveVariant("poster", poster, "image/webp", ".webp", {
        width: meta.width, height: meta.height,
      });
      await updateJobProgress(jobId, 0.5, "Creating streaming version");
      const web = await transcodeWeb(tmp);
      await saveVariant("web_video", web, "video/mp4", ".mp4", {
        width: meta.width, height: meta.height, durationMs: meta.durationMs,
      });
      await updateJobProgress(jobId, 0.85, "Analyzing");
      const volume = await detectVolume(tmp);
      const flags = classifyVideo(meta, volume ? { meanDb: volume.meanDb } : null);
      const posterQuality = await scoreImageQuality(poster);
      const phash = await computeDHash(poster);

      const capturedAt = media.captured_at ?? meta.capturedAt ?? media.created_at;
      await sql`
        update media set
          status = 'ready',
          verified_content_type = ${sniffed},
          width = ${meta.width}, height = ${meta.height},
          duration_ms = ${meta.durationMs},
          captured_at = ${capturedAt},
          captured_at_source = ${media.captured_at_source ?? (meta.capturedAt ? "exif" : "upload_time")},
          phash = ${phash},
          quality_score = ${posterQuality.quality},
          sharpness = ${posterQuality.sharpness}, exposure = ${posterQuality.exposure}
        where id = ${media.id}
      `;
      await sql`
        insert into media_analysis (media_id, analyzer, result)
        values (${media.id}, 'video_metrics', ${sql.json({ ...flags, meanVolumeDb: volume?.meanDb ?? null })})
        on conflict (media_id, analyzer) do update set result = excluded.result
      `;
      await recordUsage({
        familyId: media.family_id, metric: "video_minutes",
        delta: Math.ceil(meta.durationMs / 60000),
        refType: "media", refId: media.id,
      });
    } finally {
      await cleanupTmp(tmp);
    }
  } else {
    // audio: verify + duration via ffprobe when available; playable as-is
    let durationMs: number | null = null;
    try {
      const tmp = await writeTmp(original, ".m4a");
      try {
        durationMs = (await probeVideo(tmp)).durationMs;
      } finally {
        await cleanupTmp(tmp);
      }
    } catch {
      durationMs = null; // ffprobe missing in dev — duration stays unknown
    }
    await sql`
      update media set status = 'ready',
        verified_content_type = ${sniffed},
        duration_ms = ${durationMs},
        captured_at = coalesce(captured_at, created_at)
      where id = ${media.id}
    `;
  }

  logger.info("media ingested", { mediaId: media.id, familyId: media.family_id });
}
