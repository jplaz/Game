"use client";

import Link from "next/link";
import { useState } from "react";
import { Spinner } from "@/components/ui/misc";
import { MediaImage } from "@/components/media/media-image";
import { formatDateShort } from "@/lib/format";

interface SearchResult {
  memoryId: string;
  title: string | null;
  snippet: string;
  happenedAt: string;
  mediaCount: number;
  coverMediaId: string | null;
}

const SUGGESTIONS = [
  "Show me every memory with Grandma",
  "Beach memories",
  "Videos where we wrote about laughing",
  "Everything from Christmas",
];

export function SearchClient({ familyId }: { familyId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setQuery(q);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ familyId, query: q.trim() }),
      });
      if (response.ok) {
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask your archive anything…"
            aria-label="Search your memories"
            className="w-full h-13 py-3.5 rounded-full border border-sand-200 bg-white px-6 pr-14 text-base placeholder:text-ink-300 focus:border-clay-500 shadow-card"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-clay-600 text-cream-50 grid place-items-center"
          >
            {busy ? <Spinner className="border-cream-50/40 border-t-cream-50" /> : "→"}
          </button>
        </div>
      </form>

      {results === null ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void run(s)}
              className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm text-ink-500 hover:border-sand-300"
            >
              {s}
            </button>
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="text-ink-400 text-center py-10">
          Nothing matched — try different words, or a person&apos;s name.
        </p>
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {results.map((result) => (
            <li key={result.memoryId}>
              <Link
                href={`/memories/${result.memoryId}`}
                className="lc-card p-4 flex gap-4 items-center hover:shadow-lifted transition-shadow"
              >
                {result.coverMediaId ? (
                  <MediaImage
                    mediaId={result.coverMediaId}
                    alt=""
                    className="h-16 w-16 shrink-0"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-xs text-ink-300">{formatDateShort(result.happenedAt)}</p>
                  <p className="text-ink-600 line-clamp-2">
                    {result.title ?? result.snippet ?? "A memory"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
