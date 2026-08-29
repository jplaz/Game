"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3 text-center">
      <Button
        size="lg"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void fetch("/api/invitations/accept", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token }),
          })
            .then(async (r) => {
              const data = (await r.json()) as { familyId?: string; error?: { message: string } };
              if (!r.ok) throw new Error(data.error?.message ?? "Couldn't accept the invite");
              router.push("/home");
              router.refresh();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Joining…" : "Join the family"}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
