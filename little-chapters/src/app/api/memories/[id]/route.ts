import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { deleteMemory, updateMemory } from "@/server/domain/memories";

const patchSchema = z.object({
  title: z.string().max(200).nullish(),
  body: z.string().max(20000).nullish(),
  happenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  isFavorite: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, patchSchema);
    await updateMemory({ userId: user.id, memoryId: id, ...body });
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
    await deleteMemory(user.id, id);
    return { ok: true };
  });
}
