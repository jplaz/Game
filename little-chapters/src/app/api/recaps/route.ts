import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createRecapFromChapter } from "@/server/domain/recaps";

const schema = z.object({
  chapterId: z.string().uuid(),
  aspect: z.enum(["9:16", "16:9", "1:1"]).optional(),
  targetDurationS: z.number().int().min(15).max(180).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return createRecapFromChapter({ userId: user.id, ...body });
  });
}
