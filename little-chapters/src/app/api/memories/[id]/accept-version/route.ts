import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { acceptMemoryVersion } from "@/server/domain/memories";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, z.object({ versionId: z.string().uuid() }));
    await acceptMemoryVersion(user.id, id, body.versionId);
    return { ok: true };
  });
}
