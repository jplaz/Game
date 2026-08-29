import { z } from "zod";
import { NextResponse } from "next/server";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { getSql } from "@/server/db/client";
import { env } from "@/server/env";
import { ForbiddenError } from "@/server/errors";
import { devSessionCookieName, mintDevSession, supabaseConfigured } from "@/server/auth/session";

/**
 * Development-only login: available exclusively when Supabase auth is NOT
 * configured and NODE_ENV !== production. Creates/loads a user by email and
 * sets a signed session cookie. Production auth is Supabase (email/password,
 * Google, Apple) — see docs/INTEGRATIONS.md §1.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    if (env().NODE_ENV === "production" || supabaseConfigured()) {
      throw new ForbiddenError("Dev login is disabled");
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
    await enforceRateLimit({ key: `login:${ip}`, ...RATE_LIMITS.login });
    const body = await parseBody(
      request,
      z.object({
        email: z.string().email(),
        displayName: z.string().max(80).optional(),
      })
    );
    const sql = getSql();
    const rows = await sql<{ id: string }[]>`
      insert into users (email, display_name)
      values (${body.email.toLowerCase()}, ${body.displayName ?? ""})
      on conflict (email) do update set
        display_name = case when users.display_name = '' then excluded.display_name
                            else users.display_name end
      returning id
    `;
    const userId = rows[0]!.id;
    const response = NextResponse.json({ ok: true, userId });
    response.cookies.set(devSessionCookieName, mintDevSession(userId), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  });
}
