"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ChildForm } from "@/components/children/child-form";

/** First-run: name the family, then add the first child. */
export function WelcomeFlow({
  existingFamilyId = null,
}: {
  existingFamilyId?: string | null;
}) {
  const router = useRouter();
  const [familyId, setFamilyId] = useState<string | null>(existingFamilyId);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (familyId) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl text-ink-700">Who is this story about?</h2>
          <p className="text-sm text-ink-300 mt-1">
            You can add more children any time — twins and siblings welcome.
          </p>
        </div>
        <ChildForm familyId={familyId} redirectTo="/home" />
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void fetch("/api/families", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        })
          .then(async (r) => {
            const data = (await r.json()) as { familyId?: string; error?: { message: string } };
            if (!r.ok || !data.familyId) {
              throw new Error(data.error?.message ?? "Couldn't create your family");
            }
            setFamilyId(data.familyId);
            router.refresh();
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <div>
        <h2 className="text-2xl text-ink-700">Name your family space</h2>
        <p className="text-sm text-ink-300 mt-1">
          Private from the first moment. Only people you invite can ever see it.
        </p>
      </div>
      <Field label="Family name">
        {(id) => (
          <Input
            id={id}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Ellison Family"
          />
        )}
      </Field>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Creating…" : "Continue"}
      </Button>
    </form>
  );
}
