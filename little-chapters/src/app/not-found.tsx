import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="text-center space-y-4">
        <p className="font-display text-sm text-clay-600">Little Chapters</p>
        <h1 className="text-3xl text-ink-700">This page isn&apos;t here</h1>
        <p className="text-ink-400 text-sm">
          It may be private, moved, or no longer shared.
        </p>
        <Link href="/home" className={buttonClass()}>
          Back to your memories
        </Link>
      </div>
    </main>
  );
}
