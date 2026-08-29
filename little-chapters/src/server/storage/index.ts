import { env } from "@/server/env";
import type { Bucket, StorageDriver } from "@/server/storage/driver";
import { LocalStorageDriver } from "@/server/storage/local";
import { getSql } from "@/server/db/client";

export type { Bucket, StorageDriver } from "@/server/storage/driver";

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!driver) {
    if (env().STORAGE_DRIVER === "supabase") {
      // lazy import keeps the supabase client out of paths that never use it
      const { SupabaseStorageDriver } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@/server/storage/supabase") as typeof import("@/server/storage/supabase");
      driver = new SupabaseStorageDriver();
    } else {
      driver = new LocalStorageDriver();
    }
  }
  return driver;
}

/** Register a stored blob in the database. Application tables reference this
 *  row's id — raw storage keys never leave the storage layer. */
export async function recordStorageObject(opts: {
  familyId: string | null;
  bucket: Bucket;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  purpose: string;
}): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into storage_objects
      (family_id, bucket, object_key, content_type, size_bytes, checksum_sha256, purpose)
    values
      (${opts.familyId}, ${opts.bucket}, ${opts.objectKey}, ${opts.contentType},
       ${opts.sizeBytes}, ${opts.checksumSha256 ?? null}, ${opts.purpose})
    on conflict (bucket, object_key) do update
      set size_bytes = excluded.size_bytes,
          content_type = excluded.content_type,
          checksum_sha256 = excluded.checksum_sha256,
          deleted_at = null
    returning id
  `;
  const row = rows[0];
  if (!row) throw new Error("failed to record storage object");
  return row.id;
}

export async function getStorageObject(
  id: string
): Promise<{ id: string; bucket: Bucket; objectKey: string; contentType: string; sizeBytes: number } | null> {
  const sql = getSql();
  const rows = await sql<
    { id: string; bucket: Bucket; object_key: string; content_type: string; size_bytes: number }[]
  >`
    select id, bucket, object_key, content_type, size_bytes
    from storage_objects where id = ${id} and deleted_at is null
  `;
  const r = rows[0];
  return r
    ? { id: r.id, bucket: r.bucket, objectKey: r.object_key, contentType: r.content_type, sizeBytes: r.size_bytes }
    : null;
}
