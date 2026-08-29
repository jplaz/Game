/**
 * Print preflight: geometry and resolution validation. Pure and testable.
 */

export interface TrimSpec {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeZoneMm: number;
  targetDpi: number;
  minDpi: number;
}

export function parseTrimSize(trim: string): { widthMm: number; heightMm: number } {
  const match = trim.match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error(`Invalid trim size: ${trim}`);
  return { widthMm: Number(match[1]), heightMm: Number(match[2]) };
}

export const MM_PER_INCH = 25.4;
export const PDF_POINTS_PER_INCH = 72;

export function mmToPoints(mm: number): number {
  return (mm / MM_PER_INCH) * PDF_POINTS_PER_INCH;
}

/** Effective DPI of an image placed into a physical frame. */
export function effectiveDpi(
  pixelWidth: number,
  pixelHeight: number,
  frameWidthMm: number,
  frameHeightMm: number
): number {
  const dpiX = pixelWidth / (frameWidthMm / MM_PER_INCH);
  const dpiY = pixelHeight / (frameHeightMm / MM_PER_INCH);
  return Math.min(dpiX, dpiY);
}

export type DpiVerdict = "ok" | "acceptable" | "too_low";

export function dpiVerdict(dpi: number, spec: TrimSpec): DpiVerdict {
  if (dpi >= spec.targetDpi) return "ok";
  if (dpi >= spec.minDpi) return "acceptable";
  return "too_low";
}

/**
 * Spine width from page count and paper. Standard 130 gsm coated interior:
 * ~0.0055 in/sheet (2 pages per sheet) + cover board allowance for hardcovers.
 */
export function spineWidthMm(pageCount: number, kind: "hardcover" | "softcover" | "layflat" | "mini" | "milestone_cards" | "prints"): number {
  const sheets = Math.ceil(pageCount / 2);
  const blockMm = sheets * 0.0055 * MM_PER_INCH;
  const boardMm = kind === "hardcover" || kind === "layflat" ? 4 : 0;
  return Math.max(blockMm + boardMm, kind === "hardcover" ? 6 : 1.5);
}

export interface PreflightIssue {
  pageNumber: number;
  elementId: string;
  issue: "low_dpi" | "outside_safe_zone";
  detail: string;
  severity: "warning" | "error";
}

export interface PreflightReport {
  ok: boolean;
  pageCount: number;
  spineMm: number;
  issues: PreflightIssue[];
}

export interface PreflightElement {
  id: string;
  pageNumber: number;
  type: string;
  /** frame in page fractions 0..1 */
  frame: { x: number; y: number; w: number; h: number };
  imagePixels?: { width: number; height: number } | null;
}

export function runPreflight(
  elements: PreflightElement[],
  pageCount: number,
  spec: TrimSpec,
  productKind: "hardcover" | "softcover" | "layflat" | "mini" | "milestone_cards" | "prints",
  pageLimits: { min: number; max: number }
): PreflightReport {
  const issues: PreflightIssue[] = [];
  const safeFraction = {
    x: spec.safeZoneMm / spec.widthMm,
    y: spec.safeZoneMm / spec.heightMm,
  };

  for (const el of elements) {
    if (el.type === "photo" && el.imagePixels) {
      const frameWmm = el.frame.w * spec.widthMm;
      const frameHmm = el.frame.h * spec.heightMm;
      const dpi = effectiveDpi(el.imagePixels.width, el.imagePixels.height, frameWmm, frameHmm);
      const verdict = dpiVerdict(dpi, spec);
      if (verdict !== "ok") {
        issues.push({
          pageNumber: el.pageNumber,
          elementId: el.id,
          issue: "low_dpi",
          detail: `~${Math.round(dpi)} DPI at this size (target ${spec.targetDpi})`,
          severity: verdict === "too_low" ? "error" : "warning",
        });
      }
    }
    if (el.type === "text" || el.type === "caption" || el.type === "qr") {
      const inset =
        el.frame.x < safeFraction.x ||
        el.frame.y < safeFraction.y ||
        el.frame.x + el.frame.w > 1 - safeFraction.x ||
        el.frame.y + el.frame.h > 1 - safeFraction.y;
      if (inset) {
        issues.push({
          pageNumber: el.pageNumber,
          elementId: el.id,
          issue: "outside_safe_zone",
          detail: "This element sits inside the trim safe zone and may be cut",
          severity: "warning",
        });
      }
    }
  }

  const pageCountOk = pageCount >= pageLimits.min && pageCount <= pageLimits.max;
  return {
    ok: pageCountOk && !issues.some((i) => i.severity === "error"),
    pageCount,
    spineMm: spineWidthMm(pageCount, productKind),
    issues,
  };
}
