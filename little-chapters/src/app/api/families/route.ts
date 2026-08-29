import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createFamily } from "@/server/domain/families";
import { listUserFamilies } from "@/server/authz";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, z.object({ name: z.string().min(1).max(120) }));
    const familyId = await createFamily(user.id, body.name);
    return { familyId };
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { families: await listUserFamilies(user.id) };
  });
}
