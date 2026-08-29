import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { getSql } from "@/server/db/client";
import { MediaTile } from "@/components/library/media-tile";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; before?: string; favorites?: string }>;
}) {
  const ctx = await requireAppContext();
  const params = await searchParams;
  const kind = params.kind === "photo" || params.kind === "video" ? params.kind : null;
  const favoritesOnly = params.favorites === "1";
  const before = params.before && /^\d{4}-\d{2}-\d{2}T/.test(params.before) ? params.before : null;
  const isParent = ctx.role === "owner" || ctx.role === "parent";

  const sql = getSql();
  const media = await sql<
    { id: string; kind: string; is_favorite: boolean; alt_text: string | null;
      captured_at: Date | null }[]
  >`
    select id, kind, is_favorite, alt_text, captured_at
    from media
    where family_id = ${ctx.familyId} and deleted_at is null and status = 'ready'
      and hidden = false and kind in ('photo','video')
      and (${isParent} or approval_status = 'approved')
      and (${kind}::text is null or kind = ${kind})
      and (${favoritesOnly} = false or is_favorite)
      and (${before}::timestamptz is null or captured_at < ${before})
    order by captured_at desc nulls last
    limit ${PAGE_SIZE}
  `;
  const oldest = media[media.length - 1];

  const filterLink = (opts: { kind?: string | null; favorites?: boolean }) => {
    const search = new URLSearchParams();
    if (opts.kind) search.set("kind", opts.kind);
    if (opts.favorites) search.set("favorites", "1");
    const qs = search.toString();
    return `/library${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl text-ink-700">Library</h1>
          <p className="text-sm text-ink-300 mt-1">
            Every photo and video, ready for chapters and books.
          </p>
        </div>
        <Link href="/memories/new" className={buttonClass({ size: "sm" })}>
          Upload
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { label: "All", href: filterLink({}), active: !kind && !favoritesOnly },
          { label: "Photos", href: filterLink({ kind: "photo" }), active: kind === "photo" },
          { label: "Videos", href: filterLink({ kind: "video" }), active: kind === "video" },
          { label: "Favorites", href: filterLink({ favorites: true }), active: favoritesOnly },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors",
              f.active
                ? "bg-ink-700 text-cream-50 border-ink-700"
                : "bg-white text-ink-500 border-sand-200 hover:border-sand-300"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {media.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Photos and videos you add will appear here, scored and organized for chapters automatically."
          action={<Link href="/memories/new" className={buttonClass()}>Add some</Link>}
        />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 sm:gap-2">
          {media.map((item) => (
            <MediaTile
              key={item.id}
              mediaId={item.id}
              kind={item.kind}
              isFavorite={item.is_favorite}
              canEdit={isParent}
              altText={item.alt_text}
            />
          ))}
        </div>
      )}

      {media.length === PAGE_SIZE && oldest?.captured_at ? (
        <div className="text-center">
          <Link
            href={`${filterLink({ kind, favorites: favoritesOnly })}${kind || favoritesOnly ? "&" : "?"}before=${encodeURIComponent(oldest.captured_at.toISOString())}`}
            className={buttonClass({ variant: "secondary" })}
          >
            Earlier
          </Link>
        </div>
      ) : null}
    </div>
  );
}
