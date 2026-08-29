"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

const TYPES: Array<{ key: string; label: string }> = [
  { key: "chapter.ready", label: "A monthly chapter is ready" },
  { key: "family.submission", label: "A family member added something" },
  { key: "capture.summary", label: "Monthly capture summary" },
  { key: "age.milestone", label: "Age milestones (“turns 7 months tomorrow”)" },
  { key: "reengagement", label: "Gentle reminders when it's been quiet" },
  { key: "book.ready", label: "A book is ready to review" },
  { key: "recap.ready", label: "A video recap is ready" },
  { key: "export.ready", label: "An archive export is ready" },
];

type Channels = { email?: boolean; push?: boolean };

export function NotificationPrefs() {
  const [prefs, setPrefs] = useState<Record<string, Channels> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/notifications/preferences")
      .then((r) => (r.ok ? r.json() : { preferences: {} }))
      .then((data: { preferences: Record<string, Channels> }) => {
        if (!cancelled) setPrefs(data.preferences);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (prefs === null) {
    return (
      <div className="space-y-2">
        {TYPES.slice(0, 4).map((t) => (
          <Skeleton key={t.key} className="h-9" />
        ))}
      </div>
    );
  }

  const toggle = (type: string, channel: "email" | "push") => {
    const current = prefs[type]?.[channel] ?? defaultFor(type, channel);
    const next = {
      ...prefs,
      [type]: { ...prefs[type], [channel]: !current },
    };
    setPrefs(next);
    void fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences: next }),
    });
  };

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs text-ink-300 pb-1">
        <span />
        <span className="w-12 text-center">Email</span>
        <span className="w-12 text-center">Push</span>
      </div>
      {TYPES.map((type) => (
        <div
          key={type.key}
          className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center py-2 border-t border-sand-100"
        >
          <span className="text-sm text-ink-600">{type.label}</span>
          {(["email", "push"] as const).map((channel) => {
            const on = prefs[type.key]?.[channel] ?? defaultFor(type.key, channel);
            return (
              <button
                key={channel}
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${type.label} via ${channel}`}
                onClick={() => toggle(type.key, channel)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  on ? "bg-clay-600" : "bg-sand-200"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                    on ? "left-6" : "left-0.5"
                  )}
                />
              </button>
            );
          })}
        </div>
      ))}
      <p className="text-xs text-ink-300 pt-2">
        SMS is planned; email and push apply once those providers are connected
        (docs/INTEGRATIONS.md §6). In-app notifications are always on.
      </p>
    </div>
  );
}

function defaultFor(type: string, channel: "email" | "push"): boolean {
  const defaults: Record<string, { email: boolean; push: boolean }> = {
    "chapter.ready": { email: true, push: true },
    "family.submission": { email: false, push: true },
    "capture.summary": { email: true, push: false },
    "age.milestone": { email: false, push: true },
    reengagement: { email: true, push: false },
    "book.ready": { email: true, push: true },
    "recap.ready": { email: false, push: true },
    "export.ready": { email: true, push: false },
  };
  return defaults[type]?.[channel] ?? false;
}
