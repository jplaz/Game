import sharp from "sharp";

/**
 * Image intelligence: derivatives + deterministic quality metrics.
 * Runs only in the worker tier. All derivatives are re-encoded (uploaded
 * bytes are never served back), which also strips EXIF/GPS from web copies.
 */

export interface ImageDerivatives {
  thumb: Buffer;       // 320px webp
  web: Buffer;         // 1600px webp
  width: number;
  height: number;
  capturedAt: Date | null;
}

export async function processImage(original: Buffer): Promise<ImageDerivatives> {
  const base = sharp(original, { failOn: "truncated" }).rotate(); // apply EXIF orientation
  const meta = await base.metadata();

  let capturedAt: Date | null = null;
  if (meta.exif) {
    capturedAt = parseExifDate(meta.exif);
  }

  const thumb = await base
    .clone()
    .resize(320, 320, { fit: "cover", position: "attention" })
    .webp({ quality: 78 })
    .toBuffer();
  const web = await base
    .clone()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();

  return {
    thumb,
    web,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    capturedAt,
  };
}

/** Minimal EXIF DateTimeOriginal scan (raw IFD parse would need a dep; the
 *  ASCII "YYYY:MM:DD HH:MM:SS" pattern in the EXIF block is reliable). */
function parseExifDate(exif: Buffer): Date | null {
  const ascii = exif.toString("latin1");
  const match = ascii.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(
    Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)
  );
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() < 1990 || date > new Date()) return null;
  return date;
}

export interface ImageQuality {
  sharpness: number;  // 0..1 (variance of Laplacian, log-normalized)
  exposure: number;   // 0..1 mean luma (0.5 ≈ well exposed)
  quality: number;    // combined 0..1
}

export async function scoreImageQuality(imageBuffer: Buffer): Promise<ImageQuality> {
  // analyze a small grayscale version — plenty for blur/exposure metrics
  const { data, info } = await sharp(imageBuffer)
    .resize(256, 256, { fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  let lapSum = 0;
  let lapSumSq = 0;
  let lumaSum = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) lumaSum += data[i] as number;

  let lapCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * (data[i] as number) -
        (data[i - 1] as number) -
        (data[i + 1] as number) -
        (data[i - w] as number) -
        (data[i + w] as number);
      lapSum += lap;
      lapSumSq += lap * lap;
      lapCount++;
    }
  }
  const mean = lapSum / lapCount;
  const variance = lapSumSq / lapCount - mean * mean;
  // log-normalize: variance ~10 = very blurry, ~1000+ = crisp
  const sharpness = Math.max(0, Math.min(1, Math.log10(Math.max(variance, 1)) / 3));
  const exposure = lumaSum / n / 255;
  // exposure sweet spot around 0.45–0.6
  const exposureFit = 1 - Math.min(1, Math.abs(exposure - 0.52) * 2.2);
  const quality = Math.max(0, Math.min(1, sharpness * 0.6 + exposureFit * 0.4));
  return { sharpness, exposure, quality };
}

/**
 * 64-bit difference hash for duplicate/burst clustering.
 * Returns 16 hex chars; hamming distance ≤ 10 ≈ near-duplicate.
 */
export async function computeDHash(imageBuffer: Buffer): Promise<string> {
  const { data } = await sharp(imageBuffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x] as number;
      const right = data[y * 9 + x + 1] as number;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export function hammingDistance(hashA: string, hashB: string): number {
  const a = BigInt(`0x${hashA}`);
  const b = BigInt(`0x${hashB}`);
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
