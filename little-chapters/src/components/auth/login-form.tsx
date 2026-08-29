"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/**
 * Auth entry. With Supabase configured this renders email/password + Google/
 * Apple via Supabase's browser client; without it (local dev) it uses the
 * signed dev session flow, clearly labeled.
 */
export function LoginForm({
  supabaseEnabled,
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseEnabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!supabaseEnabled) {
        const response = await fetch("/api/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: { message?: string } } | null;
          throw new Error(data?.error?.message ?? "Sign-in failed");
        }
        router.push("/home");
        router.refresh();
        return;
      }
      const { createBrowserClient } = await import("@supabase/ssr");
      const client = createBrowserClient(supabaseUrl, supabaseAnonKey);
      if (mode === "signup") {
        const { error: err } = await client.auth.signUp({ email, password });
        if (err) throw new Error(err.message);
        setNotice("Check your email to confirm your account, then sign in.");
        return;
      }
      const { error: err } = await client.auth.signInWithPassword({ email, password });
      if (err) throw new Error(err.message);
      router.push("/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: "google" | "apple") => {
    const { createBrowserClient } = await import("@supabase/ssr");
    const client = createBrowserClient(supabaseUrl, supabaseAnonKey);
    await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/home` },
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {supabaseEnabled ? (
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={() => void oauth("google")}>
            Google
          </Button>
          <Button type="button" variant="secondary" onClick={() => void oauth("apple")}>
            Apple
          </Button>
        </div>
      ) : (
        <p className="rounded-xl bg-sand-100 px-4 py-3 text-xs text-ink-400">
          Development sign-in: enter any email. Production uses email/password,
          Google and Apple via Supabase (docs/INTEGRATIONS.md).
        </p>
      )}
      <Field label="Email">
        {(id) => (
          <Input
            id={id}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      {supabaseEnabled ? (
        <Field label="Password">
          {(id) => (
            <Input
              id={id}
              type="password"
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-sage-600">{notice}</p> : null}
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      {supabaseEnabled ? (
        <button
          type="button"
          className="w-full text-center text-sm text-ink-400 hover:text-ink-600"
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
        >
          {mode === "signin"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      ) : null}
    </form>
  );
}
