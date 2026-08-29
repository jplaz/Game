import { notFound } from "next/navigation";
import { requireAppContext } from "@/server/context";
import { getChild } from "@/server/domain/children";
import { listGrowthEntries, listMilestones } from "@/server/domain/milestones";
import { formatDate, formatLength, formatWeight } from "@/lib/format";
import { NotFoundError } from "@/server/errors";
import { SectionHeading } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { MilestoneReview } from "@/components/children/milestone-review";
import { GrowthForm } from "@/components/children/growth-form";

export const dynamic = "force-dynamic";

export default async function ChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  let child;
  try {
    child = await getChild(ctx.user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  const milestones = await listMilestones(ctx.user.id, id, { includeSuggested: isParent });
  const growth = await listGrowthEntries(ctx.user.id, id);
  const suggested = milestones.filter((m) => m.status === "suggested");
  const confirmed = milestones.filter((m) => m.status === "confirmed");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl text-ink-700">{child.displayName}</h1>
        <p className="text-clay-600 font-display mt-1">
          {child.ageText ?? "On the way"}
        </p>
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {child.birthDate ? (
            <div className="lc-card p-3">
              <dt className="text-xs text-ink-300">Born</dt>
              <dd className="text-ink-600 mt-0.5">{formatDate(child.birthDate)}</dd>
            </div>
          ) : null}
          {child.birthLocation ? (
            <div className="lc-card p-3">
              <dt className="text-xs text-ink-300">In</dt>
              <dd className="text-ink-600 mt-0.5">{child.birthLocation}</dd>
            </div>
          ) : null}
          {child.birthWeightGrams ? (
            <div className="lc-card p-3">
              <dt className="text-xs text-ink-300">Birth weight</dt>
              <dd className="text-ink-600 mt-0.5">{formatWeight(child.birthWeightGrams)}</dd>
            </div>
          ) : null}
          {child.birthLengthMm ? (
            <div className="lc-card p-3">
              <dt className="text-xs text-ink-300">Birth length</dt>
              <dd className="text-ink-600 mt-0.5">{formatLength(child.birthLengthMm)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {isParent && suggested.length > 0 ? (
        <section className="lc-card p-6 space-y-3">
          <SectionHeading
            title="Possible milestones"
            subtitle="Nothing is recorded until you confirm it."
            className="mb-0"
          />
          {suggested.map((m) => (
            <MilestoneReview
              key={m.id}
              milestoneId={m.id}
              title={m.title}
              reason={m.suggestedReason ?? ""}
            />
          ))}
        </section>
      ) : null}

      <section>
        <SectionHeading title="Milestones" />
        {confirmed.length === 0 ? (
          <p className="text-sm text-ink-300">
            None recorded yet — they&apos;ll appear here as you confirm them.
          </p>
        ) : (
          <ul className="space-y-2">
            {confirmed.map((m) => (
              <li key={m.id} className="lc-card px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-ink-600">{m.title}</span>
                <span className="flex items-center gap-2 text-xs text-ink-300 shrink-0">
                  <Badge>{m.category}</Badge>
                  {formatDate(m.happenedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-6 items-start">
        <div>
          <SectionHeading
            title="Growth"
            subtitle="Kept as memories, not medical charts."
          />
          {growth.length === 0 ? (
            <p className="text-sm text-ink-300">No entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {growth.slice().reverse().map((entry) => (
                <li key={entry.id} className="lc-card px-4 py-3 text-sm">
                  <p className="text-xs text-ink-300">{formatDate(entry.measuredAt)}</p>
                  <p className="text-ink-600 mt-0.5">
                    {[
                      entry.weightGrams ? formatWeight(entry.weightGrams) : null,
                      entry.heightMm ? formatLength(entry.heightMm) : null,
                      entry.clothingSize ? `wearing ${entry.clothingSize}` : null,
                      entry.diaperSize ? `diapers ${entry.diaperSize}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        {isParent ? (
          <div className="lc-card p-6">
            <SectionHeading title="Add a growth note" className="mb-4" />
            <GrowthForm childId={child.id} />
          </div>
        ) : null}
      </section>

      {child.birthStory ? (
        <section>
          <SectionHeading title="The day you were born" />
          <p className="text-ink-600 leading-relaxed whitespace-pre-wrap max-w-prose">
            {child.birthStory}
          </p>
        </section>
      ) : null}
    </div>
  );
}
