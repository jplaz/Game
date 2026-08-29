import { notFound } from "next/navigation";
import { requireAppContext } from "@/server/context";
import { getBook } from "@/server/domain/books";
import { NotFoundError } from "@/server/errors";
import { getSql } from "@/server/db/client";
import { MediaImage } from "@/components/media/media-image";
import { Badge } from "@/components/ui/misc";
import { RenderBookButton } from "@/components/books/book-actions";
import { OrderForm } from "@/components/books/order-form";
import { SectionHeading } from "@/components/ui/card";
import { QrCode } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  let book;
  try {
    book = await getBook(ctx.user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  const sql = getSql();
  const products =
    isParent && book.status === "rendered"
      ? (
          await sql<{ id: string; name: string; retail_price_cents: number }[]>`
            select id, name, retail_price_cents from print_products
            where is_active and kind in ('hardcover','softcover','layflat','mini')
            order by retail_price_cents desc
          `
        ).map((p) => ({ id: p.id, name: p.name, retailPriceCents: p.retail_price_cents }))
      : [];
  const preflight = book.preflight as {
    issues?: Array<{ pageNumber: number; detail: string; severity: string }>;
  };
  const issues = preflight.issues ?? [];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl text-ink-700">{book.title}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-300">
            {book.pageCount ? <span>{book.pageCount} pages</span> : null}
            {book.status === "rendered" ? (
              <Badge tone="success">Print-ready</Badge>
            ) : book.status === "generating" ? (
              <Badge tone="accent">Compiling…</Badge>
            ) : null}
          </div>
        </div>
        {isParent && (book.status === "ready" || book.status === "rendered") ? (
          <RenderBookButton bookId={book.id} />
        ) : null}
      </header>

      {issues.length > 0 ? (
        <div className="lc-card border-blush-300 p-5 space-y-2">
          <p className="font-medium text-ink-700">Before printing</p>
          {issues.slice(0, 6).map((issue, i) => (
            <p key={i} className="text-sm text-ink-500">
              Page {issue.pageNumber}: {issue.detail}
              {issue.severity === "error" ? " — please swap this photo" : ""}
            </p>
          ))}
        </div>
      ) : null}

      {products.length > 0 ? (
        <section className="lc-card p-6">
          <SectionHeading
            title="Order the printed book"
            subtitle="A real book for the shelf — QR-linked video memories included."
            className="mb-4"
          />
          <OrderForm bookId={book.id} products={products} />
        </section>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {book.pages.map((page) => (
          <div key={page.id} className="space-y-1.5">
            <div className="lc-card aspect-square relative overflow-hidden p-3">
              {/* fractional layout preview */}
              {page.elements.map((el) => (
                <div
                  key={`f-${el.id}`}
                  className="absolute"
                  style={{
                    left: `${(el.frame.x ?? 0) * 100}%`,
                    top: `${(el.frame.y ?? 0) * 100}%`,
                    width: `${(el.frame.w ?? 0) * 100}%`,
                    height: `${(el.frame.h ?? 0) * 100}%`,
                  }}
                >
                  {el.type === "photo" && el.mediaId ? (
                    <MediaImage mediaId={el.mediaId} alt="" className="h-full w-full" />
                  ) : el.type === "text" ? (
                    <p className="text-[7px] sm:text-[9px] leading-tight text-ink-600 overflow-hidden font-display">
                      {String(el.props["text"] ?? "")}
                    </p>
                  ) : el.type === "qr" ? (
                    <div className="h-full w-full grid place-items-center text-ink-400">
                      <QrCode size={20} aria-label="QR-linked video memory" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-ink-300">Page {page.pageNumber}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
