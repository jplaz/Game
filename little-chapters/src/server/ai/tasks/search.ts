import { z } from "zod";
import type { AiTask } from "@/server/ai/types";
import { UNTRUSTED_RULES, untrusted } from "@/server/ai/untrusted";

/** ── searchQuery ───────────────────────────────────────────────────────────
 * Natural-language query → structured filters. The query itself is untrusted;
 * output is a constrained filter object executed through family-scoped SQL,
 * so an injected "instruction" can at worst produce a weird filter.
 */
export interface SearchQueryInput {
  query: string;
  peopleNames: string[];   // family's known people, for matching
  today: string;           // ISO date for relative ranges
}

const searchQueryOutput = z.object({
  textTerms: z.array(z.string().max(60)).max(6),
  mediaKind: z.enum(["photo", "video", "audio", "any"]).default("any"),
  onlyMilestones: z.boolean().default(false),
  people: z.array(z.string().max(80)).max(4),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  tags: z.array(z.string().max(40)).max(6),
});

export type SearchFilters = z.infer<typeof searchQueryOutput>;

export const searchQueryTask: AiTask<SearchQueryInput, SearchFilters> = {
  name: "search.parse",
  temperature: 0,
  maxTokens: 400,
  buildPrompt: (input) => ({
    system: `You convert a parent's natural-language search over their private family archive into structured filters. Only extract what the query actually says. People must match the provided known names (case-insensitive) or be omitted. Dates: resolve relative phrases against today's date; use null when unspecified. textTerms are content words for full-text search (drop stopwords, keep e.g. "beach", "avocado", "laughing").\n\n${UNTRUSTED_RULES}`,
    user: [
      `Today: ${input.today}. Known people: ${input.peopleNames.join(", ") || "(none)"}.`,
      untrusted("search query", input.query),
      "Emit the filters.",
    ].join("\n\n"),
  }),
  outputSchema: searchQueryOutput,
  fallback: (input) => {
    const lower = input.query.toLowerCase();
    const people = input.peopleNames.filter((p) => lower.includes(p.toLowerCase()));
    const mediaKind = /\bvideos?\b/.test(lower)
      ? ("video" as const)
      : /\bphotos?|pictures?\b/.test(lower)
        ? ("photo" as const)
        : ("any" as const);
    const stop = new Set([
      "show", "me", "every", "all", "find", "when", "did", "first", "the", "a",
      "an", "of", "with", "from", "memories", "memory", "videos", "video",
      "photos", "photo", "pictures", "where", "we", "about", "wrote", "his",
      "her", "their", "year", "and",
    ]);
    const textTerms = lower
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w))
      .filter((w) => !input.peopleNames.some((p) => p.toLowerCase() === w))
      .slice(0, 5);
    return {
      textTerms,
      mediaKind,
      onlyMilestones: /\bmilestones?\b|\bfirsts?\b/.test(lower),
      people,
      dateFrom: null,
      dateTo: null,
      tags: [],
    };
  },
};
