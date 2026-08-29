import { getSql } from "@/server/db/client";
import { assertFamilyRole, type FamilyContext } from "@/server/authz";
import { getStorage, recordStorageObject } from "@/server/storage";
import { validateUpload } from "@/server/media/validation";
import { assertWithinLimit, recordUsage } from "@/server/billing/usage";
import { enqueueJob } from "@/server/jobs/queue";
import { NotFoundError, ValidationError } from "@/server/errors";
import { logger } from "@/server/observability/logger";

/**
 * Upload flow:
 *  1. admitUpload — validate + quota-check, create media row (status=uploading),
 *     return a signed PUT target for a direct-to-storage upload.
 *  2. client uploads (resumable at the client's discretion; re-request a
 *     target to retry — admission is idempotent per clientRef).
 *  3. completeUpload — verify the object landed with the declared size,
 *     record it, meter storage, enqueue media.ingest.
 */

const UPLOAD_URL_TTL_S = 15 * 60;

export interface UploadAdmission {
  mediaId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  method: "PUT";
}

export async function admitUpload(opts: {
  userId: string;
  familyId: string;
  childId?: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  capturedAt?: string | null;
}): Promise<UploadAdmission> {
  const ctx = await assertFamilyRole(opts.userId, opts.familyId, "contributor");
  const { kind, ext } = validateUpload({
    contentType: opts.contentType,
    sizeBytes: opts.sizeBytes,
    filename: opts.filename,
  });
  await assertWithinLimit(opts.familyId, "storage_bytes", opts.sizeBytes, "storage");

  if (opts.childId) {
    const sql = getSql();
    const child = await sql`
      select 1 from children where id = ${opts.childId}
        and family_id = ${opts.familyId} and deleted_at is null
    `;
    if (child.length === 0) throw new NotFoundError("Child");
  }

  const sql = getSql();
  // contributors' media awaits parent approval; parents' is auto-approved
  const approval = ctx.role === "contributor" ? "pending" : "approved";
  const rows = await sql<{ id: string }[]>`
    insert into media
      (family_id, child_id, uploaded_by, kind, status, original_filename,
       declared_content_type, declared_size_bytes, approval_status,
       captured_at, captured_at_source)
    values
      (${opts.familyId}, ${opts.childId ?? null}, ${opts.userId}, ${kind},
       'uploading', ${opts.filename.slice(0, 255)}, ${opts.contentType},
       ${opts.sizeBytes}, ${approval},
       ${opts.capturedAt ?? null}, ${opts.capturedAt ? "user" : null})
    returning id
  `;
  const mediaId = rows[0]?.id;
  if (!mediaId) throw new Error("failed to create media row");

  const key = `${opts.familyId}/${mediaId}/original${ext}`;
  const target = await getStorage().createSignedUploadUrl(
    "originals",
    key,
    opts.contentType,
    UPLOAD_URL_TTL_S
  );

  logger.info("upload admitted", { familyId: opts.familyId, mediaId, sizeBytes: opts.sizeBytes });
  return { mediaId, uploadUrl: target.url, headers: target.headers, method: target.method };
}

export async function completeUpload(opts: {
  userId: string;
  mediaId: string;
}): Promise<{ mediaId: string; status: string }> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; uploaded_by: string; declared_size_bytes: string;
      declared_content_type: string; original_filename: string | null; status: string }[]
  >`
    select id, family_id, uploaded_by, declared_size_bytes, declared_content_type,
           original_filename, status
    from media where id = ${opts.mediaId} and deleted_at is null
  `;
  const media = rows[0];
  if (!media) throw new NotFoundError("Upload");
  const ctx: FamilyContext = await assertFamilyRole(opts.userId, media.family_id, "contributor");
  if (ctx.role === "contributor" && media.uploaded_by !== opts.userId) {
    throw new NotFoundError("Upload");
  }
  if (media.status === "ready" || media.status === "processing") {
    return { mediaId: media.id, status: media.status }; // idempotent completion
  }

  const dot = media.original_filename?.lastIndexOf(".") ?? -1;
  const ext = dot >= 0 ? media.original_filename!.slice(dot).toLowerCase() : ".bin";
  const key = `${media.family_id}/${media.id}/original${ext}`;
  const head = await getStorage().headObject("originals", key);
  if (!head) {
    throw new ValidationError("Upload didn't finish — please retry");
  }
  const declared = Number(media.declared_size_bytes);
  if (head.sizeBytes !== declared) {
    throw new ValidationError(
      "Uploaded file doesn't match what was declared — please retry"
    );
  }

  const objectId = await recordStorageObject({
    familyId: media.family_id,
    bucket: "originals",
    objectKey: key,
    contentType: media.declared_content_type,
    sizeBytes: head.sizeBytes,
    purpose: "original",
  });

  await sql`
    update media set status = 'processing', original_object_id = ${objectId}
    where id = ${media.id}
  `;
  await recordUsage({
    familyId: media.family_id,
    metric: "storage_bytes",
    delta: head.sizeBytes,
    refType: "media",
    refId: media.id,
  });
  await enqueueJob({
    type: "media.ingest",
    familyId: media.family_id,
    payload: { mediaId: media.id },
    idempotencyKey: `ingest:${media.id}`,
    priority: 3,
  });

  return { mediaId: media.id, status: "processing" };
}
