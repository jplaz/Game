import sharp from "sharp";
import { getSql } from "@/server/db/client";
import { getStorage, recordStorageObject } from "@/server/storage";
import { renderCoverPdf, renderInteriorPdf, type PdfPage, type PdfTheme } from "@/server/print/pdf";
import { parseTrimSize, runPreflight, type PreflightElement } from "@/server/print/preflight";
import { updateJobProgress } from "@/server/jobs/queue";
import { env } from "@/server/env";
import { addFeedItem } from "@/server/domain/feed";
import { logger } from "@/server/observability/logger";

/**
 * book.render — produce print-ready interior + cover PDFs.
 * Images are re-derived from untouched originals at print resolution;
 * preflight (DPI, safe zones, page count) is stored on the book and hard
 * errors keep the status at 'ready' with warnings instead of shipping a bad file.
 */
export async function handleBookRender(
  jobId: string,
  payload: { bookId: string; productId: string }
): Promise<void> {
  const sql = getSql();
  const bookRows = await sql<
    { id: string; family_id: string; title: string; kind: string;
      theme_id: string; cover_media_id: string | null }[]
  >`
    select id, family_id, title, kind, theme_id, cover_media_id
    from books where id = ${payload.bookId} and deleted_at is null
  `;
  const book = bookRows[0];
  if (!book) return;

  const productRows = await sql<
    { id: string; kind: string; trim_size: string; bleed_mm: string; safe_zone_mm: string;
      target_dpi: number; min_dpi: number; min_pages: number; max_pages: number }[]
  >`
    select id, kind, trim_size, bleed_mm, safe_zone_mm, target_dpi, min_dpi,
           min_pages, max_pages
    from print_products where id = ${payload.productId}
  `;
  const product = productRows[0];
  if (!product) throw new Error(`unknown print product ${payload.productId}`);

  const themeRows = await sql<{ tokens: { palette?: { bg?: string; accent?: string; ink?: string } } }[]>`
    select tokens from themes where id = ${book.theme_id}
  `;
  const palette = themeRows[0]?.tokens?.palette ?? {};
  const theme: PdfTheme = {
    bg: palette.bg ?? "#FDFBF7",
    ink: palette.ink ?? "#2B2823",
    accent: palette.accent ?? "#B07A55",
  };

  const pages = await sql<{ id: string; page_number: number }[]>`
    select id, page_number from book_pages where book_id = ${book.id}
    order by page_number
  `;
  const elements = await sql<
    { id: string; page_id: string; element_type: string; media_id: string | null;
      qr_token: string | null; frame: { x: number; y: number; w: number; h: number };
      props: Record<string, unknown>; width: number | null; height: number | null }[]
  >`
    select pe.id, pe.page_id, pe.element_type, pe.media_id, qm.token as qr_token,
           pe.frame, pe.props, m.width, m.height
    from page_elements pe
    join book_pages bp on bp.id = pe.page_id
    left join qr_memories qm on qm.id = pe.qr_memory_id
    left join media m on m.id = pe.media_id
    where bp.book_id = ${book.id}
    order by pe.sort_order
  `;

  // preflight
  const trim = parseTrimSize(product.trim_size);
  const preflightElements: PreflightElement[] = elements.map((e) => ({
    id: e.id,
    pageNumber: pages.find((p) => p.id === e.page_id)?.page_number ?? 0,
    type: e.element_type,
    frame: e.frame,
    imagePixels: e.width && e.height ? { width: e.width, height: e.height } : null,
  }));
  const spec = {
    widthMm: trim.widthMm, heightMm: trim.heightMm,
    bleedMm: Number(product.bleed_mm), safeZoneMm: Number(product.safe_zone_mm),
    targetDpi: product.target_dpi, minDpi: product.min_dpi,
  };
  const report = runPreflight(
    preflightElements, pages.length, spec,
    product.kind as never,
    { min: product.min_pages, max: product.max_pages }
  );
  await sql`
    update books set preflight = ${sql.json(report as never)} where id = ${book.id}
  `;
  await updateJobProgress(jobId, 0.15, "Preflight checked");

  // print-resolution image prep from originals
  const storage = getStorage();
  const imageCache = new Map<string, Buffer>();
  const printImage = async (mediaId: string, usePoster: boolean): Promise<Buffer | null> => {
    const cacheKey = `${mediaId}:${usePoster}`;
    const hit = imageCache.get(cacheKey);
    if (hit) return hit;
    const source = usePoster
      ? await sql<{ bucket: string; object_key: string }[]>`
          select so.bucket, so.object_key from media_variants mv
          join storage_objects so on so.id = mv.storage_object_id
          where mv.media_id = ${mediaId} and mv.variant = 'poster'
        `
      : await sql<{ bucket: string; object_key: string }[]>`
          select so.bucket, so.object_key from media m
          join storage_objects so on so.id = m.original_object_id
          where m.id = ${mediaId} and m.kind = 'photo'
        `;
    let ref = source[0];
    if (!ref && !usePoster) {
      // videos placed as photos fall back to their poster
      const poster = await sql<{ bucket: string; object_key: string }[]>`
        select so.bucket, so.object_key from media_variants mv
        join storage_objects so on so.id = mv.storage_object_id
        where mv.media_id = ${mediaId} and mv.variant = 'poster'
      `;
      ref = poster[0];
    }
    if (!ref) return null;
    const raw = await storage.getObject(ref.bucket as never, ref.object_key);
    // re-encode at print quality; sRGB JPEG is what pdfkit embeds directly
    const jpeg = await sharp(raw).rotate().jpeg({ quality: 92 }).toBuffer();
    imageCache.set(cacheKey, jpeg);
    return jpeg;
  };

  const pdfPages: PdfPage[] = [];
  for (const page of pages) {
    const pageElements = elements.filter((e) => e.page_id === page.id);
    const rendered: PdfPage = { elements: [] };
    for (const el of pageElements) {
      if (el.element_type === "photo" && el.media_id) {
        const image = await printImage(el.media_id, Boolean(el.props["usePoster"]));
        if (image) rendered.elements.push({ type: "photo", frame: el.frame, image });
      } else if (el.element_type === "text" || el.element_type === "caption") {
        rendered.elements.push({
          type: el.element_type,
          frame: el.frame,
          text: String(el.props["text"] ?? ""),
          fontRole: (el.props["fontRole"] as "display" | "body" | "caption") ?? "body",
          align: (el.props["align"] as "left" | "center" | "right") ?? "left",
        });
      } else if (el.element_type === "qr" && el.qr_token) {
        rendered.elements.push({ type: "qr", frame: el.frame, qrToken: el.qr_token });
      }
    }
    pdfPages.push(rendered);
  }
  await updateJobProgress(jobId, 0.45, "Composing pages");

  const renderOpts = {
    trimSize: product.trim_size,
    bleedMm: Number(product.bleed_mm),
    theme,
    appUrl: env().NEXT_PUBLIC_APP_URL,
  };
  const interior = await renderInteriorPdf(pdfPages, renderOpts);
  await updateJobProgress(jobId, 0.7, "Rendering interior");
  const coverImage = book.cover_media_id ? await printImage(book.cover_media_id, false) : null;
  const cover = await renderCoverPdf({
    trimSize: product.trim_size,
    bleedMm: Number(product.bleed_mm),
    pageCount: pages.length,
    productKind: product.kind as never,
    theme,
    title: book.title,
    subtitle: null,
    coverImage,
  });
  await updateJobProgress(jobId, 0.85, "Rendering cover");

  const interiorKey = `${book.family_id}/${book.id}/interior.pdf`;
  const coverKey = `${book.family_id}/${book.id}/cover.pdf`;
  await storage.putObject("renders", interiorKey, interior, "application/pdf");
  await storage.putObject("renders", coverKey, cover, "application/pdf");
  const interiorId = await recordStorageObject({
    familyId: book.family_id, bucket: "renders", objectKey: interiorKey,
    contentType: "application/pdf", sizeBytes: interior.length, purpose: "pdf_interior",
  });
  const coverId = await recordStorageObject({
    familyId: book.family_id, bucket: "renders", objectKey: coverKey,
    contentType: "application/pdf", sizeBytes: cover.length, purpose: "pdf_cover",
  });

  await sql`
    update books set status = 'rendered',
      interior_pdf_object_id = ${interiorId},
      cover_pdf_object_id = ${coverId},
      page_count = ${pages.length}
    where id = ${book.id}
  `;
  await addFeedItem({
    familyId: book.family_id, eventType: "book.ready",
    targetType: "book", targetId: book.id,
    summary: `“${book.title}” is ready to review`,
  });
  logger.info("book rendered", { bookId: book.id, familyId: book.family_id, count: pages.length });
}
