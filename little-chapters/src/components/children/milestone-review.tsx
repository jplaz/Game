"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MilestoneReview({
  milestoneId,
  title,
  reason,
}: {
  milestoneId: string;
  title: string;
  reason: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const review = (decision: "confirmed" | "dismissed") => {
    setBusy(true);
    void fetch(`/api/milestones/${milestoneId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    }).then(() => router.refresh());
  };
  return (
    <div className="rounded-xl border border-sand-100 p-4">
      <p className="font-medium text-ink-600">{title}</p>
      {reason ? <p className="text-sm text-ink-300 mt-0.5">{reason}</p> : null}
      <div className="flex gap-2 mt-3">
        <Button size="sm" disabled={busy} onClick={() => review("confirmed")}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => review("dismissed")}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
