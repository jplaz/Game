"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

/** Create/edit a child profile. Family structures vary — nothing is required
 *  beyond a name, and pregnancy profiles are first-class. */
export function ChildForm({
  familyId,
  redirectTo = "/home",
}: {
  familyId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    nickname: "",
    pronouns: "",
    status: "active",
    birthDate: "",
    dueDate: "",
    birthLocation: "",
    birthStory: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void fetch("/api/children", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            familyId,
            fullName: form.fullName,
            nickname: form.nickname || null,
            pronouns: form.pronouns || null,
            status: form.status,
            birthDate: form.status === "active" && form.birthDate ? form.birthDate : null,
            dueDate: form.status === "expected" && form.dueDate ? form.dueDate : null,
            birthLocation: form.birthLocation || null,
            birthStory: form.birthStory || null,
          }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const data = (await r.json().catch(() => null)) as
                | { error?: { message?: string } } | null;
              throw new Error(data?.error?.message ?? "Couldn't save");
            }
            router.push(redirectTo);
            router.refresh();
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <Field label="Full name">
        {(id) => <Input id={id} required value={form.fullName} onChange={set("fullName")} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goes by (optional)">
          {(id) => <Input id={id} value={form.nickname} onChange={set("nickname")} placeholder="Rory" />}
        </Field>
        <Field label="Pronouns (optional)">
          {(id) => <Input id={id} value={form.pronouns} onChange={set("pronouns")} placeholder="she/her" />}
        </Field>
      </div>
      <Field label="">
        {(id) => (
          <Select id={id} value={form.status} onChange={set("status")} aria-label="Arrival status">
            <option value="active">Already here</option>
            <option value="expected">On the way</option>
          </Select>
        )}
      </Field>
      {form.status === "active" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birth date">
            {(id) => (
              <Input id={id} type="date" value={form.birthDate} onChange={set("birthDate")}
                max={new Date().toISOString().slice(0, 10)} />
            )}
          </Field>
          <Field label="Born in (optional)">
            {(id) => <Input id={id} value={form.birthLocation} onChange={set("birthLocation")} />}
          </Field>
        </div>
      ) : (
        <Field label="Due date">
          {(id) => <Input id={id} type="date" value={form.dueDate} onChange={set("dueDate")} />}
        </Field>
      )}
      <Field
        label={form.status === "expected" ? "The story so far (optional)" : "Their birth story (optional)"}
        hint="You can always add or edit this later."
      >
        {(id) => <Textarea id={id} rows={4} value={form.birthStory} onChange={set("birthStory")} />}
      </Field>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Saving…" : "Start their story"}
      </Button>
    </form>
  );
}
