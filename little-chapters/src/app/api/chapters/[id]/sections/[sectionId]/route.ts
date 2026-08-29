import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { updateChapterSection } from "@/server/domain/chapters";

const schema = z.object({
  title: z.string().max(200).nullish(),
  content: z.record(z.unknown()).optional(),
  hidden: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id, sectionId } = await params;
    const body = await parseBody(request, schema);
    await updateChapterSection({
      userId: user.id,
      chapterId: id,
      sectionId,
      title: body.title,
      content: body.content as never,
      hidden: body.hidden,
      sortOrder: body.sortOrder,
    });
    return { ok: true };
  });
}
