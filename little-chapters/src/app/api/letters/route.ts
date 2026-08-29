import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createLetter } from "@/server/domain/letters";

const schema = z.object({
  childId: z.string().uuid(),
  kind: z.enum(["birthday", "annual", "future", "first_day_of_school", "graduation", "general"]),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  unlockAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  unlockLabel: z.string().max(120).nullish(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const id = await createLetter({ userId: user.id, ...body });
    return { letterId: id };
  });
}
