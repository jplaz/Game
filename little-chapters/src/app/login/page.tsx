import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseConfigured } from "@/server/auth/session";
import { env } from "@/server/env";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");
  const e = env();

  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Link href="/" className="font-display text-xl text-clay-600">
            Little Chapters
          </Link>
          <h1 className="text-3xl text-ink-700 mt-2">Welcome back</h1>
        </div>
        <div className="lc-card p-6 sm:p-8">
          <LoginForm
            supabaseEnabled={supabaseConfigured()}
            supabaseUrl={e.NEXT_PUBLIC_SUPABASE_URL}
            supabaseAnonKey={e.NEXT_PUBLIC_SUPABASE_ANON_KEY}
          />
        </div>
      </div>
    </main>
  );
}
