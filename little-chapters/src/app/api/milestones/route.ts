import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createMilestone } from "@/server/domain/milestones";

const schema = z.object({
  childId: z.string().uuid(),
  title: z.string().min(1).max(200),
  category: z.enum([
    "movement", "communication", "food", "sleep", "social", "travel",
    "holidays", "family", "personality", "firsts", "custom",
  ]),
  happenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memoryId: z.string().uuid().nullish(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const id = await createMilestone({ userId: user.id, ...body });
    return { milestoneId: id };
  });
}
