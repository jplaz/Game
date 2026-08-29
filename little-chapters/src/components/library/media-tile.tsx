"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, Play } from "lucide-react";
import { MediaImage } from "@/components/media/media-image";
import { cn } from "@/lib/cn";

export function MediaTile({
  mediaId,
  kind,
  isFavorite,
  canEdit,
  altText,
}: {
  mediaId: string;
  kind: string;
  isFavorite: boolean;
  canEdit: boolean;
  altText: string | null;
}) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(isFavorite);

  return (
    <div className="relative group">
      <MediaImage
        mediaId={mediaId}
        variant={kind === "video" ? "poster" : "thumb"}
        alt={altText ?? ""}
        className="aspect-square"
      />
      {kind === "video" ? (
        <span className="absolute left-2 bottom-2 grid h-7 w-7 place-items-center rounded-full bg-ink-800/70 text-cream-50">
          <Play size={13} aria-label="Video" />
        </span>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          aria-label={favorite ? "Remove from favorites" : "Mark as favorite"}
          aria-pressed={favorite}
          onClick={() => {
            const next = !favorite;
            setFavorite(next);
            void fetch(`/api/media/${mediaId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ isFavorite: next }),
            }).then(() => router.refresh());
          }}
          className={cn(
            "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full transition-colors",
            favorite
              ? "bg-white/90 text-clay-600"
              : "bg-ink-800/40 text-cream-50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          )}
        >
          <Heart size={15} fill={favorite ? "currentColor" : "none"} />
        </button>
      ) : null}
    </div>
  );
}
