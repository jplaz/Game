import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { assertResourceAccess } from "@/server/authz";
import { getSql } from "@/server/db/client";
import { getStorage } from "@/server/storage";
import { NotFoundError } from "@/server/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertResourceAccess(user.id, "exports", id, "owner");
    const sql = getSql();
    const rows = await sql<
      { bucket: string; object_key: string; status: string; expires_at: Date | null }[]
    >`
      select so.bucket, so.object_key, e.status, e.expires_at
      from exports e join storage_objects so on so.id = e.storage_object_id
      where e.id = ${id}
    `;
    const row = rows[0];
    if (!row || row.status !== "ready") throw new NotFoundError("Export");
    if (row.expires_at && row.expires_at < new Date()) {
      throw new NotFoundError("Export (expired — request a fresh one)");
    }
    const url = await getStorage().createSignedReadUrl(
      row.bucket as never, row.object_key, 3600, "little-chapters-archive.zip"
    );
    return { url };
  });
}
