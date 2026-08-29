"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function InviteForm({ familyId }: { familyId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void fetch("/api/families/invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            familyId,
            email,
            role,
            label: label || undefined,
          }),
        })
          .then(async (r) => {
            const data = (await r.json()) as {
              inviteUrl?: string;
              error?: { message: string };
            };
            if (!r.ok || !data.inviteUrl) {
              throw new Error(data.error?.message ?? "Couldn't create the invite");
            }
            setResult(data.inviteUrl);
            await navigator.clipboard.writeText(data.inviteUrl).catch(() => {});
            setEmail("");
            setLabel("");
            router.refresh();
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <Field label="Their email">
        {(id) => (
          <Input
            id={id}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="grandma@example.com"
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" hint="Contributors' additions wait for your approval.">
          {(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="parent">Parent — full memory management</option>
              <option value="contributor">Contributor — can add, you approve</option>
              <option value="viewer">Viewer — can look and react</option>
            </Select>
          )}
        </Field>
        <Field label="Shown as (optional)">
          {(id) => (
            <Input
              id={id}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Grandma"
            />
          )}
        </Field>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {result ? (
        <p className="text-sm text-sage-600">
          Invite link copied — it works once, for that email, for 14 days.
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Invite"}
      </Button>
    </form>
  );
}

export function ReviewButtons({
  familyId,
  targetType,
  targetId,
}: {
  familyId: string;
  targetType: "memory" | "media";
  targetId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = (decision: "approved" | "declined") => {
    setBusy(true);
    void fetch("/api/families/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ familyId, targetType, targetId, decision }),
    }).then(() => {
      router.refresh();
    });
  };
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => act("approved")}>
        Approve
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("declined")}>
        Decline
      </Button>
    </div>
  );
}
