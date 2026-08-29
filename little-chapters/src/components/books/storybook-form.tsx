"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/cn";

interface MemoryOption {
  id: string;
  title: string | null;
  snippet: string;
  happenedAt: string;
}

/** Pick real memories → generate a storybook. AI never invents events. */
export function StorybookForm({
  childId,
  memories,
}: {
  childId: string;
  memories: MemoryOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("realistic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (memories.length === 0) {
    return (
      <p className="text-sm text-ink-300">
        Storybooks are written from real memories — capture a few with words
        first, then come back.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void fetch("/api/storybooks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            childId,
            memoryIds: Array.from(selected),
            title: title || undefined,
            style,
          }),
        })
          .then(async (r) => {
            const data = (await r.json()) as { bookId?: string; error?: { message: string } };
            if (!r.ok || !data.bookId) {
              throw new Error(data.error?.message ?? "Couldn't write the story");
            }
            router.push(`/books/${data.bookId}`);
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm text-ink-400">
        Choose the real moments the story is built from — nothing else will be
        invented.
      </p>
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {memories.map((memory) => {
          const checked = selected.has(memory.id);
          return (
            <label
              key={memory.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                checked ? "border-clay-500 bg-clay-400/5" : "border-sand-100 bg-white"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(memory.id)) next.delete(memory.id);
                    else next.add(memory.id);
                    return next;
                  });
                }}
                className="mt-1 h-4 w-4 accent-clay-600"
              />
              <span className="min-w-0">
                <span className="block text-sm text-ink-600 line-clamp-2">
                  {memory.title ?? memory.snippet}
                </span>
                <span className="text-xs text-ink-300">
                  {formatDateShort(memory.happenedAt)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title (optional)">
          {(id) => (
            <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="We'll suggest one" />
          )}
        </Field>
        <Field label="Style">
          {(id) => (
            <Select id={id} value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="realistic">Realistic — real photos</option>
              <option value="illustrated">Illustrated storybook</option>
              <option value="playful">Playful children&apos;s book</option>
            </Select>
          )}
        </Field>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" disabled={busy || selected.size === 0}>
        {busy ? "Writing the story…" : `Write the storybook (${selected.size} memories)`}
      </Button>
    </form>
  );
}
