"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Renders a media item via a short-lived signed URL fetched on demand.
 * Raw storage URLs never appear in server-rendered HTML.
 */
export function MediaImage({
  mediaId,
  variant = "thumb",
  alt,
  className,
  imgClassName,
}: {
  mediaId: string;
  variant?: "thumb" | "web" | "poster";
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    fetch(`/api/media/${mediaId}/url?variant=${variant}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { url: string }) => {
        if (!cancelled) setUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId, variant]);

  return (
    <div className={cn("lc-photo-frame relative", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className={cn("h-full w-full object-cover animate-fade-up", imgClassName)}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : failed ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-ink-300">
          Still processing…
        </div>
      ) : (
        <div className="absolute inset-0 lc-skeleton" aria-hidden />
      )}
    </div>
  );
}

export function MediaVideo({
  mediaId,
  className,
}: {
  mediaId: string;
  className?: string;
}) {
  const [urls, setUrls] = useState<{ video: string; poster: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/media/${mediaId}/url?variant=web_video`).then((r) =>
        r.ok ? r.json() : Promise.reject()
      ),
      fetch(`/api/media/${mediaId}/url?variant=poster`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([video, poster]: [{ url: string }, { url: string } | null]) => {
        if (!cancelled) setUrls({ video: video.url, poster: poster?.url ?? null });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  if (failed) {
    return (
      <div className={cn("lc-photo-frame grid place-items-center aspect-video text-xs text-ink-300", className)}>
        This video is still processing
      </div>
    );
  }
  if (!urls) return <div className={cn("lc-skeleton aspect-video rounded-photo", className)} />;
  return (
    <video
      controls
      playsInline
      preload="metadata"
      poster={urls.poster ?? undefined}
      src={urls.video}
      className={cn("w-full rounded-photo bg-ink-800", className)}
    />
  );
}

export function MediaAudio({ mediaId, className }: { mediaId: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/media/${mediaId}/url?variant=original`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { url: string }) => {
        if (!cancelled) setUrl(data.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mediaId]);
  if (!url) return <div className={cn("lc-skeleton h-12 rounded-full", className)} />;
  return <audio controls src={url} className={cn("w-full", className)} preload="metadata" />;
}
