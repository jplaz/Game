import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { assertResourceAccess } from "@/server/authz";
import { getSql } from "@/server/db/client";
import { recordUsage } from "@/server/billing/usage";

const patchSchema = z.object({
  isFavorite: z.boolean().optional(),
  hidden: z.boolean().optional(),
  altText: z.string().max(500).nullish(),
  capturedAt: z.string().datetime().optional(),
  childId: z.string().uuid().nullish(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const ctx = await assertResourceAccess(user.id, "media", id, "parent");
    const body = await parseBody(request, patchSchema);
    const sql = getSql();
    if (body.childId) {
      const child = await sql`
        select 1 from children where id = ${body.childId}
          and family_id = ${ctx.familyId} and deleted_at is null
      `;
      if (child.length === 0) return { ok: false };
    }
    await sql`
      update media set
        is_favorite = coalesce(${body.isFavorite ?? null}, is_favorite),
        hidden = coalesce(${body.hidden ?? null}, hidden),
        alt_text = coalesce(${body.altText ?? null}, alt_text),
        captured_at = coalesce(${body.capturedAt ?? null}, captured_at),
        captured_at_source = case when ${body.capturedAt ?? null}::timestamptz is not null
          then 'user' else captured_at_source end,
        child_id = coalesce(${body.childId ?? null}, child_id)
      where id = ${id} and family_id = ${ctx.familyId}
    `;
    return { ok: true };
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const ctx = await assertResourceAccess(user.id, "media", id, "parent");
    const sql = getSql();
    // soft delete (30-day trash window; storage purge happens at hard delete)
    const rows = await sql<{ size: string | null }[]>`
      with deleted as (
        update media set deleted_at = now()
        where id = ${id} and family_id = ${ctx.familyId} and deleted_at is null
        returning original_object_id
      )
      select sum(so.size_bytes)::text as size
      from deleted d join storage_objects so on so.id = d.original_object_id
    `;
    const freed = Number(rows[0]?.size ?? 0);
    if (freed > 0) {
      await recordUsage({
        familyId: ctx.familyId, metric: "storage_bytes", delta: -freed,
        refType: "media", refId: id,
      });
    }
    return { ok: true };
  });
}
