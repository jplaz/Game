import { spawn } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { env } from "@/server/env";

/**
 * Video tooling: ffprobe metadata, poster extraction, web transcode, and
 * deterministic quality/highlight metrics. Worker-only — the web tier never
 * touches ffmpeg. Fails with a clear error when ffmpeg isn't installed
 * (docs/INTEGRATIONS.md §7).
 */

function run(bin: string, args: string[], timeoutMs = 15 * 60 * 1000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += String(d).slice(0, 4000)));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        err.message.includes("ENOENT")
          ? new Error(`${bin} is not installed — video processing requires ffmpeg (docs/INTEGRATIONS.md §7)`)
          : err
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(env().FFPROBE_PATH, ["-version"], 10_000);
    return true;
  } catch {
    return false;
  }
}

export interface VideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  capturedAt: Date | null;
  meanVolumeDb: number | null;
}

export async function probeVideo(path: string): Promise<VideoMetadata> {
  const { stdout } = await run(env().FFPROBE_PATH, [
    "-v", "quiet", "-print_format", "json",
    "-show_format", "-show_streams", path,
  ]);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string; tags?: Record<string, string> };
    streams?: Array<{
      codec_type?: string; width?: number; height?: number;
      side_data_list?: Array<{ rotation?: number }>;
    }>;
  };
  const video = data.streams?.find((s) => s.codec_type === "video");
  const audio = data.streams?.find((s) => s.codec_type === "audio");
  const rotation = Math.abs(video?.side_data_list?.[0]?.rotation ?? 0);
  const swap = rotation === 90 || rotation === 270;
  const creation =
    data.format?.tags?.["creation_time"] ??
    data.format?.tags?.["com.apple.quicktime.creationdate"];
  let capturedAt: Date | null = null;
  if (creation) {
    const d = new Date(creation);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 1990 && d <= new Date()) {
      capturedAt = d;
    }
  }
  return {
    durationMs: Math.round(Number(data.format?.duration ?? 0) * 1000),
    width: (swap ? video?.height : video?.width) ?? 0,
    height: (swap ? video?.width : video?.height) ?? 0,
    hasAudio: Boolean(audio),
    capturedAt,
    meanVolumeDb: null,
  };
}

/** Extract poster frame (smart: 15% in, avoids black lead-ins) as webp. */
export async function extractPoster(path: string, durationMs: number): Promise<Buffer> {
  const at = Math.min(Math.max(durationMs * 0.15, 300), Math.max(durationMs - 100, 300)) / 1000;
  const out = tmpFile(".webp");
  try {
    await run(env().FFMPEG_PATH, [
      "-ss", at.toFixed(2), "-i", path,
      "-frames:v", "1",
      "-vf", "scale='min(1280,iw)':-2",
      "-y", out,
    ]);
    return await fs.readFile(out);
  } finally {
    await fs.unlink(out).catch(() => {});
  }
}

/** H.264/AAC web transcode capped at 1080p — the streaming-playback variant. */
export async function transcodeWeb(path: string): Promise<Buffer> {
  const out = tmpFile(".mp4");
  try {
    await run(env().FFMPEG_PATH, [
      "-i", path,
      "-c:v", "libx264", "-preset", "medium", "-crf", "23",
      "-vf", "scale='min(1920,iw)':-2",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-y", out,
    ]);
    return await fs.readFile(out);
  } finally {
    await fs.unlink(out).catch(() => {});
  }
}

/** Mean/max volume for audio-presence detection. */
export async function detectVolume(path: string): Promise<{ meanDb: number; maxDb: number } | null> {
  try {
    const { stderr } = await run(env().FFMPEG_PATH, [
      "-i", path, "-af", "volumedetect", "-f", "null", "-",
    ]);
    const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
    const max = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
    if (!mean || !max) return null;
    return { meanDb: Number(mean[1]), maxDb: Number(max[1]) };
  } catch {
    return null;
  }
}

/**
 * Scene-change timestamps (seconds) — candidate highlight boundaries.
 * Combined with audio energy this drives media_segments suggestions.
 */
export async function detectScenes(path: string): Promise<number[]> {
  try {
    const { stderr } = await run(env().FFMPEG_PATH, [
      "-i", path,
      "-vf", "select='gt(scene,0.35)',showinfo",
      "-f", "null", "-",
    ]);
    const times: number[] = [];
    for (const m of stderr.matchAll(/pts_time:([\d.]+)/g)) {
      times.push(Number(m[1]));
    }
    return times.slice(0, 50);
  } catch {
    return [];
  }
}

/** Deterministic video flags for media_analysis. */
export function classifyVideo(meta: VideoMetadata, volume: { meanDb: number } | null): {
  veryShort: boolean;
  veryLong: boolean;
  hasAudio: boolean;
  likelySilent: boolean;
} {
  return {
    veryShort: meta.durationMs < 2000,
    veryLong: meta.durationMs > 5 * 60 * 1000,
    hasAudio: meta.hasAudio,
    likelySilent: !meta.hasAudio || (volume !== null && volume.meanDb < -50),
  };
}

export function tmpFile(ext: string): string {
  return join(tmpdir(), `lc-${randomBytes(8).toString("hex")}${ext}`);
}

export async function writeTmp(buffer: Buffer, ext: string): Promise<string> {
  const path = tmpFile(ext);
  await fs.writeFile(path, buffer);
  return path;
}

export async function cleanupTmp(path: string): Promise<void> {
  await fs.unlink(path).catch(() => {});
}
