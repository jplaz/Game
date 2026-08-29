import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { getSql } from "@/server/db/client";
import { nextAgeMilestone } from "@/lib/age";
import { formatDate, formatMonth } from "@/lib/format";
import { MediaImage } from "@/components/media/media-image";
import { GenerateChapterButton } from "@/components/chapters/generate-button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await requireAppContext();
  const child = ctx.children[0];
  if (!child) {
    return (
      <EmptyState
        title="Let's start their story"
        body="Add your child to begin capturing memories."
        action={
          <Link href="/children/new" className={buttonClass()}>
            Add your child
          </Link>
        }
      />
    );
  }

  const sql = getSql();
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthKey = monthStart.toISOString().slice(0, 7);
  const monthStartIso = `${monthKey}-01`;

  const [counts] = await sql<
    { memories: number; photos: number; videos: number; milestones: number }[]
  >`
    select
      (select count(*)::int from memories
        where child_id = ${child.id} and deleted_at is null
          and approval_status = 'approved'
          and happened_at >= ${monthStartIso}) as memories,
      (select count(*)::int from media
        where (child_id = ${child.id} or (family_id = ${ctx.familyId} and child_id is null))
          and kind = 'photo' and deleted_at is null and status = 'ready'
          and captured_at >= ${monthStartIso}::date) as photos,
      (select count(*)::int from media
        where (child_id = ${child.id} or (family_id = ${ctx.familyId} and child_id is null))
          and kind = 'video' and deleted_at is null and status = 'ready'
          and captured_at >= ${monthStartIso}::date) as videos,
      (select count(*)::int from milestones
        where child_id = ${child.id} and status = 'confirmed'
          and happened_at >= ${monthStartIso}) as milestones
  `;

  const chapter = (
    await sql<{ id: string; status: string; title: string }[]>`
      select id, status, title from chapters
      where child_id = ${child.id} and kind = 'month'
        and period_start = ${monthStartIso} and deleted_at is null
    `
  )[0];

  const favoritePhoto = (
    await sql<{ id: string }[]>`
      select id from media
      where (child_id = ${child.id} or (family_id = ${ctx.familyId} and child_id is null))
        and kind = 'photo' and status = 'ready' and deleted_at is null
        and approval_status = 'approved' and hidden = false
      order by is_favorite desc, quality_score desc nulls last, captured_at desc
      limit 1
    `
  )[0];

  const recentMemories = await sql<
    { id: string; title: string | null; body: string | null; happened_at: string; kind: string }[]
  >`
    select id, title, body, happened_at::text as happened_at, kind
    from memories
    where child_id = ${child.id} and deleted_at is null and approval_status = 'approved'
    order by happened_at desc, created_at desc limit 4
  `;

  const pendingCount = (
    await sql<{ n: number }[]>`
      select count(*)::int as n from memories
      where family_id = ${ctx.familyId} and approval_status = 'pending' and deleted_at is null
    `
  )[0];

  const suggestedMilestones = (
    await sql<{ n: number }[]>`
      select count(*)::int as n from milestones
      where child_id = ${child.id} and status = 'suggested'
    `
  )[0];

  const birthDate = child.birthDate ? new Date(`${child.birthDate}T00:00:00`) : null;
  const upcoming = birthDate ? nextAgeMilestone(birthDate) : null;
  const isParent = ctx.role === "owner" || ctx.role === "parent";

  return (
    <div className="space-y-8 animate-fade-up">
      {/* hero */}
      <section className="relative overflow-hidden rounded-card lc-grain bg-gradient-to-b from-cream-100 to-cream-50 border border-sand-100 shadow-card">
        <div className="grid sm:grid-cols-[1fr_auto] gap-6 p-6 sm:p-8 items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl text-ink-700">{child.displayName}</h1>
            {child.ageText ? (
              <p className="text-lg text-clay-600 mt-1 font-display">{child.ageText}</p>
            ) : (
              <p className="text-lg text-clay-600 mt-1 font-display">On the way</p>
            )}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-400">
              <span>
                <strong className="text-ink-600">{counts?.memories ?? 0}</strong> memories
                this month
              </span>
              <span>
                <strong className="text-ink-600">{counts?.photos ?? 0}</strong> photos
              </span>
              <span>
                <strong className="text-ink-600">{counts?.videos ?? 0}</strong> videos
              </span>
              <span>
                <strong className="text-ink-600">{counts?.milestones ?? 0}</strong> milestones
              </span>
            </div>
            <div className="mt-6">
              {chapter?.status === "ready" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/chapters/${chapter.id}`} className={buttonClass({ size: "lg" })}>
                    Your {formatMonth(monthStartIso)} chapter is ready — view it
                  </Link>
                </div>
              ) : chapter?.status === "generating" ? (
                <Badge tone="accent">Your {formatMonth(monthStartIso)} chapter is being written…</Badge>
              ) : isParent ? (
                <GenerateChapterButton childId={child.id} month={monthKey} />
              ) : null}
            </div>
          </div>
          {favoritePhoto ? (
            <MediaImage
              mediaId={favoritePhoto.id}
              variant="web"
              alt={`A favorite photo of ${child.displayName}`}
              className="hidden sm:block h-48 w-48 rounded-card rotate-1 shadow-lifted"
            />
          ) : null}
        </div>
      </section>

      {/* nudges */}
      {(isParent && ((pendingCount?.n ?? 0) > 0 || (suggestedMilestones?.n ?? 0) > 0)) || upcoming ? (
        <section className="grid sm:grid-cols-2 gap-3">
          {isParent && (pendingCount?.n ?? 0) > 0 ? (
            <Link href="/family" className="lc-card p-4 flex items-center justify-between hover:shadow-lifted transition-shadow">
              <span className="text-sm text-ink-600">
                {pendingCount!.n} family {pendingCount!.n === 1 ? "memory" : "memories"} waiting for your approval
              </span>
              <Badge tone="pending">Review</Badge>
            </Link>
          ) : null}
          {isParent && (suggestedMilestones?.n ?? 0) > 0 ? (
            <Link href={`/children/${child.id}`} className="lc-card p-4 flex items-center justify-between hover:shadow-lifted transition-shadow">
              <span className="text-sm text-ink-600">
                {suggestedMilestones!.n} possible {suggestedMilestones!.n === 1 ? "milestone" : "milestones"} to confirm
              </span>
              <Badge tone="accent">Take a look</Badge>
            </Link>
          ) : null}
          {upcoming ? (
            <div className="lc-card p-4 text-sm text-ink-600">
              {child.displayName} {upcoming.label} on{" "}
              <strong>{formatDate(upcoming.date)}</strong>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* latest memories */}
      <section>
        <SectionHeading
          title="Latest memories"
          action={
            <Link href="/timeline" className="text-sm font-medium text-clay-600 hover:text-clay-700">
              See the timeline →
            </Link>
          }
        />
        {recentMemories.length === 0 ? (
          <EmptyState
            title="Nothing captured yet"
            body={`The little moments go quickly. Start with one photo or one sentence about ${child.displayName}'s day.`}
            action={
              <Link href="/memories/new" className={buttonClass()}>
                Add a memory
              </Link>
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {recentMemories.map((memory) => (
              <Link
                key={memory.id}
                href={`/memories/${memory.id}`}
                className="lc-card p-5 hover:shadow-lifted transition-shadow"
              >
                <p className="text-xs text-ink-300">{formatDate(memory.happened_at)}</p>
                <p className="mt-1 text-ink-600 line-clamp-3 leading-relaxed">
                  {memory.title ?? memory.body ?? "A captured moment"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
