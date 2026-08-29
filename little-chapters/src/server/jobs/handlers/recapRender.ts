import { spawn } from "child_process";
import { promises as fs } from "fs";
import { getSql } from "@/server/db/client";
import { getStorage, recordStorageObject } from "@/server/storage";
import { markRecapReady, type StoryboardScene } from "@/server/domain/recaps";
import { cleanupTmp, tmpFile, writeTmp } from "@/server/media/video";
import { recordUsage } from "@/server/billing/usage";
import { updateJobProgress } from "@/server/jobs/queue";
import { env } from "@/server/env";
import { logger } from "@/server/observability/logger";

/**
 * recap.render — turn a storyboard into a 30–120s recap video with ffmpeg:
 * per-scene normalization (aspect crop/pad, photo hold, clip trim), caption
 * overlays, gentle crossfade-free cuts (clean concat), title card, optional
 * licensed music bed under scene audio.
 */

const ASPECTS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
  "1:1": { w: 1080, h: 1080 },
};

function runFfmpeg(args: string[], timeoutMs = 20 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(env().FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, timeoutMs);
    child.stderr.on("data", (d) => (stderr = (stderr + String(d)).slice(-4000)));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err.message.includes("ENOENT")
        ? new Error("ffmpeg is not installed — see docs/INTEGRATIONS.md §7")
        : err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/** Escape a string for ffmpeg drawtext. */
function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%");
}

export async function handleRecapRender(
  jobId: string,
  payload: { recapId: string }
): Promise<void> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; title: string; aspect: string;
      storyboard: StoryboardScene[]; music_track_id: string | null }[]
  >`
    select id, family_id, title, aspect, storyboard, music_track_id
    from video_recaps where id = ${payload.recapId}
  `;
  const recap = rows[0];
  if (!recap) return;
  const size = ASPECTS[recap.aspect] ?? ASPECTS["9:16"]!;
  const storage = getStorage();
  const sceneFiles: string[] = [];
  const cleanup: string[] = [];

  try {
    const scenes = recap.storyboard.slice(0, 60);
    let index = 0;
    for (const scene of scenes) {
      index += 1;
      await updateJobProgress(jobId, 0.05 + (index / scenes.length) * 0.6, `Scene ${index} of ${scenes.length}`);

      // source: photos use web derivative; videos use web transcode
      const variant = scene.kind === "photo" ? "web" : "web_video";
      const source = await sql<{ bucket: string; object_key: string }[]>`
        select so.bucket, so.object_key from media_variants mv
        join storage_objects so on so.id = mv.storage_object_id
        where mv.media_id = ${scene.mediaId} and mv.variant = ${variant}
      `;
      if (!source[0]) continue;
      const raw = await storage.getObject(source[0].bucket as never, source[0].object_key);
      const inPath = await writeTmp(raw, scene.kind === "photo" ? ".webp" : ".mp4");
      cleanup.push(inPath);
      const outPath = tmpFile(".mp4");
      cleanup.push(outPath);

      const fit = `scale=${size.w}:${size.h}:force_original_aspect_ratio=increase,crop=${size.w}:${size.h},setsar=1,fps=30,format=yuv420p`;
      const caption = scene.caption
        ? `,drawtext=text='${escapeDrawtext(scene.caption)}':fontcolor=white:fontsize=${Math.round(size.h * 0.028)}:box=1:boxcolor=black@0.35:boxborderw=18:x=(w-text_w)/2:y=h-${Math.round(size.h * 0.12)}`
        : "";
      const durationS = (scene.durationMs / 1000).toFixed(2);

      if (scene.kind === "photo") {
        await runFfmpeg([
          "-loop", "1", "-t", durationS, "-i", inPath,
          "-f", "lavfi", "-t", durationS, "-i", "anullsrc=r=48000:cl=stereo",
          "-vf", `${fit}${caption}`,
          "-c:v", "libx264", "-preset", "fast", "-crf", "22",
          "-c:a", "aac", "-shortest", "-y", outPath,
        ]);
      } else {
        const trim = scene.segment
          ? ["-ss", (scene.segment.startMs / 1000).toFixed(2), "-t",
             (Math.min(scene.durationMs, scene.segment.endMs - scene.segment.startMs) / 1000).toFixed(2)]
          : ["-t", durationS];
        const audioArgs = scene.useClipAudio
          ? ["-c:a", "aac", "-ar", "48000", "-ac", "2"]
          : ["-an"];
        await runFfmpeg([
          ...trim.slice(0, 2), "-i", inPath, ...trim.slice(2),
          "-vf", `${fit}${caption}`,
          "-c:v", "libx264", "-preset", "fast", "-crf", "22",
          ...audioArgs, "-y", outPath,
        ]);
        if (!scene.useClipAudio) {
          // give silent clips a silent track so concat stays uniform
          const padded = tmpFile(".mp4");
          cleanup.push(padded);
          await runFfmpeg([
            "-i", outPath,
            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
            "-c:v", "copy", "-c:a", "aac", "-shortest", "-y", padded,
          ]);
          sceneFiles.push(padded);
          continue;
        }
      }
      sceneFiles.push(outPath);
    }

    if (sceneFiles.length === 0) throw new Error("recap has no renderable scenes");

    // concat
    const listPath = tmpFile(".txt");
    cleanup.push(listPath);
    await fs.writeFile(listPath, sceneFiles.map((f) => `file '${f}'`).join("\n"));
    const concatPath = tmpFile(".mp4");
    cleanup.push(concatPath);
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", concatPath]);
    await updateJobProgress(jobId, 0.75, "Stitching");

    // optional licensed music bed (ducked under clip audio)
    let finalPath = concatPath;
    if (recap.music_track_id) {
      const track = await sql<{ bucket: string; object_key: string }[]>`
        select so.bucket, so.object_key from music_tracks mt
        join storage_objects so on so.id = mt.storage_object_id
        where mt.id = ${recap.music_track_id}
      `;
      if (track[0]) {
        const musicRaw = await storage.getObject(track[0].bucket as never, track[0].object_key);
        const musicPath = await writeTmp(musicRaw, ".m4a");
        cleanup.push(musicPath);
        const mixed = tmpFile(".mp4");
        cleanup.push(mixed);
        await runFfmpeg([
          "-i", concatPath, "-stream_loop", "-1", "-i", musicPath,
          "-filter_complex",
          "[1:a]volume=0.25[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]",
          "-map", "0:v", "-map", "[a]",
          "-c:v", "copy", "-c:a", "aac", "-shortest", "-y", mixed,
        ]);
        finalPath = mixed;
      }
    }

    const output = await fs.readFile(finalPath);
    const key = `${recap.family_id}/${recap.id}/recap.mp4`;
    await storage.putObject("renders", key, output, "video/mp4");
    const objectId = await recordStorageObject({
      familyId: recap.family_id, bucket: "renders", objectKey: key,
      contentType: "video/mp4", sizeBytes: output.length, purpose: "recap",
    });
    await markRecapReady(recap.id, objectId);
    await recordUsage({
      familyId: recap.family_id, metric: "render_minutes",
      delta: Math.ceil(scenes.reduce((s, x) => s + x.durationMs, 0) / 60000),
      refType: "recap", refId: recap.id,
    });
    logger.info("recap rendered", { recapId: recap.id, familyId: recap.family_id });
  } catch (err) {
    await sql`update video_recaps set status = 'failed' where id = ${recap.id}`;
    throw err;
  } finally {
    for (const path of cleanup) await cleanupTmp(path);
  }
}
