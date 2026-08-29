"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { formatDateShort } from "@/lib/format";

type MediaUrlMap = Record<string, { kind: string; url: string; posterUrl: string | null }>;

interface SharePayload {
  requires: "none" | "password" | "family_auth";
  targetType?: string;
  chapter?: {
    title: string;
    subtitle: string | null;
    coverMediaId: string | null;
    sections: Array<{
      type: string;
      title: string | null;
      content: {
        text?: string;
        items?: Array<{ label: string; value?: string; date?: string }>;
        mediaIds?: string[];
        captions?: Record<string, string>;
      };
    }>;
  };
  memory?: { title: string | null; body: string | null; mediaIds: string[] };
  recap?: { title: string; url: string };
  mediaUrls?: MediaUrlMap;
}

/** Private share-link viewer for chapters, memories, and recaps. */
export function ShareViewer({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "ready" | "locked" | "auth" | "gone">("loading");
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(
    async (pw?: string) => {
      setError(null);
      try {
        const response = await fetch("/api/public/share/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, password: pw }),
        });
        if (!response.ok) {
          if (pw) setError("That password isn't right");
          else setState("gone");
          return;
        }
        const data = (await response.json()) as SharePayload;
        if (data.requires === "password") setState("locked");
        else if (data.requires === "family_auth") setState("auth");
        else if (data.targetType === "gone") setState("gone");
        else {
          setPayload(data);
          setState("ready");
        }
      } catch {
        setState("gone");
      }
    },
    [token]
  );

  useEffect(() => {
    void resolve();
  }, [resolve]);

  if (state === "loading") {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (state === "gone") {
    return <p className="text-center text-ink-400 py-24">This link is no longer available.</p>;
  }
  if (state === "auth") {
    return (
      <div className="text-center py-24 space-y-3">
        <p className="text-ink-500">This is shared with family members only.</p>
        <a href={`/login?next=/s/${token}`} className="text-clay-600 font-medium">
          Sign in to view it
        </a>
      </div>
    );
  }
  if (state === "locked") {
    return (
      <form
        className="max-w-xs mx-auto py-24 space-y-4 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          void resolve(password);
        }}
      >
        <p className="text-ink-500">This share is protected.</p>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full">Open</Button>
      </form>
    );
  }

  const urls = payload?.mediaUrls ?? {};
  const renderMedia = (id: string, caption?: string) => {
    const item = urls[id];
    if (!item) return null;
    if (item.kind === "video") {
      return (
        <video
          key={id}
          controls
          playsInline
          src={item.url}
          poster={item.posterUrl ?? undefined}
          className="w-full rounded-photo bg-ink-800"
        />
      );
    }
    return (
      <figure key={id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={caption ?? ""} className="w-full rounded-photo" />
        {caption ? (
          <figcaption className="mt-2 text-sm text-clay-600 italic text-center">
            {caption}
          </figcaption>
        ) : null}
      </figure>
    );
  };

  if (payload?.targetType === "recap" && payload.recap) {
    return (
      <article className="max-w-xl mx-auto py-10 px-4 space-y-5 text-center">
        <p className="font-display text-sm text-clay-600">Little Chapters</p>
        <h1 className="text-2xl text-ink-700">{payload.recap.title}</h1>
        <video controls playsInline autoPlay src={payload.recap.url}
          className="w-full rounded-card bg-ink-800 shadow-lifted" />
      </article>
    );
  }

  if (payload?.targetType === "memory" && payload.memory) {
    return (
      <article className="max-w-xl mx-auto py-10 px-4 space-y-5">
        <p className="font-display text-sm text-clay-600 text-center">Little Chapters</p>
        {payload.memory.title ? (
          <h1 className="text-2xl text-ink-700 text-center">{payload.memory.title}</h1>
        ) : null}
        {payload.memory.body ? (
          <p className="text-ink-600 leading-relaxed whitespace-pre-wrap">{payload.memory.body}</p>
        ) : null}
        <div className="space-y-3">{payload.memory.mediaIds.map((id) => renderMedia(id))}</div>
      </article>
    );
  }

  const chapter = payload?.chapter;
  if (!chapter) return null;
  return (
    <article className="max-w-2xl mx-auto py-10 px-4 space-y-10">
      <header className="text-center lc-grain bg-cream-100 rounded-card px-6 py-10 border border-sand-100 space-y-4">
        {chapter.coverMediaId && urls[chapter.coverMediaId] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urls[chapter.coverMediaId]!.url}
            alt=""
            className="mx-auto h-56 w-56 object-cover rounded-card shadow-lifted rotate-1"
          />
        ) : null}
        <div>
          <p className="font-display text-sm text-clay-600">Little Chapters</p>
          <h1 className="text-3xl sm:text-4xl text-ink-700 mt-1">{chapter.title}</h1>
          {chapter.subtitle ? (
            <p className="text-clay-600 mt-1 font-display text-lg">{chapter.subtitle}</p>
          ) : null}
        </div>
      </header>
      {chapter.sections
        .filter((s) => s.type !== "cover")
        .map((section, i) => (
          <section key={i}>
            {section.title ? (
              <h2 className="text-xl sm:text-2xl text-ink-700 mb-4 text-center">
                {section.title}
              </h2>
            ) : null}
            {section.content.text ? (
              <p className="text-ink-600 leading-loose whitespace-pre-wrap max-w-prose mx-auto">
                {section.content.text}
              </p>
            ) : null}
            {(section.content.items?.length ?? 0) > 0 ? (
              <ul className="max-w-md mx-auto space-y-2.5">
                {section.content.items!.map((item, j) => (
                  <li key={j} className="flex items-baseline justify-between gap-4 border-b border-sand-100 pb-2.5">
                    <span className="text-ink-600">{item.label}</span>
                    <span className="text-sm text-ink-300 shrink-0">
                      {item.value ?? (item.date ? formatDateShort(item.date) : "")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {(section.content.mediaIds?.length ?? 0) > 0 ? (
              <div
                className={
                  section.content.mediaIds!.length === 1
                    ? "max-w-md mx-auto"
                    : "grid grid-cols-2 sm:grid-cols-3 gap-2"
                }
              >
                {section.content.mediaIds!.map((id) =>
                  renderMedia(id, section.content.captions?.[id])
                )}
              </div>
            ) : null}
          </section>
        ))}
    </article>
  );
}
