import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createVoiceMemory } from "@/server/domain/memories";

const schema = z.object({
  childId: z.string().uuid(),
  audioMediaId: z.string().uuid(),
  happenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return createVoiceMemory({ userId: user.id, ...body });
  });
}
