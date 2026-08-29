import { describe, expect, it } from "vitest";
import {
  clusterByEvent,
  collapseBursts,
  selectBest,
  type SelectableMedia,
} from "@/server/media/selection";

function item(overrides: Partial<SelectableMedia>): SelectableMedia {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "photo",
    capturedAt: new Date("2026-08-10T10:00:00Z"),
    phash: null,
    qualityScore: 0.5,
    relevance: 0.5,
    isFavorite: false,
    hasMemoryContext: false,
    ...overrides,
  };
}

describe("event clustering", () => {
  it("splits by 90-minute gaps", () => {
    const items = [
      item({ capturedAt: new Date("2026-08-10T10:00:00Z") }),
      item({ capturedAt: new Date("2026-08-10T10:30:00Z") }),
      item({ capturedAt: new Date("2026-08-10T15:00:00Z") }),
    ];
    const clusters = clusterByEvent(items);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.items).toHaveLength(2);
  });

  it("puts undated media in its own cluster", () => {
    const clusters = clusterByEvent([item({}), item({ capturedAt: null })]);
    expect(clusters).toHaveLength(2);
  });
});

describe("burst collapsing", () => {
  it("groups near-duplicate hashes and keeps the strongest first", () => {
    const a = item({ phash: "0000000000000000", qualityScore: 0.4 });
    const b = item({ phash: "0000000000000003", qualityScore: 0.9 }); // distance 2
    const c = item({ phash: "ffffffffffffffff", qualityScore: 0.5 }); // far away
    const groups = collapseBursts([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups[0]![0]!.id).toBe(b.id);
  });
});

describe("selection", () => {
  it("avoids picking many near-identical photos", () => {
    const burst = Array.from({ length: 12 }, (_, i) =>
      item({
        id: `burst-${i}`,
        phash: `000000000000000${i % 2}`,
        capturedAt: new Date(`2026-08-10T10:0${i % 6}:00Z`),
      })
    );
    const other = item({
      id: "different",
      phash: "ffffffffffffffff",
      capturedAt: new Date("2026-08-20T10:00:00Z"),
    });
    const result = selectBest([...burst, other], 5);
    expect(result.selected).toContain("different");
    // at most 2 from the burst group
    const burstPicked = result.selected.filter((id) => id.startsWith("burst-"));
    expect(burstPicked.length).toBeLessThanOrEqual(2);
    expect(result.duplicatesCollapsed).toBeGreaterThan(0);
  });

  it("spreads picks across the month's events", () => {
    const week1 = Array.from({ length: 5 }, (_, i) =>
      item({ id: `w1-${i}`, phash: `a00000000000000${i}`, capturedAt: new Date(`2026-08-0${i + 1}T10:00:00Z`) })
    );
    const week4 = Array.from({ length: 5 }, (_, i) =>
      item({ id: `w4-${i}`, phash: `f0000000000000f${i}`, capturedAt: new Date(`2026-08-2${i + 1}T10:00:00Z`) })
    );
    const result = selectBest([...week1, ...week4], 6);
    expect(result.selected.some((id) => id.startsWith("w1-"))).toBe(true);
    expect(result.selected.some((id) => id.startsWith("w4-"))).toBe(true);
  });

  it("returns chronological order", () => {
    const items = [
      item({ id: "late", capturedAt: new Date("2026-08-25T10:00:00Z"), phash: "f000000000000000" }),
      item({ id: "early", capturedAt: new Date("2026-08-01T10:00:00Z"), phash: "0f00000000000000" }),
    ];
    const result = selectBest(items, 2);
    expect(result.selected).toEqual(["early", "late"]);
  });
});
