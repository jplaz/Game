import { getSql } from "@/server/db/client";
import { assertFamilyRole } from "@/server/authz";
import { getStorage } from "@/server/storage";
import { NotFoundError } from "@/server/errors";
import type { Bucket } from "@/server/storage/driver";

/**
 * Authorized, short-lived media URL minting. The ONLY way media bytes are
 * ever reached. Every call re-checks family membership (or share/QR policy —
 * see domain/sharing) before signing.
 */

const READ_TTL_S = 10 * 60;

export type MediaVariant = "original" | "thumb" | "web" | "poster" | "web_video" | "waveform";

interface ObjectRef {
  bucket: Bucket;
  objectKey: string;
}

async function resolveVariantObject(
  mediaId: string,
  variant: MediaVariant
): Promise<{ familyId: string; ref: ObjectRef; approvalStatus: string; uploadedBy: string; hidden: boolean } | null> {
  const sql = getSql();
  if (variant === "original") {
    const rows = await sql<
      { family_id: string; bucket: Bucket; object_key: string; approval_status: string; uploaded_by: string; hidden: boolean }[]
    >`
      select m.family_id, so.bucket, so.object_key, m.approval_status, m.uploaded_by, m.hidden
      from media m join storage_objects so on so.id = m.original_object_id
      where m.id = ${mediaId} and m.deleted_at is null and so.deleted_at is null
    `;
    const r = rows[0];
    return r
      ? { familyId: r.family_id, ref: { bucket: r.bucket, objectKey: r.object_key },
          approvalStatus: r.approval_status, uploadedBy: r.uploaded_by, hidden: r.hidden }
      : null;
  }
  const rows = await sql<
    { family_id: string; bucket: Bucket; object_key: string; approval_status: string; uploaded_by: string; hidden: boolean }[]
  >`
    select m.family_id, so.bucket, so.object_key, m.approval_status, m.uploaded_by, m.hidden
    from media m
    join media_variants mv on mv.media_id = m.id and mv.variant = ${variant}
    join storage_objects so on so.id = mv.storage_object_id
    where m.id = ${mediaId} and m.deleted_at is null and so.deleted_at is null
  `;
  const r = rows[0];
  return r
    ? { familyId: r.family_id, ref: { bucket: r.bucket, objectKey: r.object_key },
        approvalStatus: r.approval_status, uploadedBy: r.uploaded_by, hidden: r.hidden }
    : null;
}

/** Signed URL for a family member. */
export async function getMediaUrlForUser(
  userId: string,
  mediaId: string,
  variant: MediaVariant,
  download = false
): Promise<string> {
  const resolved = await resolveVariantObject(mediaId, variant);
  if (!resolved) throw new NotFoundError("Media");
  const ctx = await assertFamilyRole(userId, resolved.familyId, "viewer");
  const isPrivileged = ctx.role === "owner" || ctx.role === "parent";
  const isUploader = resolved.uploadedBy === userId;
  if (!isPrivileged && (resolved.approvalStatus !== "approved" || resolved.hidden) && !isUploader) {
    throw new NotFoundError("Media");
  }
  return getStorage().createSignedReadUrl(
    resolved.ref.bucket,
    resolved.ref.objectKey,
    READ_TTL_S,
    download ? `little-chapters-${mediaId}${extOf(resolved.ref.objectKey)}` : undefined
  );
}

/** Signed URL minting AFTER share/QR policy checks (caller enforces policy). */
export async function getMediaUrlUnchecked(
  mediaId: string,
  variant: MediaVariant,
  download = false
): Promise<string | null> {
  const resolved = await resolveVariantObject(mediaId, variant);
  if (!resolved) return null;
  return getStorage().createSignedReadUrl(
    resolved.ref.bucket,
    resolved.ref.objectKey,
    READ_TTL_S,
    download ? `little-chapters-${mediaId}${extOf(resolved.ref.objectKey)}` : undefined
  );
}

function extOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot >= 0 ? key.slice(dot) : "";
}
