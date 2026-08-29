"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";

interface ResolvedContent {
  requires: "none" | "password" | "family_auth";
  title?: string;
  text?: string | null;
  media?: Array<{ id: string; kind: string; url: string; posterUrl: string | null }>;
}

/** The page a printed QR code opens — possibly decades from now. */
export function QrViewer({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "ready" | "locked" | "auth" | "gone">("loading");
  const [content, setContent] = useState<ResolvedContent | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(
    async (pw?: string) => {
      setError(null);
      try {
        const response = await fetch("/api/public/qr/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, password: pw }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: { message?: string } } | null;
          if (pw) setError(data?.error?.message ?? "That password isn't right");
          else setState("gone");
          return;
        }
        const data = (await response.json()) as ResolvedContent;
        if (data.requires === "password") setState("locked");
        else if (data.requires === "family_auth") setState("auth");
        else {
          setContent(data);
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
    return (
      <p className="text-center text-ink-400 py-24">
        This memory is no longer shared.
      </p>
    );
  }
  if (state === "auth") {
    return (
      <div className="text-center py-24 space-y-4">
        <p className="text-ink-500">This memory is shared with family only.</p>
        <a href={`/login?next=/m/${token}`} className="text-clay-600 font-medium">
          Sign in to watch it
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
        <p className="text-ink-500">This memory is protected.</p>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full">
          Open
        </Button>
      </form>
    );
  }

  return (
    <article className="max-w-xl mx-auto py-10 px-4 space-y-6 animate-fade-up">
      <header className="text-center">
        <p className="font-display text-sm text-clay-600">Little Chapters</p>
        <h1 className="text-2xl sm:text-3xl text-ink-700 mt-2">{content?.title}</h1>
      </header>
      {content?.media?.map((item) =>
        item.kind === "video" ? (
          <video
            key={item.id}
            controls
            playsInline
            autoPlay
            src={item.url}
            poster={item.posterUrl ?? undefined}
            className="w-full rounded-card bg-ink-800 shadow-lifted"
          />
        ) : item.kind === "audio" ? (
          <audio key={item.id} controls src={item.url} className="w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.id}
            src={item.url}
            alt=""
            className="w-full rounded-card shadow-card"
          />
        )
      )}
      {content?.text ? (
        <p className="text-ink-600 leading-relaxed whitespace-pre-wrap text-center">
          {content.text}
        </p>
      ) : null}
    </article>
  );
}
