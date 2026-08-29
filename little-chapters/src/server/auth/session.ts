import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/server/env";
import { getSql } from "@/server/db/client";
import { UnauthorizedError } from "@/server/errors";
import { signToken, verifyToken } from "@/server/storage/signing";

/**
 * Session resolution.
 *
 * Production: Supabase Auth (email/password, Google, Apple) via @supabase/ssr
 * cookies. The application `users` row is upserted on first sight of a
 * Supabase user (same id), so app tables always have a local FK target.
 *
 * Development (no Supabase configured): an explicit dev session cookie signed
 * with the app keyring. Dev login refuses to run in production.
 */

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  staffRole: "support" | "admin" | null;
}

const DEV_SESSION_COOKIE = "lc_dev_session";
export const ACTIVE_FAMILY_COOKIE = "lc_family";

export function supabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function supabaseUser(): Promise<{ id: string; email: string } | null> {
  const e = env();
  const cookieStore = await cookies();
  const client = createServerClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          // Read-only in RSC context; middleware refreshes tokens.
        },
      },
    }
  );
  const { data } = await client.auth.getUser();
  if (!data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

async function devUser(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = verifyToken(raw);
  if (!payload || !payload.scope.startsWith("dev-session:")) return null;
  const userId = payload.scope.slice("dev-session:".length);
  const sql = getSql();
  const rows = await sql<{ id: string; email: string }[]>`
    select id, email from users where id = ${userId} and deleted_at is null
  `;
  return rows[0] ?? null;
}

/** Mint the dev session cookie value for a user id (dev/test only). */
export function mintDevSession(userId: string): string {
  if (env().NODE_ENV === "production") {
    throw new UnauthorizedError("Dev sessions are disabled in production");
  }
  return signToken({
    scope: `dev-session:${userId}`,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });
}

export const devSessionCookieName = DEV_SESSION_COOKIE;

/** Current user or null. Upserts the app users row for Supabase identities. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const identity = supabaseConfigured() ? await supabaseUser() : await devUser();
  if (!identity) return null;

  const sql = getSql();
  const rows = await sql<
    { id: string; email: string; display_name: string; staff_role: "support" | "admin" | null }[]
  >`
    insert into users (id, email)
    values (${identity.id}, ${identity.email})
    on conflict (id) do update set email = excluded.email
    returning id, email, display_name, staff_role
  `;
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name || u.email.split("@")[0] || "You",
    staffRole: u.staff_role,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** The family currently selected in the UI, validated against membership. */
export async function getActiveFamilyId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_FAMILY_COOKIE)?.value ?? null;
  const sql = getSql();
  if (requested) {
    const rows = await sql`
      select 1 from family_members where user_id = ${userId} and family_id = ${requested}
    `;
    if (rows.length > 0) return requested;
  }
  const first = await sql<{ family_id: string }[]>`
    select family_id from family_members where user_id = ${userId}
    order by joined_at limit 1
  `;
  return first[0]?.family_id ?? null;
}
