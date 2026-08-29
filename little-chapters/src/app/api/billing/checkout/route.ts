import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createCheckoutSession } from "@/server/billing/stripe";

const schema = z.object({
  familyId: z.string().uuid(),
  planId: z.string().max(40),
  interval: z.enum(["monthly", "yearly"]),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return createCheckoutSession({ userId: user.id, ...body });
  });
}
