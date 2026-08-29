import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { requireUser } from "@/server/auth/session";
import { requestChapterGeneration } from "@/server/domain/chapters";

const schema = z.object({
  childId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    await enforceRateLimit({ key: `generate:${user.id}`, ...RATE_LIMITS.aiGenerate });
    const body = await parseBody(request, schema);
    return requestChapterGeneration({ userId: user.id, ...body });
  });
}
