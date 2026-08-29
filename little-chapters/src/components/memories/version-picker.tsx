"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Lets a parent apply a stored version (e.g. the AI keepsake draft) as the
 *  memory's display text. Originals always remain in the version history. */
export function VersionPicker({
  memoryId,
  versions,
}: {
  memoryId: string;
  versions: Array<{ id: string; source: string; title: string | null; body: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const aiVersions = versions.filter((v) => v.source === "ai" && v.body);
  if (aiVersions.length === 0) return null;
  const latest = aiVersions[0]!;

  return (
    <div className="rounded-xl bg-cream-100 p-4 space-y-3">
      <p className="text-xs uppercase tracking-wide text-ink-300">
        Keepsake version — use it if you like it
      </p>
      {latest.title ? <p className="font-medium text-ink-700">{latest.title}</p> : null}
      <p className="text-ink-600 leading-relaxed">{latest.body}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => {
            setBusy(latest.id);
            void fetch(`/api/memories/${memoryId}/accept-version`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ versionId: latest.id }),
            }).then(() => {
              setBusy(null);
              router.refresh();
            });
          }}
        >
          {busy ? "Applying…" : "Use this version"}
        </Button>
      </div>
    </div>
  );
}
