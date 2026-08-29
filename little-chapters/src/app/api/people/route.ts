import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createPerson } from "@/server/domain/people";

const schema = z.object({
  familyId: z.string().uuid(),
  name: z.string().min(1).max(80),
  relationship: z.string().max(80).nullish(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const id = await createPerson({ userId: user.id, ...body });
    return { personId: id };
  });
}
