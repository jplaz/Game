import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { toggleReaction } from "@/server/domain/feed";

const schema = z.object({
  familyId: z.string().uuid(),
  targetType: z.enum(["memory", "media", "chapter", "recap", "comment"]),
  targetId: z.string().uuid(),
  emoji: z.enum(["❤️", "😂", "🥹", "🎉"]),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return toggleReaction({ userId: user.id, ...body });
  });
}
