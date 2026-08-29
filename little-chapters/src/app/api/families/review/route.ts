import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { reviewSubmission } from "@/server/domain/families";

const schema = z.object({
  familyId: z.string().uuid(),
  targetType: z.enum(["memory", "media"]),
  targetId: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    await reviewSubmission({ userId: user.id, ...body });
    return { ok: true };
  });
}
