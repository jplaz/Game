import { z } from "zod";
import { NextResponse } from "next/server";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser, ACTIVE_FAMILY_COOKIE } from "@/server/auth/session";
import { assertFamilyRole } from "@/server/authz";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, z.object({ familyId: z.string().uuid() }));
    await assertFamilyRole(user.id, body.familyId, "viewer");
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ACTIVE_FAMILY_COOKIE, body.familyId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  });
}
