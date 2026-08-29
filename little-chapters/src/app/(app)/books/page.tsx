import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { listBooks } from "@/server/domain/books";
import { getSql } from "@/server/db/client";
import { computeAge } from "@/lib/age";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { CreateBookButton } from "@/components/books/book-actions";
import { StorybookForm } from "@/components/books/storybook-form";
import { SectionHeading } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
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
  const books = await listBooks(ctx.user.id, child.id);
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  const sql = getSql();
  const storyMemories = isParent
    ? (
        await sql<
          { id: string; title: string | null; body: string; happened_at: string }[]
        >`
          select id, title, body, happened_at::text as happened_at
          from memories
          where child_id = ${child.id} and deleted_at is null
            and approval_status = 'approved' and body is not null
          order by is_favorite desc, happened_at desc limit 30
        `
      ).map((m) => ({
        id: m.id,
        title: m.title,
        snippet: m.body.slice(0, 100),
        happenedAt: m.happened_at,
      }))
    : [];
  const ageYears = child.birthDate
    ? computeAge(new Date(`${child.birthDate}T00:00:00`)).years
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl text-ink-700">Books</h1>
        <p className="text-sm text-ink-300 mt-1">
          The chapters you&apos;ve made, bound into something you can hold.
        </p>
      </div>

      {isParent ? (
        <section className="lc-card p-6 space-y-4">
          <SectionHeading
            title="Start a book"
            subtitle="Compiled automatically from your chapters — everything stays editable."
            className="mb-0"
          />
          <div className="flex flex-wrap gap-3">
            <CreateBookButton
              childId={child.id}
              kind="first_year"
              label={`${child.displayName}: Year One`}
            />
            {ageYears >= 1 ? (
              <CreateBookButton
                childId={child.id}
                kind="birthday"
                yearNumber={ageYears}
                label={`${child.displayName}: Year ${ageYears}`}
              />
            ) : null}
            <CreateBookButton
              childId={child.id}
              kind="grandparent"
              label="A grandparent book"
            />
          </div>
        </section>
      ) : null}

      {isParent ? (
        <section className="lc-card p-6 space-y-4">
          <SectionHeading
            title="A storybook from real days"
            subtitle={`e.g. “${child.displayName}'s First Trip to the Beach” — written only from memories you choose.`}
            className="mb-0"
          />
          <StorybookForm childId={child.id} memories={storyMemories} />
        </section>
      ) : null}

      {books.length === 0 ? (
        <EmptyState
          title="No books yet"
          body="Once you have a chapter or two, a first-year or birthday book comes together in one tap — QR-linked video memories included."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/books/${book.id}`}
              className="lc-card p-5 hover:shadow-lifted transition-shadow"
            >
              <p className="font-display text-lg text-ink-700">{book.title}</p>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-300">
                {book.pageCount ? <span>{book.pageCount} pages</span> : null}
                {book.status === "generating" ? (
                  <Badge tone="accent">Compiling…</Badge>
                ) : book.status === "rendering" ? (
                  <Badge tone="accent">Preparing print files…</Badge>
                ) : book.status === "rendered" ? (
                  <Badge tone="success">Print-ready</Badge>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
