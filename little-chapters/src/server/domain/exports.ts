import { getSql } from "@/server/db/client";
import { assertFamilyRole } from "@/server/authz";
import { ConflictError } from "@/server/errors";
import { enqueueJob } from "@/server/jobs/queue";
import { audit } from "@/server/observability/audit";

/**
 * Full-account export: originals + transcripts + metadata JSON + a readable
 * HTML index, packaged as a zip in the exports bucket. Families are never
 * locked in — this is a product promise, not an afterthought.
 */

export async function requestExport(opts: {
  userId: string;
  familyId: string;
  scope?: "full" | "child" | "media_only";
  childId?: string | null;
}): Promise<{ exportId: string; jobId: string | null }> {
  await assertFamilyRole(opts.userId, opts.familyId, "owner");
  const sql = getSql();
  const inFlight = await sql`
    select 1 from exports
    where family_id = ${opts.familyId} and status in ('queued','building')
  `;
  if (inFlight.length > 0) {
    throw new ConflictError("An export is already being prepared");
  }
  const rows = await sql<{ id: string }[]>`
    insert into exports (family_id, requested_by, scope, child_id, status)
    values (${opts.familyId}, ${opts.userId}, ${opts.scope ?? "full"},
            ${opts.childId ?? null}, 'queued')
    returning id
  `;
  const exportId = rows[0]!.id;
  const jobId = await enqueueJob({
    type: "export.build",
    familyId: opts.familyId,
    payload: { exportId },
    idempotencyKey: `export:${exportId}`,
    priority: 6,
  });
  await audit({
    familyId: opts.familyId, actorId: opts.userId, action: "export.requested",
    targetType: "export", targetId: exportId, detail: { scope: opts.scope ?? "full" },
  });
  return { exportId, jobId };
}

export async function listExports(
  userId: string,
  familyId: string
): Promise<Array<{ id: string; status: string; sizeBytes: number | null;
  createdAt: Date; expiresAt: Date | null; storageObjectId: string | null }>> {
  await assertFamilyRole(userId, familyId, "owner");
  const sql = getSql();
  const rows = await sql<
    { id: string; status: string; size_bytes: string | null; created_at: Date;
      expires_at: Date | null; storage_object_id: string | null }[]
  >`
    select id, status, size_bytes, created_at, expires_at, storage_object_id
    from exports where family_id = ${familyId}
    order by created_at desc limit 20
  `;
  return rows.map((r) => ({
    id: r.id, status: r.status,
    sizeBytes: r.size_bytes ? Number(r.size_bytes) : null,
    createdAt: r.created_at, expiresAt: r.expires_at,
    storageObjectId: r.storage_object_id,
  }));
}
