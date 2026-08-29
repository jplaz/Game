import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/server/env";

/**
 * HMAC token signing for media access and local-driver storage URLs.
 *
 * Key rotation: MEDIA_TOKEN_SECRET may be a comma-separated keyring — the
 * first key signs, all keys verify, so old links keep working during overlap.
 */

function keyring(): string[] {
  return env()
    .MEDIA_TOKEN_SECRET.split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export interface SignedPayload {
  /** what this token authorizes, e.g. "read:originals:fam/media/original.jpg" */
  scope: string;
  /** unix seconds */
  exp: number;
}

export function signToken(payload: SignedPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = keyring()[0];
  if (!key) throw new Error("MEDIA_TOKEN_SECRET not configured");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyToken(token: string): SignedPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const valid = keyring().some((key) => {
    const expected = createHmac("sha256", key).update(body).digest("base64url");
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!valid) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SignedPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    if (typeof payload.scope !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
