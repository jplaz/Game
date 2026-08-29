import { z } from "zod";
import type { AiTask } from "@/server/ai/types";
import { UNTRUSTED_RULES, untrustedList } from "@/server/ai/untrusted";
import { checkGrounding } from "@/server/ai/grounding";

export interface ConfirmedMemoryFact {
  date: string;        // ISO date
  title: string | null;
  text: string;
  isMilestone: boolean;
}

/** ── monthlyNarrative ──────────────────────────────────────────────────────
 * The monthly story, grounded entirely in confirmed memories.
 */
export interface MonthlyNarrativeInput {
  childName: string;
  childPronouns: string | null;
  ageTitle: string;          // "Six Months"
  monthLabel: string;        // "August 2026"
  memories: ConfirmedMemoryFact[];
}

const narrativeOutput = z.object({
  story: z.string().min(50).max(4000),
  openingLine: z.string().min(5).max(300),
  lookingAhead: z.string().max(500).optional(),
});

function factsToText(input: MonthlyNarrativeInput): string {
  return [
    input.childName,
    input.ageTitle,
    input.monthLabel,
    ...input.memories.flatMap((m) => [m.date, m.title ?? "", m.text]),
  ].join("\n");
}

export const monthlyNarrativeTask: AiTask<
  MonthlyNarrativeInput,
  z.infer<typeof narrativeOutput>
> = {
  name: "chapter.narrative",
  temperature: 0.7,
  maxTokens: 1600,
  buildPrompt: (input) => ({
    system: `You write the monthly story for a child's keepsake chapter, addressed to the child ("you"), in the parent's voice, to be read years from now. 3–5 short paragraphs. Weave ONLY the confirmed memories provided — every event, person, place, and detail must come from them. Do not summarize each memory mechanically; find the feeling of the month. Do not rank or judge development. If the month is thin, write something short and honest rather than padding.\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}${input.childPronouns ? ` (${input.childPronouns})` : ""}.`,
      `Chapter: ${input.ageTitle} — ${input.monthLabel}.`,
      untrustedList(
        "confirmed memories from this month",
        input.memories.map((m) => ({
          date: m.date,
          title: m.title,
          memory: m.text,
          milestone: m.isMilestone ? "yes" : undefined,
        }))
      ),
      "Write the monthly story, an opening line for the chapter, and (optionally) one short forward-looking closing thought that invents nothing.",
    ].join("\n\n"),
  }),
  outputSchema: narrativeOutput,
  validateGrounding: (input, output) =>
    checkGrounding(
      factsToText(input),
      `${output.story} ${output.openingLine} ${output.lookingAhead ?? ""}`
    ),
  fallback: (input) => {
    const lines = input.memories
      .slice(0, 8)
      .map((m) => m.text.trim())
      .filter(Boolean);
    let story = lines.join("\n\n");
    if (story.length < 50) {
      // no model available: assemble the parent's own words, kept verbatim
      story = [
        `${input.monthLabel}, in your family's own words:`,
        ...lines,
      ].join("\n\n");
    }
    if (story.length < 50) {
      story = `${input.monthLabel} — a quiet month in ${input.childName}'s story, waiting for its memories to be written down.`;
    }
    return {
      story,
      openingLine: `${input.ageTitle} — ${input.monthLabel}.`,
    };
  },
};

/** ── storybook ─────────────────────────────────────────────────────────────
 * A warm storybook narrative from selected real memories, paged.
 */
export interface StorybookInput {
  childName: string;
  title: string;             // e.g. "Rory's First Trip to the Beach"
  style: "realistic" | "illustrated" | "playful";
  memories: ConfirmedMemoryFact[];
  pageCount: number;         // 6–16
}

const storybookOutput = z.object({
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1),
        text: z.string().min(1).max(600),
      })
    )
    .min(4)
    .max(20),
});

export const storybookTask: AiTask<StorybookInput, z.infer<typeof storybookOutput>> = {
  name: "storybook.write",
  temperature: 0.8,
  maxTokens: 2500,
  buildPrompt: (input) => ({
    system: `You write a short children's storybook about a real day, based ONLY on the confirmed memories provided. Style: ${input.style}. Second person or third person with the child's real name; gentle, rhythmic, readable aloud. Exactly ${input.pageCount} pages, 1–3 sentences per page. Real events only — no invented characters, magic, dialogue, or plot beyond what the memories describe. It should feel like the day it was.\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}. Book title: ${input.title}.`,
      untrustedList(
        "the real memories this story is built from",
        input.memories.map((m) => ({ date: m.date, title: m.title, memory: m.text }))
      ),
      `Write the ${input.pageCount} pages.`,
    ].join("\n\n"),
  }),
  outputSchema: storybookOutput,
  validateGrounding: (input, output) =>
    checkGrounding(
      [input.childName, input.title, ...input.memories.map((m) => `${m.title ?? ""} ${m.text}`)].join("\n"),
      output.pages.map((p) => p.text).join("\n")
    ),
  fallback: (input) => {
    // no model: page the parent's own sentences, verbatim
    const sentences = input.memories
      .flatMap((m) => m.text.split(/(?<=[.!?])\s+/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const targetPages = Math.min(
      Math.max(4, input.pageCount),
      Math.max(4, sentences.length)
    );
    const perPage = Math.max(1, Math.ceil(sentences.length / targetPages));
    const pages: Array<{ pageNumber: number; text: string }> = [];
    for (let i = 0; i < sentences.length && pages.length < 20; i += perPage) {
      pages.push({
        pageNumber: pages.length + 1,
        text: sentences.slice(i, i + perPage).join(" ").slice(0, 600),
      });
    }
    while (pages.length < 4) {
      pages.push({
        pageNumber: pages.length + 1,
        text: pages.length === 3 ? "The end — for now." : `${input.childName}'s day, kept exactly as it was.`,
      });
    }
    return { pages };
  },
};
