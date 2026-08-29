import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { updateQrPolicy } from "@/server/domain/qr";

const schema = z.object({
  visibility: z.enum(["family", "link", "password", "disabled"]).optional(),
  password: z.string().min(4).max(100).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  allowDownload: z.boolean().optional(),
  revoke: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, schema);
    await updateQrPolicy({ userId: user.id, qrMemoryId: id, ...body });
    return { ok: true };
  });
}
