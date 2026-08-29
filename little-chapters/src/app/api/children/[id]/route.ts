import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { childInputSchema, updateChild } from "@/server/domain/children";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, childInputSchema.partial());
    await updateChild(user.id, id, body);
    return { ok: true };
  });
}
