import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { acceptInvitation } from "@/server/domain/families";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, z.object({ token: z.string().min(10).max(100) }));
    return acceptInvitation(user.id, body.token);
  });
}
