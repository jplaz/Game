"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";

/**
 * The memory assistant: gentle prompts → parent answers → keepsake draft →
 * confirmed structured memory. Nothing is saved without explicit confirmation.
 */
export function AssistantClient({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState<{
    title: string;
    body: string;
    original: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "prompts", childId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { prompts: string[] }) => {
        if (!cancelled) setPrompts(data.prompts);
      })
      .catch(() => {
        if (!cancelled) setPrompts([`What has ${childName} been loving lately?`]);
      });
    return () => {
      cancelled = true;
    };
  }, [childId, childName]);

  const makeDraft = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "draft",
          childId,
          question: question ?? "",
          answer: answer.trim(),
        }),
      });
      const data = (await response.json()) as {
        draft?: { title: string; body: string; original: string };
        error?: { message: string };
      };
      if (!response.ok || !data.draft) {
        throw new Error(data.error?.message ?? "Couldn't draft that");
      }
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const keep = async (useDraft: boolean) => {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          childId,
          title: useDraft ? draft.title : null,
          body: useDraft ? draft.body : draft.original,
          happenedAt: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!response.ok) throw new Error("Couldn't save the memory");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div className="lc-card p-8 text-center space-y-3">
        <p className="font-display text-xl text-ink-700">Kept.</p>
        <p className="text-sm text-ink-300">One more moment that won&apos;t slip away.</p>
        <Button
          variant="secondary"
          onClick={() => {
            setSaved(false);
            setDraft(null);
            setAnswer("");
            setQuestion(null);
          }}
        >
          Remember something else
        </Button>
      </div>
    );
  }

  if (draft) {
    return (
      <div className="lc-card p-6 space-y-4">
        <p className="text-xs uppercase tracking-wide text-ink-300">As a keepsake</p>
        <p className="font-medium text-ink-700">{draft.title}</p>
        <p className="text-ink-600 leading-relaxed">{draft.body}</p>
        <p className="text-xs text-ink-300">
          Your original words are kept either way.
        </p>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void keep(true)}>
            Keep the keepsake version
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void keep(false)}>
            Keep my words as-is
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
            Edit my answer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {question === null ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-400">A few things worth remembering:</p>
          {prompts === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setQuestion(prompt)}
                className="w-full text-left lc-card p-4 text-ink-600 hover:shadow-lifted transition-shadow"
              >
                {prompt}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => setQuestion("")}
            className="text-sm text-clay-600 font-medium"
          >
            Or just write what&apos;s on your mind →
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void makeDraft();
          }}
        >
          {question ? (
            <p className="font-display text-lg text-ink-700">{question}</p>
          ) : null}
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="Just talk — a sentence or two is plenty."
            aria-label="Your answer"
          />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !answer.trim()}>
              {busy ? "Writing…" : "Turn it into a memory"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setQuestion(null)}>
              Different question
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
