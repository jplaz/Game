import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { addComment } from "@/server/domain/feed";

const schema = z.object({
  familyId: z.string().uuid(),
  targetType: z.enum(["memory", "media", "chapter", "recap", "letter"]),
  targetId: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const id = await addComment({ userId: user.id, ...body });
    return { commentId: id };
  });
}
