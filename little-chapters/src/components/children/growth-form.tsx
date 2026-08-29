"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function GrowthForm({ childId }: { childId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    measuredAt: new Date().toISOString().slice(0, 10),
    weightKg: "",
    heightCm: "",
    clothingSize: "",
    diaperSize: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void fetch("/api/growth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            childId,
            measuredAt: form.measuredAt,
            weightGrams: form.weightKg ? Math.round(Number(form.weightKg) * 1000) : null,
            heightMm: form.heightCm ? Math.round(Number(form.heightCm) * 10) : null,
            clothingSize: form.clothingSize || null,
            diaperSize: form.diaperSize || null,
          }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const data = (await r.json().catch(() => null)) as
                | { error?: { message?: string } } | null;
              throw new Error(data?.error?.message ?? "Couldn't save");
            }
            setForm((f) => ({ ...f, weightKg: "", heightCm: "", clothingSize: "", diaperSize: "" }));
            router.refresh();
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <Field label="Date">
        {(id) => (
          <Input id={id} type="date" required value={form.measuredAt}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, measuredAt: e.target.value }))} />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)">
          {(id) => (
            <Input id={id} type="number" step="0.01" min="0.5" max="150"
              value={form.weightKg}
              onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))} />
          )}
        </Field>
        <Field label="Height (cm)">
          {(id) => (
            <Input id={id} type="number" step="0.1" min="20" max="220"
              value={form.heightCm}
              onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))} />
          )}
        </Field>
        <Field label="Clothing size">
          {(id) => (
            <Input id={id} placeholder="6–9 mo" value={form.clothingSize}
              onChange={(e) => setForm((f) => ({ ...f, clothingSize: e.target.value }))} />
          )}
        </Field>
        <Field label="Diaper size">
          {(id) => (
            <Input id={id} placeholder="3" value={form.diaperSize}
              onChange={(e) => setForm((f) => ({ ...f, diaperSize: e.target.value }))} />
          )}
        </Field>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
