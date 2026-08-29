"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Parent controls on a chapter: share, video recap, regenerate. */
export function ChapterActions({
  chapterId,
  familyId,
  childId,
  month,
}: {
  chapterId: string;
  familyId: string;
  childId: string;
  month: string; // YYYY-MM
}) {
  const router = useRouter();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            void act("share", async () => {
              const response = await fetch("/api/shares", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  familyId,
                  targetType: "chapter",
                  targetId: chapterId,
                  visibility: "link",
                }),
              });
              const data = (await response.json()) as {
                shareUrl?: string;
                error?: { message: string };
              };
              if (!response.ok || !data.shareUrl) {
                throw new Error(data.error?.message ?? "Couldn't create the link");
              }
              setShareUrl(data.shareUrl);
              await navigator.clipboard.writeText(data.shareUrl).catch(() => {});
              setMessage("Private link copied — only people you send it to can open it.");
            })
          }
        >
          {busy === "share" ? "Creating…" : "Share privately"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            void act("recap", async () => {
              const response = await fetch("/api/recaps", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ chapterId }),
              });
              const data = (await response.json()) as {
                recapId?: string;
                error?: { message: string };
              };
              if (!response.ok || !data.recapId) {
                throw new Error(data.error?.message ?? "Couldn't start the recap");
              }
              router.push(`/recaps/${data.recapId}`);
            })
          }
        >
          {busy === "recap" ? "Preparing…" : "Make a video recap"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            void act("regen", async () => {
              const response = await fetch("/api/chapters/generate", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ childId, month }),
              });
              if (!response.ok) throw new Error("Couldn't refresh the chapter");
              setMessage("Refreshing the chapter — your own edits are kept as they are.");
              setTimeout(() => router.refresh(), 4000);
            })
          }
        >
          {busy === "regen" ? "Refreshing…" : "Refresh from new memories"}
        </Button>
      </div>
      {message ? <p className="text-sm text-ink-400">{message}</p> : null}
      {shareUrl ? (
        <p className="text-xs text-ink-300 break-all">{shareUrl}</p>
      ) : null}
    </div>
  );
}
