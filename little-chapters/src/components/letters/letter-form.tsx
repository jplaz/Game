"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export function LetterForm({ childId, childName }: { childId: string; childName: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [unlockAt, setUnlockAt] = useState("");
  const [unlockLabel, setUnlockLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="lc-card p-6 text-center space-y-3">
        <p className="text-lg font-display text-ink-700">Sealed and kept.</p>
        <p className="text-sm text-ink-300">
          {unlockAt
            ? `It will stay private until ${unlockAt}.`
            : "It's saved with the rest of the archive."}
        </p>
        <Button variant="secondary" onClick={() => { setDone(false); setTitle(""); setBody(""); }}>
          Write another
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void fetch("/api/letters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            childId,
            kind,
            title,
            body,
            unlockAt: kind === "future" && unlockAt ? unlockAt : null,
            unlockLabel: kind === "future" && unlockLabel ? unlockLabel : null,
          }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const data = (await r.json().catch(() => null)) as
                | { error?: { message?: string } } | null;
              throw new Error(data?.error?.message ?? "Couldn't save the letter");
            }
            setDone(true);
            router.refresh();
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <Field label="What kind of letter?">
        {(id) => (
          <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="general">A letter for {childName}</option>
            <option value="birthday">A birthday letter</option>
            <option value="annual">An annual letter</option>
            <option value="future">A letter for the future (sealed)</option>
            <option value="first_day_of_school">For the first day of school</option>
            <option value="graduation">For graduation</option>
          </Select>
        )}
      </Field>
      {kind === "future" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens on">
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                value={unlockAt}
                onChange={(e) => setUnlockAt(e.target.value)}
              />
            )}
          </Field>
          <Field label="Shown until then as">
            {(id) => (
              <Input
                id={id}
                placeholder="Open on your 10th birthday"
                value={unlockLabel}
                onChange={(e) => setUnlockLabel(e.target.value)}
              />
            )}
          </Field>
        </div>
      ) : null}
      <Field label="Title">
        {(id) => (
          <Input id={id} required value={title} onChange={(e) => setTitle(e.target.value)} />
        )}
      </Field>
      <Field label="Your letter">
        {(id) => (
          <Textarea
            id={id}
            required
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Dear…"
          />
        )}
      </Field>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : kind === "future" ? "Seal this letter" : "Save letter"}
      </Button>
    </form>
  );
}
