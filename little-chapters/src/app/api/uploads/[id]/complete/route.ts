import { handle } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { completeUpload } from "@/server/media/uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    return completeUpload({ userId: user.id, mediaId: id });
  });
}
