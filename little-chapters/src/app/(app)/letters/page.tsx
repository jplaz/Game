import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { listLetters } from "@/server/domain/letters";
import { formatDate } from "@/lib/format";
import { LetterForm } from "@/components/letters/letter-form";
import { EmptyState, Badge } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/card";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LettersPage() {
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
  const letters = await listLetters(ctx.user.id, child.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl text-ink-700">Letters</h1>
        <p className="text-sm text-ink-300 mt-1">
          Words for {child.displayName} to find later — some sealed until the day
          they&apos;re meant for.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section className="lc-card p-6">
          <SectionHeading title="Write a letter" className="mb-4" />
          <LetterForm childId={child.id} childName={child.displayName} />
        </section>

        <section className="space-y-3">
          <SectionHeading title="Kept letters" className="mb-1" />
          {letters.length === 0 ? (
            <p className="text-sm text-ink-300">
              No letters yet. Even a few sentences will mean the world someday.
            </p>
          ) : (
            letters.map((letter) => (
              <div key={letter.id} className="lc-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display text-lg text-ink-700 flex items-center gap-2">
                    {letter.sealed ? <Lock size={14} className="text-clay-600" /> : null}
                    {letter.title}
                  </p>
                  <Badge>{letter.kind.replaceAll("_", " ")}</Badge>
                </div>
                <p className="text-xs text-ink-300 mt-1">
                  From {letter.authorName} · {formatDate(letter.createdAt)}
                  {letter.sealed && letter.unlockAt
                    ? ` · opens ${formatDate(letter.unlockAt)}`
                    : ""}
                </p>
                {letter.body ? (
                  <p className="mt-3 text-sm text-ink-500 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {letter.body}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-ink-300 italic">
                    Sealed until it&apos;s time.
                  </p>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
