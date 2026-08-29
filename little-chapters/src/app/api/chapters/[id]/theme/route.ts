import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { setChapterTheme } from "@/server/domain/chapters";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, z.object({ themeId: z.string().max(40) }));
    await setChapterTheme({ userId: user.id, chapterId: id, themeId: body.themeId });
    return { ok: true };
  });
}
