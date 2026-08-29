import { z } from "zod";
import type { AiTask } from "@/server/ai/types";
import { UNTRUSTED_RULES, untrusted } from "@/server/ai/untrusted";
import { checkGrounding } from "@/server/ai/grounding";

/** ── rewriteMemory ─────────────────────────────────────────────────────────
 * Parent's raw note → keepsake version. The original is always preserved in
 * memory_versions; this draft requires explicit acceptance.
 */
export interface RewriteMemoryInput {
  childName: string;
  childPronouns: string | null;
  ageText: string; // "6 months, 12 days"
  originalText: string;
}

const rewriteOutput = z.object({
  keepsakeText: z.string().min(1).max(2000),
  suggestedTitle: z.string().min(1).max(120),
});

export const rewriteMemoryTask: AiTask<RewriteMemoryInput, z.infer<typeof rewriteOutput>> = {
  name: "memory.rewrite",
  temperature: 0.7,
  maxTokens: 700,
  buildPrompt: (input) => ({
    system: `You help a parent turn a quick note into a short keepsake paragraph written to their child ("you"), to be read years from now. Keep it to 1–3 sentences, intimate and specific. Use only what the note says — no invented details, no added feelings the parent didn't express, no assumptions about who was present.\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}${input.childPronouns ? ` (${input.childPronouns})` : ""}, currently ${input.ageText} old.`,
      untrusted("parent note", input.originalText),
      `Write the keepsake version and a short title.`,
    ].join("\n\n"),
  }),
  outputSchema: rewriteOutput,
  validateGrounding: (input, output) =>
    checkGrounding(
      `${input.childName} ${input.ageText} ${input.originalText}`,
      `${output.keepsakeText} ${output.suggestedTitle}`
    ),
  fallback: (input) => ({
    // no model: preserve the parent's words directly
    keepsakeText: input.originalText.trim(),
    suggestedTitle: input.originalText.trim().split(/[.!?\n]/)[0]?.slice(0, 80) || "A little moment",
  }),
};

/** ── caption ───────────────────────────────────────────────────────────────
 * Short tasteful caption for a photo/video from confirmed context only.
 */
export interface CaptionInput {
  childName: string;
  ageText: string;
  memoryContext: string; // confirmed memory text / user caption notes
  mediaKind: "photo" | "video";
}

const captionOutput = z.object({
  caption: z.string().min(1).max(200),
});

export const captionTask: AiTask<CaptionInput, z.infer<typeof captionOutput>> = {
  name: "media.caption",
  temperature: 0.6,
  maxTokens: 200,
  buildPrompt: (input) => ({
    system: `You write one short caption (under 15 words) for a family ${input.mediaKind} in a childhood keepsake book. Quiet, warm, specific. No exclamation marks, no emoji, no invented details.\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}, ${input.ageText} old at the time.`,
      untrusted("what the parent wrote about this moment", input.memoryContext),
      "Write the caption.",
    ].join("\n\n"),
  }),
  outputSchema: captionOutput,
  validateGrounding: (input, output) =>
    checkGrounding(
      `${input.childName} ${input.ageText} ${input.memoryContext}`,
      output.caption
    ),
  fallback: (input) => ({
    caption:
      input.memoryContext.trim().split(/[.!?\n]/)[0]?.slice(0, 90) ||
      `${input.childName}, ${input.ageText}`,
  }),
};

/** ── titles ────────────────────────────────────────────────────────────────
 * Title options for chapters, books, recaps.
 */
export interface TitlesInput {
  kind: "chapter" | "book" | "recap" | "storybook";
  childName: string;
  ageTitle: string; // "Six Months"
  themeHints: string; // confirmed highlights, comma separated
}

const titlesOutput = z.object({
  titles: z.array(z.string().min(1).max(80)).min(3).max(6),
});

export const titlesTask: AiTask<TitlesInput, z.infer<typeof titlesOutput>> = {
  name: "titles.generate",
  temperature: 0.9,
  maxTokens: 300,
  buildPrompt: (input) => ({
    system: `You propose short, elegant ${input.kind} titles for a family keepsake. 2–6 words each. No puns, no clichés ("precious moments", "tiny toes"), nothing generic. Ground them in the provided moments.\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}. Period: ${input.ageTitle}.`,
      untrusted("highlights from this period", input.themeHints),
      "Propose 4 title options.",
    ].join("\n\n"),
  }),
  outputSchema: titlesOutput,
  fallback: (input) => ({
    titles: [
      `${input.childName} — ${input.ageTitle}`,
      `${input.ageTitle}`,
      `${input.childName}'s ${input.ageTitle}`,
    ],
  }),
};
