import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createInvitation } from "@/server/domain/families";
import { env } from "@/server/env";

const schema = z.object({
  familyId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["parent", "contributor", "viewer"]),
  label: z.string().max(60).optional(),
  message: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const result = await createInvitation({ userId: user.id, ...body });
    // The invite link is returned to the inviter to share; when email is
    // configured the notification pipeline also delivers it directly.
    return {
      invitationId: result.invitationId,
      inviteUrl: `${env().NEXT_PUBLIC_APP_URL}/invite/${result.inviteToken}`,
    };
  });
}
