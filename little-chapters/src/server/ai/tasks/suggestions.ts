import { z } from "zod";
import type { AiTask } from "@/server/ai/types";
import { UNTRUSTED_RULES, untrusted, untrustedList } from "@/server/ai/untrusted";

/** ── milestoneSuggest ──────────────────────────────────────────────────────
 * Classify a memory/transcript into candidate milestones. Output is a
 * SUGGESTION — it lands as milestones.status='suggested' and never appears
 * anywhere until a parent confirms it.
 */
export interface MilestoneSuggestInput {
  childName: string;
  ageText: string;
  memoryText: string;
  catalog: Array<{ slug: string; title: string; category: string }>;
}

const milestoneSuggestOutput = z.object({
  suggestions: z
    .array(
      z.object({
        catalogSlug: z.string().nullable(),
        title: z.string().min(1).max(120),
        category: z.enum([
          "movement", "communication", "food", "sleep", "social", "travel",
          "holidays", "family", "personality", "firsts", "custom",
        ]),
        confidence: z.enum(["low", "medium", "high"]),
        reason: z.string().max(300),
      })
    )
    .max(3),
});

export const milestoneSuggestTask: AiTask<
  MilestoneSuggestInput,
  z.infer<typeof milestoneSuggestOutput>
> = {
  name: "milestone.suggest",
  temperature: 0.2,
  maxTokens: 600,
  buildPrompt: (input) => ({
    system: `You read one family memory and decide whether it plausibly describes a memorable milestone. Suggest at most 3 candidates, preferring catalog entries (use their slug) and only using a null slug for genuinely custom moments. This is memory-keeping, not assessment: no developmental judgment, no "should", no medical language. When the memory is ordinary, return an empty list — most memories are not milestones. A parent will review every suggestion; phrase reasons as "This looks like it may be…".\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}, ${input.ageText} old.`,
      untrustedList(
        "milestone catalog",
        input.catalog.map((c) => ({ slug: c.slug, title: c.title, category: c.category }))
      ),
      untrusted("the memory", input.memoryText),
      "Suggest milestone candidates (possibly none).",
    ].join("\n\n"),
  }),
  outputSchema: milestoneSuggestOutput,
  fallback: (input) => {
    // deterministic keyword matcher against the catalog (no network)
    const text = input.memoryText.toLowerCase();
    const hits = input.catalog
      .filter((c) => {
        const words = c.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.length > 0 && words.every((w) => text.includes(w.replace(/[^a-z]/g, "")));
      })
      .slice(0, 2);
    return {
      suggestions: hits.map((c) => ({
        catalogSlug: c.slug,
        title: c.title,
        category: c.category as z.infer<typeof milestoneSuggestOutput>["suggestions"][number]["category"],
        confidence: "low" as const,
        reason: `The memory mentions "${c.title.toLowerCase()}" — worth confirming.`,
      })),
    };
  },
};

/** ── voiceMemory ───────────────────────────────────────────────────────────
 * Transcript → title + keepsake draft. Milestone candidates are handled by a
 * separate milestoneSuggest call so each task stays small.
 */
export interface VoiceMemoryInput {
  childName: string;
  ageText: string;
  transcript: string;
}

const voiceMemoryOutput = z.object({
  suggestedTitle: z.string().min(1).max(120),
  keepsakeText: z.string().min(1).max(2000),
});

export const voiceMemoryTask: AiTask<VoiceMemoryInput, z.infer<typeof voiceMemoryOutput>> = {
  name: "voice.keepsake",
  temperature: 0.7,
  maxTokens: 700,
  buildPrompt: (input) => ({
    system: `A parent recorded a spoken memory about their child. Turn the transcript into a short written keepsake (1–3 sentences) addressed to the child ("you"), plus a short title. Keep the parent's own details and wording where possible; clean up speech artifacts. Nothing the transcript doesn't say. The verbatim transcript is preserved separately, and the parent reviews your draft.\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}, ${input.ageText} old.`,
      untrusted("transcript", input.transcript),
      "Write the title and keepsake version.",
    ].join("\n\n"),
  }),
  outputSchema: voiceMemoryOutput,
  fallback: (input) => ({
    suggestedTitle:
      input.transcript.trim().split(/[.!?\n]/)[0]?.slice(0, 80) || "A spoken memory",
    keepsakeText: input.transcript.trim(),
  }),
};

/** ── memoryPrompts ─────────────────────────────────────────────────────────
 * Personalized capture prompts. Gentle, seasonal, never developmental pressure.
 */
export interface MemoryPromptsInput {
  childName: string;
  ageText: string;
  season: string;                 // "late summer"
  recentMemoryTitles: string[];   // confirmed, recent
  missingSections: string[];      // e.g. ["growth", "favorite foods"]
}

const memoryPromptsOutput = z.object({
  prompts: z.array(z.string().min(10).max(240)).min(2).max(5),
});

export const memoryPromptsTask: AiTask<MemoryPromptsInput, z.infer<typeof memoryPromptsOutput>> = {
  name: "prompts.generate",
  temperature: 0.9,
  maxTokens: 500,
  buildPrompt: (input) => ({
    system: `You write gentle questions that help a parent remember ordinary moments worth keeping about their child. Conversational, specific, warm. Absolutely no developmental pressure — never imply the child "should" be doing anything, never mention skills they haven't shown. Draw on the season, the child's age, and what the parent has already captured (to avoid repeats and to notice gaps). Questions, not tasks.\n\n${UNTRUSTED_RULES}`,
    user: [
      `Child: ${input.childName}, ${input.ageText} old. Season: ${input.season}.`,
      untrustedList("recently captured", input.recentMemoryTitles.map((t) => ({ title: t }))),
      input.missingSections.length > 0
        ? `Sections of the monthly chapter with nothing in them yet: ${input.missingSections.join(", ")}.`
        : "",
      "Write 3 prompts.",
    ].filter(Boolean).join("\n\n"),
  }),
  outputSchema: memoryPromptsOutput,
  fallback: (input) => ({
    prompts: [
      `What has ${input.childName} been obsessed with lately?`,
      `What ordinary part of your ${input.season} days do you never want to forget?`,
      `What made everyone laugh this week?`,
    ],
  }),
};

/** ── mediaRelevance ────────────────────────────────────────────────────────
 * Emotional-salience scoring hint for photo/video selection. The score is a
 * suggestion consumed by the selection algorithm; parents can always override.
 */
export interface MediaRelevanceInput {
  items: Array<{
    id: string;
    kind: "photo" | "video";
    caption: string | null;
    memoryContext: string | null;
    qualityScore: number;
  }>;
}

const mediaRelevanceOutput = z.object({
  scores: z.array(
    z.object({
      id: z.string(),
      relevance: z.number().min(0).max(1),
    })
  ),
});

export const mediaRelevanceTask: AiTask<MediaRelevanceInput, z.infer<typeof mediaRelevanceOutput>> = {
  name: "media.relevance",
  temperature: 0.1,
  maxTokens: 1200,
  buildPrompt: (input) => ({
    system: `You score how emotionally meaningful each media item likely is for a family keepsake, from its caption/context only (you cannot see the pixels). 0.9+: milestones, firsts, strong emotion, family togetherness. 0.5: pleasant everyday. 0.2: unclear/no context. Return a score for every id, unchanged ids.\n\n${UNTRUSTED_RULES}`,
    user: [
      untrustedList(
        "media items",
        input.items.map((i) => ({
          id: i.id,
          kind: i.kind,
          caption: i.caption,
          context: i.memoryContext,
        }))
      ),
      "Score each item.",
    ].join("\n\n"),
  }),
  outputSchema: mediaRelevanceOutput,
  fallback: (input) => ({
    scores: input.items.map((i) => ({
      id: i.id,
      // no model: prefer items with human context, then quality
      relevance: Math.min(
        1,
        0.35 + (i.memoryContext ? 0.35 : 0) + (i.caption ? 0.15 : 0) + i.qualityScore * 0.15
      ),
    })),
  }),
};
