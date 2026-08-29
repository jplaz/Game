import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { AcceptInvite } from "@/components/family/accept-invite";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "You're invited",
  robots: { index: false, follow: false },
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();

  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm lc-card p-8 text-center space-y-5">
        <p className="font-display text-sm text-clay-600">Little Chapters</p>
        <h1 className="text-2xl text-ink-700">You&apos;ve been invited</h1>
        <p className="text-sm text-ink-400 leading-relaxed">
          Someone wants you in their family&apos;s private memory archive — to see the
          little moments, and add your own.
        </p>
        {user ? (
          <AcceptInvite token={token} />
        ) : (
          <div className="space-y-2">
            <Link
              href={`/login?next=/invite/${token}`}
              className={buttonClass({ size: "lg", className: "w-full" })}
            >
              Sign in to accept
            </Link>
            <p className="text-xs text-ink-300">
              Use the email address the invite was sent to.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
