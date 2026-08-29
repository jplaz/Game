import { describe, expect, it } from "vitest";
import { chapterAgeTitle, computeAge, formatAge, nextAgeMilestone } from "@/lib/age";

describe("age math", () => {
  it("computes months and days", () => {
    const age = computeAge(new Date("2026-02-04"), new Date("2026-08-16"));
    expect(age.totalMonths).toBe(6);
    expect(age.months).toBe(6);
    expect(age.years).toBe(0);
    expect(age.days).toBe(12);
  });

  it("formats warm human phrasing", () => {
    expect(formatAge(computeAge(new Date("2026-02-04"), new Date("2026-08-16")))).toBe(
      "6 months, 12 days"
    );
    expect(formatAge(computeAge(new Date("2025-02-04"), new Date("2026-05-10")))).toBe(
      "1 year, 3 months"
    );
    expect(formatAge(computeAge(new Date("2026-08-08"), new Date("2026-08-16")))).toBe("8 days");
  });

  it("supports ages far beyond infancy", () => {
    const age = computeAge(new Date("2010-06-01"), new Date("2026-08-16"));
    expect(age.years).toBe(16);
    expect(formatAge(age)).toContain("16 years");
  });

  it("titles chapters", () => {
    expect(chapterAgeTitle(6)).toBe("Six Months");
    expect(chapterAgeTitle(12)).toBe("One Year");
    expect(chapterAgeTitle(27)).toBe("Two Years, Three Months");
    expect(chapterAgeTitle(0)).toBe("The Very Beginning");
  });

  it("finds the next age milestone", () => {
    const next = nextAgeMilestone(new Date("2026-02-04"), new Date("2026-08-16"));
    expect(next.label).toBe("turns 7 months old");
    expect(next.date.getMonth()).toBe(8); // September
  });

  it("never returns negative ages before birth", () => {
    const age = computeAge(new Date("2026-12-01"), new Date("2026-08-16"));
    expect(age.totalDays).toBe(0);
  });
});
