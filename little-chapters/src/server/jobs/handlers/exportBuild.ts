import { ZipArchive } from "archiver";
import { PassThrough } from "stream";
import { getSql } from "@/server/db/client";
import { getStorage, recordStorageObject } from "@/server/storage";
import { updateJobProgress } from "@/server/jobs/queue";
import { notifyUser } from "@/server/notifications";
import { logger } from "@/server/observability/logger";

/**
 * export.build — full-account takeout: originals, transcripts, memories,
 * milestones, growth, letters as JSON + a readable index. Standard formats,
 * no lock-in. The archive lands in the exports bucket with a 7-day signed
 * download window (re-request any time).
 */
export async function handleExportBuild(
  jobId: string,
  payload: { exportId: string }
): Promise<void> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; requested_by: string; scope: string; child_id: string | null }[]
  >`
    select id, family_id, requested_by, scope, child_id
    from exports where id = ${payload.exportId}
  `;
  const exportRow = rows[0];
  if (!exportRow) return;
  await sql`update exports set status = 'building' where id = ${exportRow.id}`;

  const storage = getStorage();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const collector = new PassThrough();
  const chunks: Buffer[] = [];
  collector.on("data", (c: Buffer) => chunks.push(c));
  archive.pipe(collector);

  const childFilter = exportRow.scope === "child" && exportRow.child_id
    ? sql`and child_id = ${exportRow.child_id}`
    : sql``;

  // metadata JSON (memories, milestones, growth, letters, children)
  if (exportRow.scope !== "media_only") {
    const children = await sql`
      select id, full_name, nickname, pronouns, birth_date::text as birth_date,
             birth_location, birth_weight_grams, birth_length_mm,
             pregnancy_story, birth_story, personality_notes
      from children where family_id = ${exportRow.family_id} and deleted_at is null
    `;
    const memories = await sql`
      select id, child_id, kind, title, body, transcript,
             happened_at::text as happened_at, tags, created_at
      from memories where family_id = ${exportRow.family_id} and deleted_at is null
        ${childFilter}
      order by happened_at
    `;
    const milestones = await sql`
      select child_id, title, category, happened_at::text as happened_at
      from milestones where family_id = ${exportRow.family_id} and status = 'confirmed'
        ${childFilter}
      order by happened_at
    `;
    const growth = await sql`
      select child_id, measured_at::text as measured_at, weight_grams, height_mm,
             head_circumference_mm, clothing_size, shoe_size, diaper_size, note
      from growth_entries where family_id = ${exportRow.family_id}
        ${childFilter}
      order by measured_at
    `;
    const letters = await sql`
      select child_id, kind, title, body, unlock_at::text as unlock_at, created_at
      from letters where family_id = ${exportRow.family_id} and deleted_at is null
        ${childFilter}
    `;
    archive.append(JSON.stringify({ children, memories, milestones, growth, letters }, null, 2), {
      name: "metadata/archive.json",
    });
    const readable = [
      "# Your Little Chapters Archive",
      "",
      "This export contains your family's complete archive:",
      "- media/            original photos, videos, and voice recordings",
      "- metadata/         everything else as JSON (memories, milestones, growth, letters)",
      "",
      "Media filenames are `{date}_{id}{ext}` and match the `media` ids in the JSON.",
    ].join("\n");
    archive.append(readable, { name: "README.md" });
  }

  // originals
  const media = await sql<
    { id: string; kind: string; bucket: string; object_key: string;
      captured_at: Date | null; original_filename: string | null }[]
  >`
    select m.id, m.kind, so.bucket, so.object_key, m.captured_at, m.original_filename
    from media m join storage_objects so on so.id = m.original_object_id
    where m.family_id = ${exportRow.family_id} and m.deleted_at is null
      ${exportRow.scope === "child" && exportRow.child_id ? sql`and m.child_id = ${exportRow.child_id}` : sql``}
  `;
  let processed = 0;
  for (const item of media) {
    try {
      const bytes = await storage.getObject(item.bucket as never, item.object_key);
      const date = item.captured_at?.toISOString().slice(0, 10) ?? "undated";
      const dot = item.object_key.lastIndexOf(".");
      const ext = dot >= 0 ? item.object_key.slice(dot) : "";
      archive.append(bytes, { name: `media/${item.kind}/${date}_${item.id}${ext}` });
    } catch {
      archive.append(`missing: ${item.id}\n`, { name: `media/errors/${item.id}.txt` });
    }
    processed += 1;
    if (processed % 20 === 0) {
      await updateJobProgress(jobId, 0.1 + (processed / media.length) * 0.7, `Packing media ${processed}/${media.length}`);
    }
  }

  await archive.finalize();
  await new Promise<void>((resolve) => collector.on("end", () => resolve()));
  const zip = Buffer.concat(chunks);
  await updateJobProgress(jobId, 0.9, "Uploading archive");

  const key = `${exportRow.family_id}/${exportRow.id}.zip`;
  await storage.putObject("exports", key, zip, "application/zip");
  const objectId = await recordStorageObject({
    familyId: exportRow.family_id, bucket: "exports", objectKey: key,
    contentType: "application/zip", sizeBytes: zip.length, purpose: "export",
  });
  await sql`
    update exports set status = 'ready', storage_object_id = ${objectId},
      size_bytes = ${zip.length}, expires_at = now() + interval '7 days'
    where id = ${exportRow.id}
  `;
  await notifyUser({
    userId: exportRow.requested_by,
    familyId: exportRow.family_id,
    type: "export.ready",
    title: "Your archive is ready",
    body: "Your full family archive export is ready to download. The link is available for 7 days.",
    linkPath: "/settings/export",
  });
  logger.info("export built", { exportId: exportRow.id, familyId: exportRow.family_id, sizeBytes: zip.length });
}
