"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ExportButton({ familyId }: { familyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void fetch("/api/exports", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ familyId }),
          })
            .then(async (r) => {
              const data = (await r.json()) as { error?: { message: string } };
              if (!r.ok) throw new Error(data.error?.message ?? "Couldn't start the export");
              setMessage("Your archive is being packed — you'll be notified when it's ready.");
              router.refresh();
            })
            .catch((err: Error) => setMessage(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Starting…" : "Export everything"}
      </Button>
      {message ? <p className="text-xs text-ink-400">{message}</p> : null}
    </div>
  );
}

export function DownloadExportButton({ exportId }: { exportId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch(`/api/exports/${exportId}/download`)
          .then(async (r) => {
            if (!r.ok) return;
            const data = (await r.json()) as { url: string };
            window.location.href = data.url;
          })
          .finally(() => setBusy(false));
      }}
    >
      Download
    </Button>
  );
}

export function CheckoutButton({
  familyId,
  planId,
  label,
}: {
  familyId: string;
  planId: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ familyId, planId, interval: "monthly" }),
          })
            .then(async (r) => {
              const data = (await r.json()) as { url?: string; error?: { message: string } };
              if (!r.ok || !data.url) {
                throw new Error(data.error?.message ?? "Billing isn't available yet");
              }
              window.location.href = data.url;
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {label}
      </Button>
      {error ? <p className="text-xs text-ink-400">{error}</p> : null}
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void fetch("/api/auth/logout", { method: "POST" }).then(() => {
          router.push("/");
          router.refresh();
        });
      }}
    >
      Sign out
    </Button>
  );
}
