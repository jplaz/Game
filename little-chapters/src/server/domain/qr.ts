import QRCode from "qrcode";
import { getSql } from "@/server/db/client";
import { assertResourceAccess } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";
import { hashPassword, opaqueToken, verifyPassword } from "@/lib/tokens";
import { audit } from "@/server/observability/audit";
import { env } from "@/server/env";

/**
 * QR memories — the permanent redirect layer for printed books.
 *
 * The printed code encodes ONLY `{APP_URL}/m/{token}`: no media info, no
 * storage info, no family info. Resolution maps token → row → current media
 * through the database, so storage backends, encodings, and CDNs can all
 * change over the decades a printed book exists. Policy (family/link/password/
 * expiry/revocation) is re-evaluated on every scan. Default: family-only.
 */

export async function createQrMemory(opts: {
  userId: string;
  memoryId?: string;
  mediaId?: string;
  title?: string;
  visibility?: "family" | "link" | "password";
  password?: string;
  expiresAt?: string | null;
  allowDownload?: boolean;
}): Promise<{ qrMemoryId: string; token: string; url: string }> {
  if (!opts.memoryId && !opts.mediaId) {
    throw new ValidationError("A QR memory needs a memory or a media item");
  }
  const ctx = opts.memoryId
    ? await assertResourceAccess(opts.userId, "memories", opts.memoryId, "parent")
    : await assertResourceAccess(opts.userId, "media", opts.mediaId!, "parent");

  const visibility = opts.visibility ?? "family";
  let passwordHash: string | null = null;
  let passwordSalt: string | null = null;
  if (visibility === "password") {
    if (!opts.password || opts.password.length < 4) {
      throw new ValidationError("Password must be at least 4 characters");
    }
    const hashed = hashPassword(opts.password);
    passwordHash = hashed.hash;
    passwordSalt = hashed.salt;
  }

  const sql = getSql();
  // reuse an existing active token for the same target so reprints stay stable
  const existing = await sql<{ id: string; token: string }[]>`
    select id, token from qr_memories
    where family_id = ${ctx.familyId}
      and memory_id is not distinct from ${opts.memoryId ?? null}
      and media_id is not distinct from ${opts.mediaId ?? null}
      and revoked_at is null
    limit 1
  `;
  if (existing[0]) {
    return {
      qrMemoryId: existing[0].id,
      token: existing[0].token,
      url: qrUrl(existing[0].token),
    };
  }

  const token = opaqueToken(26);
  const rows = await sql<{ id: string }[]>`
    insert into qr_memories
      (family_id, created_by, token, memory_id, media_id, title, visibility,
       password_hash, password_salt, expires_at, allow_download)
    values
      (${ctx.familyId}, ${opts.userId}, ${token}, ${opts.memoryId ?? null},
       ${opts.mediaId ?? null}, ${opts.title ?? null}, ${visibility},
       ${passwordHash}, ${passwordSalt}, ${opts.expiresAt ?? null},
       ${opts.allowDownload ?? false})
    returning id
  `;
  await audit({
    familyId: ctx.familyId, actorId: opts.userId, action: "qr_memory.created",
    targetType: "qr_memory", targetId: rows[0]!.id, detail: { visibility },
  });
  return { qrMemoryId: rows[0]!.id, token, url: qrUrl(token) };
}

export function qrUrl(token: string): string {
  return `${env().NEXT_PUBLIC_APP_URL}/m/${token}`;
}

/** SVG QR code for embedding in web pages and print PDFs. */
export async function renderQrSvg(token: string): Promise<string> {
  return QRCode.toString(qrUrl(token), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#2B2823", light: "#00000000" },
  });
}

export interface ResolvedQr {
  qrMemoryId: string;
  familyId: string;
  memoryId: string | null;
  mediaId: string | null;
  title: string | null;
  allowDownload: boolean;
  requires: "none" | "password" | "family_auth";
}

export async function resolveQrToken(
  token: string,
  opts: { password?: string; viewerUserId?: string | null } = {}
): Promise<ResolvedQr> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; memory_id: string | null; media_id: string | null;
      title: string | null; visibility: string; password_hash: string | null;
      password_salt: string | null; expires_at: Date | null; revoked_at: Date | null;
      allow_download: boolean }[]
  >`
    select id, family_id, memory_id, media_id, title, visibility, password_hash,
           password_salt, expires_at, revoked_at, allow_download
    from qr_memories where token = ${token}
  `;
  const qr = rows[0];
  if (!qr || qr.revoked_at || qr.visibility === "disabled") {
    throw new NotFoundError("This memory is no longer shared");
  }
  if (qr.expires_at && qr.expires_at < new Date()) {
    throw new NotFoundError("This memory's sharing window has ended");
  }

  let requires: ResolvedQr["requires"] = "none";
  if (qr.visibility === "family") {
    if (!opts.viewerUserId) {
      requires = "family_auth";
    } else {
      const member = await sql`
        select 1 from family_members
        where family_id = ${qr.family_id} and user_id = ${opts.viewerUserId}
      `;
      if (member.length === 0) throw new NotFoundError("This memory is shared with family only");
    }
  } else if (qr.visibility === "password") {
    if (!opts.password) {
      requires = "password";
    } else if (
      !qr.password_hash || !qr.password_salt ||
      !verifyPassword(opts.password, qr.password_hash, qr.password_salt)
    ) {
      throw new NotFoundError("That password isn't right");
    }
  }

  if (requires === "none") {
    await sql`
      update qr_memories set scan_count = scan_count + 1, last_scanned_at = now()
      where id = ${qr.id}
    `;
  }
  return {
    qrMemoryId: qr.id,
    familyId: qr.family_id,
    memoryId: qr.memory_id,
    mediaId: qr.media_id,
    title: qr.title,
    allowDownload: qr.allow_download,
    requires,
  };
}

export async function updateQrPolicy(opts: {
  userId: string;
  qrMemoryId: string;
  visibility?: "family" | "link" | "password" | "disabled";
  password?: string;
  expiresAt?: string | null;
  allowDownload?: boolean;
  revoke?: boolean;
}): Promise<void> {
  const ctx = await assertResourceAccess(opts.userId, "qr_memories", opts.qrMemoryId, "parent");
  const sql = getSql();
  let passwordHash: string | null | undefined;
  let passwordSalt: string | null | undefined;
  if (opts.visibility === "password" && opts.password) {
    const hashed = hashPassword(opts.password);
    passwordHash = hashed.hash;
    passwordSalt = hashed.salt;
  }
  await sql`
    update qr_memories set
      visibility = coalesce(${opts.visibility ?? null}, visibility),
      password_hash = coalesce(${passwordHash ?? null}, password_hash),
      password_salt = coalesce(${passwordSalt ?? null}, password_salt),
      expires_at = ${opts.expiresAt === undefined ? sql`expires_at` : opts.expiresAt},
      allow_download = coalesce(${opts.allowDownload ?? null}, allow_download),
      revoked_at = case when ${opts.revoke ?? false} then now() else revoked_at end
    where id = ${opts.qrMemoryId}
  `;
  await audit({
    familyId: ctx.familyId, actorId: opts.userId, action: "qr_memory.policy_changed",
    targetType: "qr_memory", targetId: opts.qrMemoryId,
    detail: { visibility: opts.visibility ?? null, revoked: opts.revoke ?? false },
  });
}
