import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { requireUser } from "@/server/auth/session";
import { createStorybook } from "@/server/domain/storybooks";

const schema = z.object({
  childId: z.string().uuid(),
  memoryIds: z.array(z.string().uuid()).min(1).max(20),
  title: z.string().max(120).optional(),
  style: z.enum(["realistic", "illustrated", "playful"]).default("realistic"),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    await enforceRateLimit({ key: `storybook:${user.id}`, ...RATE_LIMITS.aiGenerate });
    const body = await parseBody(request, schema);
    return createStorybook({ userId: user.id, ...body });
  });
}
