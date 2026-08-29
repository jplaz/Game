import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { childInputSchema, createChild } from "@/server/domain/children";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(
      request,
      childInputSchema.extend({ familyId: z.string().uuid() })
    );
    const { familyId, ...input } = body;
    return createChild(user.id, familyId, input);
  });
}
