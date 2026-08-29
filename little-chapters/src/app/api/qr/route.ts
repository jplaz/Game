import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createQrMemory } from "@/server/domain/qr";

const schema = z
  .object({
    memoryId: z.string().uuid().optional(),
    mediaId: z.string().uuid().optional(),
    title: z.string().max(120).optional(),
    visibility: z.enum(["family", "link", "password"]).optional(),
    password: z.string().min(4).max(100).optional(),
    expiresAt: z.string().datetime().nullish(),
    allowDownload: z.boolean().optional(),
  })
  .refine((v) => v.memoryId || v.mediaId, { message: "memoryId or mediaId required" });

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return createQrMemory({ userId: user.id, ...body });
  });
}
