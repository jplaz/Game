import { describe, expect, it } from "vitest";
import {
  dpiVerdict,
  effectiveDpi,
  parseTrimSize,
  runPreflight,
  spineWidthMm,
  type TrimSpec,
} from "@/server/print/preflight";

const SPEC: TrimSpec = {
  widthMm: 210,
  heightMm: 210,
  bleedMm: 3,
  safeZoneMm: 6,
  targetDpi: 300,
  minDpi: 200,
};

describe("print preflight", () => {
  it("parses trim sizes", () => {
    expect(parseTrimSize("210x210")).toEqual({ widthMm: 210, heightMm: 210 });
    expect(() => parseTrimSize("weird")).toThrow();
  });

  it("computes effective DPI of a placed image", () => {
    // 2400px across 210mm ≈ 290 dpi
    const dpi = effectiveDpi(2400, 2400, 210, 210);
    expect(dpi).toBeGreaterThan(280);
    expect(dpi).toBeLessThan(300);
  });

  it("classifies DPI verdicts", () => {
    expect(dpiVerdict(320, SPEC)).toBe("ok");
    expect(dpiVerdict(240, SPEC)).toBe("acceptable");
    expect(dpiVerdict(150, SPEC)).toBe("too_low");
  });

  it("computes spine widths that grow with page count", () => {
    const thin = spineWidthMm(24, "softcover");
    const thick = spineWidthMm(200, "softcover");
    expect(thick).toBeGreaterThan(thin);
    expect(spineWidthMm(24, "hardcover")).toBeGreaterThan(thin);
  });

  it("flags low-resolution images as errors", () => {
    const report = runPreflight(
      [
        {
          id: "el1",
          pageNumber: 3,
          type: "photo",
          frame: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
          imagePixels: { width: 640, height: 480 },
        },
      ],
      24,
      SPEC,
      "hardcover",
      { min: 20, max: 200 }
    );
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.issue).toBe("low_dpi");
    expect(report.issues[0]?.severity).toBe("error");
  });

  it("warns when text sits inside the trim safe zone", () => {
    const report = runPreflight(
      [
        {
          id: "el2",
          pageNumber: 1,
          type: "text",
          frame: { x: 0.001, y: 0.4, w: 0.3, h: 0.1 },
          imagePixels: null,
        },
      ],
      24,
      SPEC,
      "softcover",
      { min: 20, max: 200 }
    );
    expect(report.ok).toBe(true); // warning, not error
    expect(report.issues[0]?.issue).toBe("outside_safe_zone");
  });

  it("fails page counts outside product limits", () => {
    const report = runPreflight([], 10, SPEC, "hardcover", { min: 20, max: 200 });
    expect(report.ok).toBe(false);
  });
});
