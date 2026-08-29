import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { searchMemories } from "@/server/domain/search";

const schema = z.object({
  familyId: z.string().uuid(),
  query: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return searchMemories({ userId: user.id, familyId: body.familyId, query: body.query });
  });
}
