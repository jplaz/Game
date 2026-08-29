"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CreateBookButton({
  childId,
  kind,
  label,
  yearNumber,
}: {
  childId: string;
  kind: "first_year" | "birthday" | "grandparent";
  label: string;
  yearNumber?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void fetch("/api/books", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ childId, kind, yearNumber: yearNumber ?? null }),
          })
            .then(async (r) => {
              const data = (await r.json()) as { bookId?: string; error?: { message: string } };
              if (!r.ok || !data.bookId) {
                throw new Error(data.error?.message ?? "Couldn't create the book");
              }
              router.push(`/books/${data.bookId}`);
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Putting it together…" : label}
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

export function RenderBookButton({ bookId }: { bookId: string }) {
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
          void fetch(`/api/books/${bookId}/render`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          })
            .then(async (r) => {
              if (!r.ok) {
                const data = (await r.json().catch(() => null)) as
                  | { error?: { message?: string } } | null;
                throw new Error(data?.error?.message ?? "Couldn't start the print render");
              }
              setTimeout(() => router.refresh(), 3000);
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Starting…" : "Prepare print-ready files"}
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
