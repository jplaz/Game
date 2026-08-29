import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/server/security/csrf";
import { devSessionCookieName, supabaseConfigured } from "@/server/auth/session";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/server/env";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(devSessionCookieName);
  if (supabaseConfigured()) {
    const e = env();
    const cookieStore = await cookies();
    const client = createServerClient(
      e.NEXT_PUBLIC_SUPABASE_URL,
      e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (all) => {
            for (const { name, value, options } of all) {
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );
    await client.auth.signOut();
  }
  return response;
}
