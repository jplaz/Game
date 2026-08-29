import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { reviewMilestoneSuggestion } from "@/server/domain/milestones";

const schema = z.object({
  decision: z.enum(["confirmed", "dismissed"]),
  happenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().max(200).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, schema);
    await reviewMilestoneSuggestion({ userId: user.id, milestoneId: id, ...body });
    return { ok: true };
  });
}
