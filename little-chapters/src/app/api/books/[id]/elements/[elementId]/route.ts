import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { updatePageElement } from "@/server/domain/books";

const frameSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.01).max(1),
  h: z.number().min(0.01).max(1),
});

const schema = z.object({
  mediaId: z.string().uuid().nullish(),
  frame: frameSchema.optional(),
  props: z.record(z.unknown()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id, elementId } = await params;
    const body = await parseBody(request, schema);
    await updatePageElement({
      userId: user.id, bookId: id, elementId,
      mediaId: body.mediaId, frame: body.frame, props: body.props,
    });
    return { ok: true };
  });
}
