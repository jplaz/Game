import type { ZodSchema } from "zod";

/**
 * AI task contract.
 *
 * Each task is its own module: its own prompt, input contract, output schema
 * and sampling parameters. There is no "one giant prompt" — and no task can
 * mutate application data. Tasks return validated JSON drafts; the database
 * stays authoritative and parents confirm everything meaningful.
 */

export interface AiPrompt {
  system: string;
  user: string;
}

export interface AiTask<TInput, TOutput> {
  name: string;
  /** builds the full prompt; user content must go through untrusted() */
  buildPrompt: (input: TInput) => AiPrompt;
  outputSchema: ZodSchema<TOutput>;
  temperature: number;
  maxTokens: number;
  /** deterministic fallback used by the NullProvider (no network, clearly a
   *  draft assembled from the parent's own words — never fake AI) */
  fallback: (input: TInput) => TOutput;
  /** optional post-validation against the facts the task was given */
  validateGrounding?: (input: TInput, output: TOutput) => string | null;
}

export interface AiCallContext {
  familyId?: string;
  childId?: string;
  userId?: string;
}

export interface AiCompletionResult {
  /** raw JSON object returned by the model (pre-validation) */
  json: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  name: string;
  complete(
    prompt: AiPrompt,
    jsonSchema: Record<string, unknown>,
    opts: { temperature: number; maxTokens: number }
  ): Promise<AiCompletionResult>;
}
