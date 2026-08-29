"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";

/**
 * “Create This Month” — the product's defining button. Kicks off generation
 * and follows job progress until the chapter is ready.
 */
export function GenerateChapterButton({
  childId,
  month,
  label = "Create This Month",
  size = "lg",
}: {
  childId: string;
  month: string; // YYYY-MM
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [note, setNote] = useState<string>("");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const start = async () => {
    setState("working");
    setNote("Gathering the month…");
    try {
      const response = await fetch("/api/chapters/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ childId, month }),
      });
      const data = (await response.json()) as {
        chapterId?: string;
        jobId?: string | null;
        error?: { message: string };
      };
      if (!response.ok || !data.chapterId) {
        throw new Error(data.error?.message ?? "Couldn't start");
      }
      setChapterId(data.chapterId);
      const jobId = data.jobId;
      if (!jobId) {
        router.push(`/chapters/${data.chapterId}`);
        return;
      }
      pollRef.current = setInterval(() => {
        void (async () => {
          const jobResponse = await fetch(`/api/jobs/${jobId}`);
          if (!jobResponse.ok) return;
          const job = (await jobResponse.json()) as {
            status: string;
            progress: number;
            progressNote: string | null;
          };
          setNote(job.progressNote ?? "Weaving the chapter…");
          if (job.status === "succeeded") {
            if (pollRef.current) clearInterval(pollRef.current);
            router.push(`/chapters/${data.chapterId}`);
            router.refresh();
          } else if (job.status === "failed" || job.status === "dead") {
            if (pollRef.current) clearInterval(pollRef.current);
            setState("error");
          }
        })();
      }, 2000);
    } catch (err) {
      setState("error");
      setNote(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (state === "working") {
    return (
      <div className="inline-flex items-center gap-3 text-ink-500" aria-live="polite">
        <Spinner />
        <span className="text-sm">{note}</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button size={size} onClick={() => void start()}>
        {label}
      </Button>
      {state === "error" ? (
        <p className="text-sm text-red-700">
          {note || "That didn't work — try again in a moment."}
          {chapterId ? " The chapter draft may still be viewable." : ""}
        </p>
      ) : null}
    </div>
  );
}
