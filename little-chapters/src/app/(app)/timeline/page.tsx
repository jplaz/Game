import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { getTimeline } from "@/server/domain/memories";
import { formatDateShort } from "@/lib/format";
import { MediaImage } from "@/components/media/media-image";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: null, label: "Everything" },
  { key: "milestone", label: "Milestones" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
] as const;

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; before?: string; month?: string; year?: string }>;
}) {
  const ctx = await requireAppContext();
  const params = await searchParams;
  const child = ctx.children[0];
  if (!child) {
    return (
      <EmptyState
        title="No child yet"
        action={<Link href="/children/new" className={buttonClass()}>Add your child</Link>}
      />
    );
  }

  const view = (["milestone", "photo", "video"] as const).find((v) => v === params.view) ?? null;
  const entries = await getTimeline(ctx.user.id, child.id, {
    kind: view,
    before: params.before,
    month: /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month : null,
    year: /^\d{4}$/.test(params.year ?? "") ? Number(params.year) : null,
    limit: 40,
  });

  const oldest = entries[entries.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl text-ink-700">
            {child.displayName}&apos;s timeline
          </h1>
          <p className="text-sm text-ink-300 mt-1">Every moment, in order.</p>
        </div>
        <Link href="/memories/new" className={buttonClass({ size: "sm" })}>
          Add memory
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Timeline views">
        {VIEWS.map((v) => (
          <Link
            key={v.label}
            href={v.key ? `/timeline?view=${v.key}` : "/timeline"}
            role="tab"
            aria-selected={view === v.key}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors",
              view === v.key
                ? "bg-ink-700 text-cream-50 border-ink-700"
                : "bg-white text-ink-500 border-sand-200 hover:border-sand-300"
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Memories you and your family capture will build into a childhood timeline."
          action={<Link href="/memories/new" className={buttonClass()}>Capture the first one</Link>}
        />
      ) : (
        <ol className="relative border-l-2 border-sand-200 ml-3 sm:ml-4 space-y-6">
          {entries.map((entry) => (
            <li key={entry.id} className="relative pl-6 sm:pl-8">
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[7px] top-2 h-3 w-3 rounded-full border-2 border-cream-50",
                  entry.isMilestone ? "bg-clay-600" : "bg-sand-300"
                )}
              />
              <Link
                href={`/memories/${entry.id}`}
                className="block lc-card p-4 sm:p-5 hover:shadow-lifted transition-shadow"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  <span className="font-medium text-ink-500">
                    {formatDateShort(entry.happenedAt)}
                  </span>
                  {entry.ageText ? <span>{entry.ageText}</span> : null}
                  {entry.isMilestone ? <Badge tone="accent">Milestone</Badge> : null}
                  {entry.hasAudio ? <Badge>Voice</Badge> : null}
                  {entry.approvalStatus === "pending" ? (
                    <Badge tone="pending">Awaiting approval</Badge>
                  ) : null}
                </div>
                {entry.title ? (
                  <p className="mt-1.5 font-medium text-ink-700">{entry.title}</p>
                ) : null}
                {entry.body ? (
                  <p className="mt-1 text-sm text-ink-500 line-clamp-2 leading-relaxed">
                    {entry.body}
                  </p>
                ) : null}
                {entry.coverMediaId ? (
                  <div className="mt-3 flex items-center gap-2">
                    <MediaImage
                      mediaId={entry.coverMediaId}
                      alt=""
                      className="h-20 w-20"
                    />
                    {entry.mediaCount > 1 ? (
                      <span className="text-xs text-ink-300">
                        +{entry.mediaCount - 1} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}

      {entries.length === 40 && oldest ? (
        <div className="text-center">
          <Link
            href={`/timeline?${view ? `view=${view}&` : ""}before=${oldest.happenedAt}`}
            className={buttonClass({ variant: "secondary" })}
          >
            Earlier moments
          </Link>
        </div>
      ) : null}
    </div>
  );
}
