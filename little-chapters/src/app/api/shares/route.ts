import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createShareLink } from "@/server/domain/sharing";

const schema = z.object({
  familyId: z.string().uuid(),
  targetType: z.enum(["chapter", "memory", "book", "recap"]),
  targetId: z.string().uuid(),
  visibility: z.enum(["family", "link", "password"]),
  password: z.string().min(4).max(100).optional(),
  expiresAt: z.string().datetime().nullish(),
  allowDownload: z.boolean().optional(),
  allowComments: z.boolean().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return createShareLink({ userId: user.id, ...body });
  });
}
