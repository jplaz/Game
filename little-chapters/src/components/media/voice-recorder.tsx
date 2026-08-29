"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";

/**
 * Voice memory recorder: MediaRecorder → upload → voice memory.
 * The verbatim recording is always preserved; transcription and keepsake
 * drafting happen in the background for parent review.
 */
export function VoiceRecorder({
  familyId,
  childId,
  onCreated,
}: {
  familyId: string;
  childId: string;
  onCreated?: (memoryId: string) => void;
}) {
  const [state, setState] = useState<
    "idle" | "recording" | "preview" | "saving" | "saved" | "error"
  >("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [previewUrl]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setPreviewUrl(URL.createObjectURL(blob));
        setState("preview");
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setState("recording");
    } catch {
      setError("Microphone access is needed to record a memory");
      setState("error");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const save = async () => {
    const blob = new Blob(chunksRef.current, {
      type: recorderRef.current?.mimeType ?? "audio/webm",
    });
    setState("saving");
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const admission = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          familyId,
          childId,
          filename: `voice-memory.${ext}`,
          contentType: blob.type,
          sizeBytes: blob.size,
        }),
      });
      if (!admission.ok) throw new Error("Couldn't start saving");
      const target = (await admission.json()) as {
        mediaId: string;
        uploadUrl: string;
        headers: Record<string, string>;
      };
      const put = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: target.headers,
        body: blob,
      });
      if (!put.ok) throw new Error("Upload interrupted");
      const complete = await fetch(`/api/uploads/${target.mediaId}/complete`, {
        method: "POST",
      });
      if (!complete.ok) throw new Error("Couldn't finish saving");
      const memory = await fetch("/api/memories/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          childId,
          audioMediaId: target.mediaId,
          happenedAt: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!memory.ok) throw new Error("Couldn't save the memory");
      const data = (await memory.json()) as { memoryId: string };
      setState("saved");
      onCreated?.(data.memoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("preview");
    }
  };

  return (
    <div className="lc-card p-6 text-center space-y-4">
      {state === "idle" || state === "error" ? (
        <>
          <p className="text-ink-600">
            Press record and just talk — what happened, how it felt.
          </p>
          <Button onClick={() => void start()} size="lg">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-100" />
            Record a Memory
          </Button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </>
      ) : null}

      {state === "recording" ? (
        <>
          <p
            className="text-3xl font-display text-ink-700 tabular-nums"
            aria-live="polite"
          >
            {formatDuration(elapsed * 1000)}
          </p>
          <p className="text-sm text-ink-300">Recording… take your time.</p>
          <Button onClick={stop} variant="secondary" size="lg">
            Stop
          </Button>
        </>
      ) : null}

      {state === "preview" || state === "saving" ? (
        <>
          {previewUrl ? (
            <audio controls src={previewUrl} className="w-full" />
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setPreviewUrl(null);
                setState("idle");
              }}
              disabled={state === "saving"}
            >
              Discard
            </Button>
            <Button onClick={() => void save()} disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Keep this memory"}
            </Button>
          </div>
        </>
      ) : null}

      {state === "saved" ? (
        <>
          <p className="text-lg text-ink-700 font-display">Saved.</p>
          <p className="text-sm text-ink-300">
            We&apos;re transcribing it now — you&apos;ll be able to review the words and a
            keepsake version shortly.
          </p>
          <Button variant="secondary" onClick={() => setState("idle")}>
            Record another
          </Button>
        </>
      ) : null}
    </div>
  );
}
