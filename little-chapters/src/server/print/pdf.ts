import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { mmToPoints, parseTrimSize, spineWidthMm } from "@/server/print/preflight";

/**
 * Print-ready PDF rendering (worker-only).
 *
 * Interior: trim + bleed page boxes, image frames, text blocks, QR codes.
 * Cover: front/spine/back spread with computed spine width.
 * Images arrive as JPEG buffers prepared by the render job at print
 * resolution from the untouched originals.
 */

export interface PdfPageElement {
  type: "photo" | "text" | "caption" | "qr" | "decoration";
  /** frame in page fractions (0..1) of the TRIM box */
  frame: { x: number; y: number; w: number; h: number };
  image?: Buffer;               // photo
  text?: string;                // text/caption
  qrToken?: string;             // qr → renders code + "Watch this memory"
  fontRole?: "display" | "body" | "caption";
  align?: "left" | "center" | "right";
}

export interface PdfPage {
  elements: PdfPageElement[];
}

export interface PdfTheme {
  bg: string;      // page background hex
  ink: string;     // text hex
  accent: string;  // accent hex
}

export interface RenderOptions {
  trimSize: string;   // "210x210" mm
  bleedMm: number;
  theme: PdfTheme;
  appUrl: string;
}

const FONT_SIZES = { display: 28, body: 11.5, caption: 9 } as const;

export async function renderInteriorPdf(
  pages: PdfPage[],
  opts: RenderOptions
): Promise<Buffer> {
  const { widthMm, heightMm } = parseTrimSize(opts.trimSize);
  const pageW = mmToPoints(widthMm + 2 * opts.bleedMm);
  const pageH = mmToPoints(heightMm + 2 * opts.bleedMm);
  const bleed = mmToPoints(opts.bleedMm);
  const trimW = mmToPoints(widthMm);
  const trimH = mmToPoints(heightMm);

  const doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  for (const page of pages) {
    doc.addPage({ size: [pageW, pageH], margin: 0 });
    doc.rect(0, 0, pageW, pageH).fill(opts.theme.bg);

    for (const el of page.elements) {
      const x = bleed + el.frame.x * trimW;
      const y = bleed + el.frame.y * trimH;
      const w = el.frame.w * trimW;
      const h = el.frame.h * trimH;

      if (el.type === "photo" && el.image) {
        doc.save();
        doc.rect(x, y, w, h).clip();
        doc.image(el.image, x, y, { cover: [w, h], align: "center", valign: "center" });
        doc.restore();
      } else if ((el.type === "text" || el.type === "caption") && el.text) {
        const role = el.fontRole ?? (el.type === "caption" ? "caption" : "body");
        doc
          .font(role === "display" ? "Times-Roman" : "Helvetica")
          .fontSize(FONT_SIZES[role])
          .fillColor(role === "caption" ? opts.theme.accent : opts.theme.ink)
          .text(el.text, x, y, { width: w, height: h, align: el.align ?? "left" });
      } else if (el.type === "qr" && el.qrToken) {
        const url = `${opts.appUrl}/m/${el.qrToken}`;
        const size = Math.min(w, h) * 0.72;
        const png = await QRCode.toBuffer(url, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 600,
          color: { dark: opts.theme.ink, light: "#0000" },
        });
        doc.image(png, x + (w - size) / 2, y, { width: size, height: size });
        doc
          .font("Helvetica")
          .fontSize(FONT_SIZES.caption)
          .fillColor(opts.theme.accent)
          .text("Watch this memory", x, y + size + 6, { width: w, align: "center" });
      }
    }
  }

  doc.end();
  return done;
}

export async function renderCoverPdf(opts: {
  trimSize: string;
  bleedMm: number;
  pageCount: number;
  productKind: "hardcover" | "softcover" | "layflat" | "mini" | "milestone_cards" | "prints";
  theme: PdfTheme;
  title: string;
  subtitle: string | null;
  coverImage: Buffer | null;
}): Promise<Buffer> {
  const { widthMm, heightMm } = parseTrimSize(opts.trimSize);
  const spineMm = spineWidthMm(opts.pageCount, opts.productKind);
  const spreadW = mmToPoints(widthMm * 2 + spineMm + 2 * opts.bleedMm);
  const spreadH = mmToPoints(heightMm + 2 * opts.bleedMm);
  const bleed = mmToPoints(opts.bleedMm);
  const trimW = mmToPoints(widthMm);
  const trimH = mmToPoints(heightMm);
  const spine = mmToPoints(spineMm);

  const doc = new PDFDocument({ size: [spreadW, spreadH], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  doc.rect(0, 0, spreadW, spreadH).fill(opts.theme.bg);

  // front cover = right panel of the spread
  const frontX = bleed + trimW + spine;
  if (opts.coverImage) {
    const imgW = trimW * 0.72;
    const imgH = trimH * 0.55;
    const imgX = frontX + (trimW - imgW) / 2;
    const imgY = bleed + trimH * 0.14;
    doc.save();
    doc.rect(imgX, imgY, imgW, imgH).clip();
    doc.image(opts.coverImage, imgX, imgY, { cover: [imgW, imgH], align: "center", valign: "center" });
    doc.restore();
  }
  doc
    .font("Times-Roman")
    .fontSize(26)
    .fillColor(opts.theme.ink)
    .text(opts.title, frontX + trimW * 0.1, bleed + trimH * 0.76, {
      width: trimW * 0.8,
      align: "center",
    });
  if (opts.subtitle) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(opts.theme.accent)
      .text(opts.subtitle, frontX + trimW * 0.1, bleed + trimH * 0.85, {
        width: trimW * 0.8,
        align: "center",
      });
  }

  // spine text (rotated) when the spine is wide enough
  if (spineMm >= 5) {
    doc.save();
    doc.rotate(90, { origin: [bleed + trimW + spine / 2, spreadH / 2] });
    doc
      .font("Times-Roman")
      .fontSize(Math.min(12, spine * 0.5))
      .fillColor(opts.theme.ink)
      .text(opts.title, bleed + trimW + spine / 2 - trimH / 2, spreadH / 2 - spine / 4, {
        width: trimH,
        align: "center",
      });
    doc.restore();
  }

  doc.end();
  return done;
}
