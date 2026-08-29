import type { Metadata } from "next";
import { ShareViewer } from "@/components/public/share-viewer";

export const metadata: Metadata = {
  title: "Shared with you",
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-dvh bg-cream-50">
      <ShareViewer token={token} />
    </main>
  );
}
