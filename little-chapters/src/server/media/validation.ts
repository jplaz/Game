import { ValidationError } from "@/server/errors";

/**
 * Upload validation: MIME allowlist + size limits at admission, magic-byte
 * verification in the worker (extensions and declared types are never trusted).
 */

export const PHOTO_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/webp": [".webp"],
};

export const VIDEO_TYPES: Record<string, string[]> = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/x-m4v": [".m4v"],
  "video/webm": [".webm"],
  "video/3gpp": [".3gp"],
};

export const AUDIO_TYPES: Record<string, string[]> = {
  "audio/mp4": [".m4a"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/webm": [".weba", ".webm"],
  "audio/ogg": [".ogg"],
  "audio/aac": [".aac"],
};

export const MAX_SIZE_BYTES = {
  photo: 60 * 1024 * 1024,        // 60 MB — large HEIC/RAW-adjacent originals
  video: 4 * 1024 * 1024 * 1024,  // 4 GB
  audio: 200 * 1024 * 1024,       // 200 MB
} as const;

export type MediaKind = "photo" | "video" | "audio";

export function classifyContentType(contentType: string): MediaKind | null {
  const ct = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ct in PHOTO_TYPES) return "photo";
  if (ct in VIDEO_TYPES) return "video";
  if (ct in AUDIO_TYPES) return "audio";
  return null;
}

export function validateUpload(opts: {
  contentType: string;
  sizeBytes: number;
  filename: string;
}): { kind: MediaKind; ext: string } {
  const kind = classifyContentType(opts.contentType);
  if (!kind) {
    throw new ValidationError(
      "This file type isn't supported. Photos (JPG, PNG, HEIC, WebP), videos (MP4, MOV), and audio recordings are."
    );
  }
  if (opts.sizeBytes <= 0) throw new ValidationError("Empty file");
  if (opts.sizeBytes > MAX_SIZE_BYTES[kind]) {
    throw new ValidationError(
      `This ${kind} is too large (max ${Math.round(MAX_SIZE_BYTES[kind] / 1024 / 1024)} MB)`
    );
  }
  const dot = opts.filename.lastIndexOf(".");
  const ext = dot >= 0 ? opts.filename.slice(dot).toLowerCase() : "";
  const allowedExts = {
    ...PHOTO_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES,
  }[opts.contentType.toLowerCase().split(";")[0]?.trim() ?? ""] ?? [];
  const safeExt = allowedExts.includes(ext) ? ext : (allowedExts[0] ?? ".bin");
  return { kind, ext: safeExt };
}

/** Magic-byte sniffing for the worker: verify content matches its claim. */
export function sniffContentType(head: Buffer): string | null {
  if (head.length < 12) return null;
  const b = head;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const riff = b.subarray(0, 4).toString("ascii") === "RIFF";
  if (riff && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (riff && b.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  const ftypBrand = b.subarray(4, 8).toString("ascii") === "ftyp"
    ? b.subarray(8, 12).toString("ascii")
    : null;
  if (ftypBrand) {
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(ftypBrand)) return "image/heic";
    if (["qt  "].includes(ftypBrand)) return "video/quicktime";
    if (["M4A ", "M4B "].includes(ftypBrand)) return "audio/mp4";
    return "video/mp4"; // isom, mp41, mp42, avc1, M4V …
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return "audio/mpeg";
  if (b[0] === 0xff && ((b[1] as number) & 0xe0) === 0xe0) return "audio/mpeg";
  if (b.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  return null;
}

/** Reject anything executable/markup masquerading as media. */
export function isSuspicious(head: Buffer): boolean {
  const ascii = head.subarray(0, 64).toString("latin1").toLowerCase();
  return (
    ascii.startsWith("mz") ||           // PE
    ascii.startsWith("\x7felf") ||      // ELF
    ascii.includes("<svg") ||
    ascii.includes("<!doctype html") ||
    ascii.includes("<html") ||
    ascii.startsWith("#!")
  );
}
