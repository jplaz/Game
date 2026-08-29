import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { requestExport } from "@/server/domain/exports";

const schema = z.object({
  familyId: z.string().uuid(),
  scope: z.enum(["full", "child", "media_only"]).optional(),
  childId: z.string().uuid().nullish(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return requestExport({ userId: user.id, ...body });
  });
}
