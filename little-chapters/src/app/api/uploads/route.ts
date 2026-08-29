import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { requireUser } from "@/server/auth/session";
import { admitUpload } from "@/server/media/uploads";

const schema = z.object({
  familyId: z.string().uuid(),
  childId: z.string().uuid().nullish(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  capturedAt: z.string().datetime().nullish(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    await enforceRateLimit({ key: `upload:${user.id}`, ...RATE_LIMITS.uploadAdmission });
    const body = await parseBody(request, schema);
    return admitUpload({
      userId: user.id,
      familyId: body.familyId,
      childId: body.childId,
      filename: body.filename,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      capturedAt: body.capturedAt,
    });
  });
}
