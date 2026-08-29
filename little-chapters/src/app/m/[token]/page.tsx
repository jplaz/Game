import type { Metadata } from "next";
import { QrViewer } from "@/components/public/qr-viewer";

/**
 * The permanent QR redirect layer. This route must remain stable for the
 * lifetime of every printed book — decades. It renders a resolver page; the
 * token maps to current media through the database, never to storage URLs.
 */

export const metadata: Metadata = {
  title: "A memory",
  robots: { index: false, follow: false },
};

export default async function QrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-dvh bg-cream-50">
      <QrViewer token={token} />
    </main>
  );
}
