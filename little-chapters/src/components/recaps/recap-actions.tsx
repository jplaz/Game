"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RenderRecapButton({ recapId }: { recapId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void fetch(`/api/recaps/${recapId}/render`, { method: "POST" })
            .then(async (r) => {
              if (!r.ok) {
                const data = (await r.json().catch(() => null)) as
                  | { error?: { message?: string } } | null;
                throw new Error(data?.error?.message ?? "Couldn't start rendering");
              }
              setTimeout(() => router.refresh(), 3000);
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Starting…" : "Render this recap"}
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

export function AspectPicker({
  recapId,
  current,
}: {
  recapId: string;
  current: string;
}) {
  const router = useRouter();
  const options = ["9:16", "16:9", "1:1"] as const;
  return (
    <div className="flex gap-2" role="group" aria-label="Aspect ratio">
      {options.map((aspect) => (
        <button
          key={aspect}
          type="button"
          aria-pressed={current === aspect}
          onClick={() => {
            void fetch(`/api/recaps/${recapId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ aspect }),
            }).then(() => router.refresh());
          }}
          className={
            current === aspect
              ? "rounded-full bg-ink-700 text-cream-50 px-4 py-1.5 text-sm"
              : "rounded-full border border-sand-200 bg-white px-4 py-1.5 text-sm text-ink-500"
          }
        >
          {aspect}
        </button>
      ))}
    </div>
  );
}

export function RemoveSceneButton({
  recapId,
  index,
  storyboard,
}: {
  recapId: string;
  index: number;
  storyboard: unknown[];
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Remove scene"
      className="text-xs text-ink-300 hover:text-red-700"
      onClick={() => {
        const next = storyboard.filter((_, i) => i !== index);
        void fetch(`/api/recaps/${recapId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storyboard: next }),
        }).then(() => router.refresh());
      }}
    >
      Remove
    </button>
  );
}
