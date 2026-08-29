import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createPortalSession } from "@/server/billing/stripe";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, z.object({ familyId: z.string().uuid() }));
    return createPortalSession({ userId: user.id, familyId: body.familyId });
  });
}
