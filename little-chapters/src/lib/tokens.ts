import { randomBytes, createHash, scryptSync, timingSafeEqual } from "crypto";

/**
 * Opaque token generation for share links, QR memories, and invitations.
 *
 * Crockford base32, ≥128 bits of entropy, no vowel-adjacent ambiguity —
 * safe to print in a physical book and type by hand if the camera fails.
 */

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // crockford, lowercase

export function opaqueToken(chars = 26): string {
  const bytes = randomBytes(chars);
  let out = "";
  for (let i = 0; i < chars; i++) {
    out += ALPHABET[(bytes[i] as number) % 32];
  }
  return out;
}

/** Hash for tokens stored server-side (share links, invitations). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Password hashing for share/QR passwords (scrypt, per-item salt). */
export function hashPassword(password: string, salt?: string): {
  hash: string;
  salt: string;
} {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password.normalize("NFKC"), s, 32).toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(
  password: string,
  hash: string,
  salt: string
): boolean {
  const candidate = scryptSync(password.normalize("NFKC"), salt, 32);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
