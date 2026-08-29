import { describe, expect, it } from "vitest";
import { captionTask, rewriteMemoryTask, titlesTask } from "@/server/ai/tasks/writing";
import { monthlyNarrativeTask, storybookTask } from "@/server/ai/tasks/narrative";
import {
  mediaRelevanceTask,
  memoryPromptsTask,
  milestoneSuggestTask,
  voiceMemoryTask,
} from "@/server/ai/tasks/suggestions";
import { searchQueryTask } from "@/server/ai/tasks/search";

/**
 * Every task's deterministic fallback must satisfy its own output schema —
 * this is what guarantees the product works end-to-end with AI_PROVIDER=null
 * and that provider outputs are validated against real, satisfiable schemas.
 */
describe("AI task fallbacks satisfy their schemas", () => {
  it("memory.rewrite", () => {
    const input = {
      childName: "Rory", childPronouns: "she/her", ageText: "6 months",
      originalText: "She laughed at the cat again today.",
    };
    const out = rewriteMemoryTask.outputSchema.parse(rewriteMemoryTask.fallback(input));
    expect(out.keepsakeText).toContain("cat");
    // fallback must be grounded by construction
    expect(rewriteMemoryTask.validateGrounding?.(input, out)).toBeNull();
  });

  it("media.caption", () => {
    const input = {
      childName: "Rory", ageText: "6 months",
      memoryContext: "First taste of avocado, very suspicious.",
      mediaKind: "photo" as const,
    };
    const out = captionTask.outputSchema.parse(captionTask.fallback(input));
    expect(out.caption.length).toBeGreaterThan(0);
  });

  it("titles.generate", () => {
    const out = titlesTask.outputSchema.parse(
      titlesTask.fallback({
        kind: "chapter", childName: "Rory", ageTitle: "Six Months", themeHints: "beach, avocado",
      })
    );
    expect(out.titles.length).toBeGreaterThanOrEqual(3);
  });

  it("chapter.narrative", () => {
    const input = {
      childName: "Rory", childPronouns: null, ageTitle: "Six Months", monthLabel: "August 2026",
      memories: [
        { date: "2026-08-03", title: "Cat", text: "You laughed at the cat until you hiccuped and the whole kitchen laughed with you.", isMilestone: false },
        { date: "2026-08-12", title: "Avocado", text: "First avocado — a long stare, then you grabbed the spoon.", isMilestone: true },
      ],
    };
    const out = monthlyNarrativeTask.outputSchema.parse(monthlyNarrativeTask.fallback(input));
    expect(out.story.length).toBeGreaterThan(50);
    expect(monthlyNarrativeTask.validateGrounding?.(input, out)).toBeNull();
  });

  it("storybook.write produces paged text", () => {
    const input = {
      childName: "Rory", title: "Rory's Beach Day", style: "realistic" as const,
      pageCount: 6,
      memories: Array.from({ length: 6 }, (_, i) => ({
        date: `2026-08-0${i + 1}`, title: null,
        text: `Something small and true happened on the sand, moment ${i + 1}.`,
        isMilestone: false,
      })),
    };
    const out = storybookTask.outputSchema.parse(storybookTask.fallback(input));
    expect(out.pages.length).toBeGreaterThanOrEqual(4);
  });

  it("milestone.suggest only suggests catalog matches, low confidence", () => {
    const input = {
      childName: "Rory", ageText: "6 months",
      memoryText: "Today she had her first food, mashed avocado.",
      catalog: [
        { slug: "first-food", title: "First food", category: "food" },
        { slug: "first-steps", title: "First steps", category: "movement" },
      ],
    };
    const out = milestoneSuggestTask.outputSchema.parse(milestoneSuggestTask.fallback(input));
    expect(out.suggestions.length).toBeLessThanOrEqual(2);
    for (const s of out.suggestions) {
      expect(s.confidence).toBe("low");
      expect(["first-food"]).toContain(s.catalogSlug);
    }
  });

  it("voice.keepsake preserves the parent's words", () => {
    const input = {
      childName: "Rory", ageText: "6 months",
      transcript: "she sat up by herself for thirty seconds today",
    };
    const out = voiceMemoryTask.outputSchema.parse(voiceMemoryTask.fallback(input));
    expect(out.keepsakeText).toBe(input.transcript);
  });

  it("prompts.generate stays gentle and non-empty", () => {
    const out = memoryPromptsTask.outputSchema.parse(
      memoryPromptsTask.fallback({
        childName: "Rory", ageText: "6 months", season: "summer",
        recentMemoryTitles: [], missingSections: ["growth"],
      })
    );
    expect(out.prompts.length).toBeGreaterThanOrEqual(2);
    for (const p of out.prompts) expect(p).not.toMatch(/should/i);
  });

  it("media.relevance scores every item in range", () => {
    const input = {
      items: [
        { id: "a", kind: "photo" as const, caption: null, memoryContext: "beach day", qualityScore: 0.8 },
        { id: "b", kind: "video" as const, caption: null, memoryContext: null, qualityScore: 0.2 },
      ],
    };
    const out = mediaRelevanceTask.outputSchema.parse(mediaRelevanceTask.fallback(input));
    expect(out.scores.map((s) => s.id).sort()).toEqual(["a", "b"]);
    for (const s of out.scores) {
      expect(s.relevance).toBeGreaterThanOrEqual(0);
      expect(s.relevance).toBeLessThanOrEqual(1);
    }
    const a = out.scores.find((s) => s.id === "a")!;
    const b = out.scores.find((s) => s.id === "b")!;
    expect(a.relevance).toBeGreaterThan(b.relevance);
  });

  it("search.parse extracts filters deterministically", () => {
    const out = searchQueryTask.outputSchema.parse(
      searchQueryTask.fallback({
        query: "Show me videos of Rory laughing with Grandma",
        peopleNames: ["Grandma June", "Grandma"],
        today: "2026-08-29",
      })
    );
    expect(out.mediaKind).toBe("video");
    expect(out.people).toContain("Grandma");
    expect(out.textTerms).toContain("laughing");
  });
});
