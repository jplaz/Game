import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { storyboardSceneSchema, updateRecapStoryboard } from "@/server/domain/recaps";

const schema = z.object({
  storyboard: z.array(storyboardSceneSchema).max(60).optional(),
  title: z.string().max(120).optional(),
  aspect: z.enum(["9:16", "16:9", "1:1"]).optional(),
  targetDurationS: z.number().int().min(15).max(180).optional(),
  themeId: z.string().max(40).optional(),
  musicTrackId: z.string().uuid().nullish(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, schema);
    await updateRecapStoryboard({
      userId: user.id, recapId: id,
      storyboard: body.storyboard, title: body.title, aspect: body.aspect,
      targetDurationS: body.targetDurationS, themeId: body.themeId,
      musicTrackId: body.musicTrackId === undefined ? undefined : body.musicTrackId,
    });
    return { ok: true };
  });
}
