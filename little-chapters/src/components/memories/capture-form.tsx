"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Uploader, type UploadedItem } from "@/components/media/uploader";

/**
 * Quick memory capture: words + media. Optionally asks for a keepsake draft;
 * the parent's original words are always preserved, and the draft is applied
 * only when they accept it.
 */
export function CaptureForm({
  familyId,
  childId,
  childName,
}: {
  familyId: string;
  childId: string;
  childName: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [happenedAt, setHappenedAt] = useState(new Date().toISOString().slice(0, 10));
  const [uploaded, setUploaded] = useState<UploadedItem[]>([]);
  const [wantDraft, setWantDraft] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    memoryId: string;
    draft: { text: string; title: string; versionApplied: boolean } | null;
    suggestions: Array<{ id: string; title: string; reason: string }>;
  } | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          childId,
          body: body.trim() || null,
          happenedAt,
          mediaIds: uploaded.map((u) => u.mediaId),
          requestKeepsakeDraft: wantDraft && Boolean(body.trim()),
        }),
      });
      const data = (await response.json()) as {
        memoryId?: string;
        keepsakeDraft?: { text: string; title: string } | null;
        milestoneSuggestions?: Array<{ id: string; title: string; reason: string }>;
        error?: { message: string };
      };
      if (!response.ok || !data.memoryId) {
        throw new Error(data.error?.message ?? "Couldn't save the memory");
      }
      setResult({
        memoryId: data.memoryId,
        draft: data.keepsakeDraft
          ? { ...data.keepsakeDraft, versionApplied: false }
          : null,
        suggestions: data.milestoneSuggestions ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the memory");
    } finally {
      setSaving(false);
    }
  };

  const reviewSuggestion = async (id: string, decision: "confirmed" | "dismissed") => {
    await fetch(`/api/milestones/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setResult((prev) =>
      prev
        ? { ...prev, suggestions: prev.suggestions.filter((s) => s.id !== id) }
        : prev
    );
  };

  if (result) {
    return (
      <div className="space-y-4 animate-fade-up">
        <div className="lc-card p-6 space-y-2">
          <h2 className="text-xl text-ink-700">Memory saved</h2>
          {result.draft ? (
            <div className="rounded-xl bg-cream-100 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-ink-300">
                A keepsake version, if you&apos;d like it
              </p>
              <p className="text-ink-600 leading-relaxed">{result.draft.text}</p>
              <p className="text-xs text-ink-300">
                Your original words are kept either way.
              </p>
            </div>
          ) : null}
        </div>

        {result.suggestions.length > 0 ? (
          <div className="lc-card p-6 space-y-3">
            <h3 className="text-lg text-ink-700">Was this a milestone?</h3>
            {result.suggestions.map((s) => (
              <div key={s.id} className="rounded-xl border border-sand-100 p-4">
                <p className="font-medium text-ink-600">{s.title}</p>
                <p className="text-sm text-ink-300 mt-0.5">{s.reason}</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => void reviewSuggestion(s.id, "confirmed")}>
                    Yes, add it
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void reviewSuggestion(s.id, "dismissed")}
                  >
                    Not a milestone
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex gap-3">
          <Button onClick={() => router.push(`/memories/${result.memoryId}`)}>
            View memory
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setBody("");
              setUploaded([]);
            }}
          >
            Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="What happened?">
        {(id) => (
          <Textarea
            id={id}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`e.g. “${childName} laughed every time the cat jumped off the couch.”`}
            rows={4}
          />
        )}
      </Field>
      <Field label="When">
        {(id) => (
          <Input
            id={id}
            type="date"
            value={happenedAt}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setHappenedAt(e.target.value)}
            required
          />
        )}
      </Field>
      <Uploader familyId={familyId} childId={childId} onUploaded={setUploaded} />
      <label className="flex items-center gap-2.5 text-sm text-ink-500">
        <input
          type="checkbox"
          checked={wantDraft}
          onChange={(e) => setWantDraft(e.target.checked)}
          className="h-4 w-4 rounded border-sand-300 accent-clay-600"
        />
        Offer a keepsake version of my words (your original is always kept)
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" size="lg" disabled={saving || (!body.trim() && uploaded.length === 0)}>
        {saving ? "Saving…" : "Save memory"}
      </Button>
    </form>
  );
}
