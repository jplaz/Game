"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

const EMOJI = ["❤️", "😂", "🥹", "🎉"] as const;

export function ReactionBar({
  familyId,
  targetType,
  targetId,
  counts,
  mine,
}: {
  familyId: string;
  targetType: "memory" | "media" | "chapter" | "recap";
  targetId: string;
  counts: Record<string, number>;
  mine: string[];
}) {
  const router = useRouter();
  const [local, setLocal] = useState({ counts, mine: new Set(mine) });

  const toggle = async (emoji: (typeof EMOJI)[number]) => {
    setLocal((prev) => {
      const nextMine = new Set(prev.mine);
      const delta = nextMine.has(emoji) ? -1 : 1;
      if (delta === 1) nextMine.add(emoji);
      else nextMine.delete(emoji);
      return {
        counts: { ...prev.counts, [emoji]: Math.max(0, (prev.counts[emoji] ?? 0) + delta) },
        mine: nextMine,
      };
    });
    await fetch("/api/reactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ familyId, targetType, targetId, emoji }),
    });
    router.refresh();
  };

  return (
    <div className="flex gap-2" role="group" aria-label="Reactions">
      {EMOJI.map((emoji) => {
        const count = local.counts[emoji] ?? 0;
        const active = local.mine.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => void toggle(emoji)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-clay-500 bg-clay-400/10"
                : "border-sand-200 bg-white hover:border-sand-300"
            )}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 ? <span className="text-ink-500 text-xs">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function CommentForm({
  familyId,
  targetType,
  targetId,
}: {
  familyId: string;
  targetType: "memory" | "media" | "chapter" | "recap" | "letter";
  targetId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        void fetch("/api/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ familyId, targetType, targetId, body: body.trim() }),
        }).then(() => {
          setBody("");
          setBusy(false);
          router.refresh();
        });
      }}
    >
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Say something kind…"
        aria-label="Add a comment"
        className="flex-1 h-10 rounded-full border border-sand-200 bg-white px-4 text-sm placeholder:text-ink-300 focus:border-clay-500"
      />
      <button
        type="submit"
        disabled={busy || !body.trim()}
        className="rounded-full bg-ink-700 text-cream-50 px-4 text-sm font-medium disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}
