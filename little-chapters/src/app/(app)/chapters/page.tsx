import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { listChapters } from "@/server/domain/chapters";
import { formatMonth } from "@/lib/format";
import { MediaImage } from "@/components/media/media-image";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { GenerateChapterButton } from "@/components/chapters/generate-button";

export const dynamic = "force-dynamic";

export default async function ChaptersPage() {
  const ctx = await requireAppContext();
  const child = ctx.children[0];
  if (!child) {
    return (
      <EmptyState
        title="No child yet"
        action={<Link href="/children/new" className={buttonClass()}>Add your child</Link>}
      />
    );
  }
  const chapters = await listChapters(ctx.user.id, child.id);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const hasCurrent = chapters.some((c) => c.periodStart.startsWith(currentMonth));
  const isParent = ctx.role === "owner" || ctx.role === "parent";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl text-ink-700">
            {child.displayName}&apos;s chapters
          </h1>
          <p className="text-sm text-ink-300 mt-1">
            A childhood, one month at a time.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/books" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Books
          </Link>
        </div>
      </div>

      {!hasCurrent && isParent ? (
        <div className="lc-card p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-ink-700">
              {formatMonth(`${currentMonth}-01`)} is still unwritten
            </p>
            <p className="text-sm text-ink-300 mt-0.5">
              Turn this month&apos;s photos, videos and memories into a chapter.
            </p>
          </div>
          <GenerateChapterButton childId={child.id} month={currentMonth} size="md" />
        </div>
      ) : null}

      {chapters.length === 0 ? (
        <EmptyState
          title="No chapters yet"
          body="Capture a few memories this month, then create your first chapter with one tap."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {chapters.map((chapter) => (
            <Link
              key={chapter.id}
              href={`/chapters/${chapter.id}`}
              className="lc-card overflow-hidden hover:shadow-lifted transition-shadow group"
            >
              {chapter.coverMediaId ? (
                <MediaImage
                  mediaId={chapter.coverMediaId}
                  variant="web"
                  alt=""
                  className="aspect-[4/3] rounded-none"
                />
              ) : (
                <div className="aspect-[4/3] lc-grain bg-cream-200" aria-hidden />
              )}
              <div className="p-4">
                <p className="font-display text-lg text-ink-700 group-hover:text-clay-700 transition-colors">
                  {chapter.title}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-ink-300">
                  <span>{chapter.subtitle ?? formatMonth(chapter.periodStart)}</span>
                  {chapter.status === "generating" ? (
                    <Badge tone="accent">Writing…</Badge>
                  ) : chapter.status === "draft" ? (
                    <Badge>Draft</Badge>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
