import { getSql } from "@/server/db/client";
import { assertChildAccess, assertResourceAccess } from "@/server/authz";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { assertWithinLimit } from "@/server/billing/usage";
import { enqueueJob } from "@/server/jobs/queue";
import { createQrMemory } from "@/server/domain/qr";
import type { ChapterSectionContent } from "@/server/domain/chapters";
import { chapterAgeTitle, computeAge } from "@/lib/age";
import { formatMonth } from "@/lib/format";

/**
 * Books: first-year, birthday/annual (ages 0–18), monthly, grandparent,
 * storybook. Compilation turns chapters/memories into book_pages +
 * page_elements; rendering (worker) produces print-ready PDFs; everything
 * stays editable in the book editor.
 */

type BookKind = "monthly" | "first_year" | "birthday" | "storybook" | "grandparent" | "milestone_cards" | "custom";

export async function createBook(opts: {
  userId: string;
  childId: string;
  kind: BookKind;
  title?: string;
  yearNumber?: number | null;   // for birthday books: age at the birthday
  themeId?: string;
}): Promise<{ bookId: string; jobId: string | null }> {
  const ctx = await assertChildAccess(opts.userId, opts.childId, "parent");
  await assertWithinLimit(ctx.familyId, "books", 1, "books");
  const sql = getSql();

  const childRows = await sql<
    { full_name: string; nickname: string | null; birth_date: string | null }[]
  >`
    select full_name, nickname, birth_date::text as birth_date
    from children where id = ${opts.childId}
  `;
  const child = childRows[0]!;
  const displayName = child.nickname || child.full_name.split(" ")[0] || child.full_name;

  let title = opts.title?.trim();
  if (!title) {
    if (opts.kind === "first_year") title = `${displayName}: Year One`;
    else if (opts.kind === "birthday" && opts.yearNumber) {
      title = `${displayName}: Year ${opts.yearNumber}`;
    } else if (opts.kind === "grandparent") title = `For Grandma & Grandpa`;
    else title = `${displayName}'s Book`;
  }

  const rows = await sql<{ id: string }[]>`
    insert into books (family_id, child_id, kind, title, theme_id, year_number, status)
    values (${ctx.familyId}, ${opts.childId}, ${opts.kind}, ${title},
            ${opts.themeId ?? "heirloom"}, ${opts.yearNumber ?? null}, 'generating')
    returning id
  `;
  const bookId = rows[0]!.id;
  const jobId = await enqueueJob({
    type: "book.compile",
    familyId: ctx.familyId,
    payload: { bookId },
    idempotencyKey: `book-compile:${bookId}`,
    priority: 3,
  });
  return { bookId, jobId };
}

/**
 * Compile a book's pages from its child's chapters (worker job).
 * First-year: welcome, pregnancy/birth stories, one spread per month chapter,
 * milestones, growth, letters. Birthday: the year's chapters + highlights.
 */
export async function compileBook(bookId: string): Promise<void> {
  const sql = getSql();
  const bookRows = await sql<
    { id: string; family_id: string; child_id: string; kind: BookKind;
      title: string; year_number: number | null; created_by_user: string | null }[]
  >`
    select b.id, b.family_id, b.child_id, b.kind, b.title, b.year_number,
      (select fm.user_id from family_members fm
        where fm.family_id = b.family_id and fm.role in ('owner','parent')
        order by fm.joined_at limit 1) as created_by_user
    from books b where b.id = ${bookId} and b.deleted_at is null
  `;
  const book = bookRows[0];
  if (!book) throw new Error("book missing");

  const childRows = await sql<
    { full_name: string; nickname: string | null; birth_date: string | null;
      pregnancy_story: string | null; birth_story: string | null }[]
  >`
    select full_name, nickname, birth_date::text as birth_date, pregnancy_story, birth_story
    from children where id = ${book.child_id}
  `;
  const child = childRows[0]!;
  const displayName = child.nickname || child.full_name.split(" ")[0] || child.full_name;
  const birthDate = child.birth_date ? new Date(`${child.birth_date}T00:00:00`) : null;

  // period covered
  let periodFilter = sql`true`;
  if (book.kind === "first_year" && child.birth_date) {
    periodFilter = sql`c.period_start >= ${child.birth_date}::date
      and c.period_start < ${child.birth_date}::date + interval '1 year'`;
  } else if (book.kind === "birthday" && book.year_number && child.birth_date) {
    periodFilter = sql`c.period_start >= ${child.birth_date}::date + make_interval(years => ${book.year_number - 1})
      and c.period_start < ${child.birth_date}::date + make_interval(years => ${book.year_number})`;
  }

  const chapters = await sql<
    { id: string; title: string; period_start: string; cover_media_id: string | null }[]
  >`
    select c.id, c.title, c.period_start::text as period_start, c.cover_media_id
    from chapters c
    where c.child_id = ${book.child_id} and c.deleted_at is null and c.status = 'ready'
      and ${periodFilter}
    order by c.period_start
  `;

  // wipe previous auto-compiled pages and rebuild
  await sql`delete from book_pages where book_id = ${bookId}`;

  let pageNumber = 0;
  const addPage = async (
    layout: string,
    chapterId: string | null,
    elements: Array<{
      type: string; mediaId?: string | null; qrMemoryId?: string | null;
      frame: Record<string, number>; props: Record<string, unknown>;
    }>
  ) => {
    pageNumber += 1;
    const pageRows = await sql<{ id: string }[]>`
      insert into book_pages (book_id, page_number, layout, chapter_id)
      values (${bookId}, ${pageNumber}, ${layout}, ${chapterId})
      returning id
    `;
    const pageId = pageRows[0]!.id;
    for (const [i, el] of elements.entries()) {
      await sql`
        insert into page_elements (page_id, element_type, media_id, qr_memory_id, frame, props, sort_order)
        values (${pageId}, ${el.type}, ${el.mediaId ?? null}, ${el.qrMemoryId ?? null},
                ${sql.json(el.frame as never)}, ${sql.json(el.props as never)}, ${i})
      `;
    }
  };

  // title page
  await addPage("title", null, [
    { type: "text", frame: { x: 0.1, y: 0.38, w: 0.8, h: 0.12 },
      props: { text: book.title, fontRole: "display", align: "center" } },
    { type: "text", frame: { x: 0.1, y: 0.52, w: 0.8, h: 0.06 },
      props: { text: child.full_name, fontRole: "caption", align: "center" } },
  ]);

  // pregnancy / birth story pages for first-year books
  if (book.kind === "first_year") {
    if (child.pregnancy_story) {
      await addPage("story", null, [
        { type: "text", frame: { x: 0.12, y: 0.1, w: 0.76, h: 0.08 },
          props: { text: "Before You Arrived", fontRole: "display", align: "center" } },
        { type: "text", frame: { x: 0.12, y: 0.22, w: 0.76, h: 0.68 },
          props: { text: child.pregnancy_story, fontRole: "body" } },
      ]);
    }
    if (child.birth_story) {
      await addPage("story", null, [
        { type: "text", frame: { x: 0.12, y: 0.1, w: 0.76, h: 0.08 },
          props: { text: "The Day You Were Born", fontRole: "display", align: "center" } },
        { type: "text", frame: { x: 0.12, y: 0.22, w: 0.76, h: 0.68 },
          props: { text: child.birth_story, fontRole: "body" } },
      ]);
    }
  }

  // per-chapter spreads
  for (const chapter of chapters) {
    const sections = await sql<
      { section_type: string; title: string | null; content: ChapterSectionContent }[]
    >`
      select section_type, title, content from chapter_sections
      where chapter_id = ${chapter.id} and hidden = false
      order by sort_order
    `;
    const story = sections.find((s) => s.section_type === "story");
    const collage = sections.find((s) => s.section_type === "collage");
    const favoriteVideo = sections.find((s) => s.section_type === "favorite_video");
    const milestones = sections.find((s) => s.section_type === "milestones");

    const ageLabel = birthDate
      ? chapterAgeTitle(
          computeAge(birthDate, new Date(`${chapter.period_start}T00:00:00`)).totalMonths
        )
      : formatMonth(chapter.period_start);

    // chapter opener: cover photo + age title
    await addPage("chapter-open", chapter.id, [
      ...(chapter.cover_media_id
        ? [{ type: "photo", mediaId: chapter.cover_media_id,
             frame: { x: 0.08, y: 0.08, w: 0.84, h: 0.56 }, props: {} }]
        : []),
      { type: "text", frame: { x: 0.1, y: 0.7, w: 0.8, h: 0.1 },
        props: { text: ageLabel, fontRole: "display", align: "center" } },
      { type: "text", frame: { x: 0.1, y: 0.82, w: 0.8, h: 0.05 },
        props: { text: formatMonth(chapter.period_start), fontRole: "caption", align: "center" } },
    ]);

    // story + milestones
    if (story?.content.text || (milestones?.content.items?.length ?? 0) > 0) {
      await addPage("chapter-story", chapter.id, [
        ...(story?.content.text
          ? [{ type: "text", frame: { x: 0.12, y: 0.1, w: 0.76, h: 0.55 },
               props: { text: story.content.text, fontRole: "body" } }]
          : []),
        ...((milestones?.content.items?.length ?? 0) > 0
          ? [{ type: "text", frame: { x: 0.12, y: 0.7, w: 0.76, h: 0.22 },
               props: {
                 text: `Milestones\n${(milestones!.content.items ?? [])
                   .map((i) => `• ${i.label}`).join("\n")}`,
                 fontRole: "caption",
               } }]
          : []),
      ]);
    }

    // photo collage pages (4 per page)
    const mediaIds = collage?.content.mediaIds ?? [];
    for (let i = 0; i < mediaIds.length; i += 4) {
      const batch = mediaIds.slice(i, i + 4);
      const frames = [
        { x: 0.06, y: 0.06, w: 0.42, h: 0.42 },
        { x: 0.52, y: 0.06, w: 0.42, h: 0.42 },
        { x: 0.06, y: 0.52, w: 0.42, h: 0.42 },
        { x: 0.52, y: 0.52, w: 0.42, h: 0.42 },
      ];
      await addPage("collage", chapter.id,
        batch.map((mediaId, j) => ({
          type: "photo", mediaId, frame: frames[j]!, props: {},
        }))
      );
    }

    // QR video page — the signature feature
    const videoId = favoriteVideo?.content.mediaIds?.[0];
    if (videoId && book.created_by_user) {
      const qr = await createQrMemory({
        userId: book.created_by_user,
        mediaId: videoId,
        title: `${displayName} — ${ageLabel}`,
      });
      await addPage("qr-memory", chapter.id, [
        { type: "photo", mediaId: videoId,
          frame: { x: 0.1, y: 0.08, w: 0.8, h: 0.5 }, props: { usePoster: true } },
        { type: "text", frame: { x: 0.1, y: 0.62, w: 0.8, h: 0.07 },
          props: { text: favoriteVideo?.title ?? "A Moment Worth Watching Again",
                   fontRole: "display", align: "center" } },
        { type: "qr", qrMemoryId: qr.qrMemoryId,
          frame: { x: 0.38, y: 0.72, w: 0.24, h: 0.2 }, props: {} },
      ]);
    }
  }

  // even page count for printing
  if (pageNumber % 2 === 1) {
    await addPage("blank", null, []);
  }

  await sql`
    update books set status = 'ready', page_count = ${pageNumber}
    where id = ${bookId}
  `;
}

export async function requestBookRender(opts: {
  userId: string;
  bookId: string;
  productId?: string;
}): Promise<{ jobId: string | null }> {
  const ctx = await assertResourceAccess(opts.userId, "books", opts.bookId, "parent");
  const sql = getSql();
  const book = await sql<{ status: string }[]>`
    select status from books where id = ${opts.bookId}
  `;
  if (!book[0]) throw new NotFoundError("Book");
  if (book[0].status === "generating") {
    throw new ConflictError("The book is still being put together");
  }
  const jobId = await enqueueJob({
    type: "book.render",
    familyId: ctx.familyId,
    payload: { bookId: opts.bookId, productId: opts.productId ?? "hardcover-210sq" },
    idempotencyKey: `book-render:${opts.bookId}`,
    priority: 4,
  });
  await sql`update books set status = 'rendering' where id = ${opts.bookId}`;
  return { jobId };
}

export interface BookView {
  id: string;
  childId: string;
  familyId: string;
  kind: string;
  title: string;
  status: string;
  themeId: string;
  pageCount: number | null;
  preflight: Record<string, unknown>;
  hasInteriorPdf: boolean;
  pages: Array<{
    id: string;
    pageNumber: number;
    layout: string;
    elements: Array<{
      id: string;
      type: string;
      mediaId: string | null;
      qrMemoryId: string | null;
      frame: Record<string, number>;
      props: Record<string, unknown>;
    }>;
  }>;
}

export async function getBook(userId: string, bookId: string): Promise<BookView> {
  await assertResourceAccess(userId, "books", bookId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; child_id: string; family_id: string; kind: string; title: string;
      status: string; theme_id: string; page_count: number | null;
      preflight: Record<string, unknown>; interior_pdf_object_id: string | null }[]
  >`
    select id, child_id, family_id, kind, title, status, theme_id, page_count,
           preflight, interior_pdf_object_id
    from books where id = ${bookId} and deleted_at is null
  `;
  const book = rows[0];
  if (!book) throw new NotFoundError("Book");
  const pages = await sql<
    { id: string; page_number: number; layout: string }[]
  >`
    select id, page_number, layout from book_pages
    where book_id = ${bookId} order by page_number
  `;
  const elements = await sql<
    { id: string; page_id: string; element_type: string; media_id: string | null;
      qr_memory_id: string | null; frame: Record<string, number>;
      props: Record<string, unknown>; sort_order: number }[]
  >`
    select pe.id, pe.page_id, pe.element_type, pe.media_id, pe.qr_memory_id,
           pe.frame, pe.props, pe.sort_order
    from page_elements pe
    join book_pages bp on bp.id = pe.page_id
    where bp.book_id = ${bookId}
    order by pe.sort_order
  `;
  return {
    id: book.id,
    childId: book.child_id,
    familyId: book.family_id,
    kind: book.kind,
    title: book.title,
    status: book.status,
    themeId: book.theme_id,
    pageCount: book.page_count,
    preflight: book.preflight,
    hasInteriorPdf: Boolean(book.interior_pdf_object_id),
    pages: pages.map((p) => ({
      id: p.id,
      pageNumber: p.page_number,
      layout: p.layout,
      elements: elements
        .filter((e) => e.page_id === p.id)
        .map((e) => ({
          id: e.id, type: e.element_type, mediaId: e.media_id,
          qrMemoryId: e.qr_memory_id, frame: e.frame, props: e.props,
        })),
    })),
  };
}

export async function updatePageElement(opts: {
  userId: string;
  bookId: string;
  elementId: string;
  mediaId?: string | null;
  frame?: Record<string, number>;
  props?: Record<string, unknown>;
}): Promise<void> {
  const ctx = await assertResourceAccess(opts.userId, "books", opts.bookId, "parent");
  const sql = getSql();
  if (opts.mediaId) {
    const m = await sql`
      select 1 from media where id = ${opts.mediaId}
        and family_id = ${ctx.familyId} and deleted_at is null
    `;
    if (m.length === 0) throw new ValidationError("That media isn't available");
  }
  const result = await sql`
    update page_elements pe set
      media_id = coalesce(${opts.mediaId ?? null}, pe.media_id),
      frame = coalesce(${opts.frame ? sql.json(opts.frame as never) : null}, pe.frame),
      props = coalesce(${opts.props ? sql.json(opts.props as never) : null}, pe.props)
    from book_pages bp
    where pe.id = ${opts.elementId} and bp.id = pe.page_id and bp.book_id = ${opts.bookId}
    returning pe.id
  `;
  if (result.length === 0) throw new NotFoundError("Element");
}

export async function listBooks(
  userId: string,
  childId: string
): Promise<Array<{ id: string; kind: string; title: string; status: string;
  pageCount: number | null; createdAt: Date }>> {
  await assertChildAccess(userId, childId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; kind: string; title: string; status: string;
      page_count: number | null; created_at: Date }[]
  >`
    select id, kind, title, status, page_count, created_at
    from books where child_id = ${childId} and deleted_at is null
    order by created_at desc
  `;
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, status: r.status,
    pageCount: r.page_count, createdAt: r.created_at,
  }));
}
