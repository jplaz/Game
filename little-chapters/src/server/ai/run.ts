import { createHash } from "crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "@/server/env";
import { getSql } from "@/server/db/client";
import { logger, errorFields } from "@/server/observability/logger";
import { AnthropicProvider } from "@/server/ai/providers/anthropic";
import type { AiCallContext, AiProvider, AiTask } from "@/server/ai/types";

/**
 * AI task orchestrator.
 *
 * 1. Build prompt (untrusted content isolated by the task module).
 * 2. Call the configured provider with a JSON-schema-constrained output.
 * 3. Validate with Zod; one retry on invalid shape.
 * 4. Run the task's grounding validator; reject output that invents facts.
 * 5. Record the call in ai_generations (ledger + cache) and usage metering.
 *
 * With AI_PROVIDER=null the task's deterministic fallback runs instead —
 * a clearly-labeled draft assembled from the parent's own words, so the whole
 * product works with zero credentials without pretending to be AI.
 */

let provider: AiProvider | null = null;

function getProvider(): AiProvider | null {
  if (env().AI_PROVIDER === "anthropic") {
    if (!provider) provider = new AnthropicProvider();
    return provider;
  }
  return null; // null provider → fallback path
}

export function aiEnabled(): boolean {
  return env().AI_PROVIDER !== "null";
}

export interface RunAiResult<TOutput> {
  output: TOutput;
  generationId: string | null;
  /** true when produced by the deterministic fallback, not a model */
  isFallback: boolean;
}

export async function runAiTask<TInput, TOutput>(
  task: AiTask<TInput, TOutput>,
  input: TInput,
  ctx: AiCallContext = {}
): Promise<RunAiResult<TOutput>> {
  const activeProvider = getProvider();
  const inputHash = createHash("sha256")
    .update(task.name)
    .update(JSON.stringify(input))
    .digest("hex");
  const sql = getSql();

  if (!activeProvider) {
    const output = task.outputSchema.parse(task.fallback(input));
    const generationId = await record({
      ctx, task: task.name, provider: "null", model: null, inputHash,
      output, status: "succeeded", inputTokens: 0, outputTokens: 0,
    });
    return { output, generationId, isFallback: true };
  }

  // cache: identical (task, input) succeeded recently → reuse
  const cached = await sql<{ id: string; output: unknown }[]>`
    select id, output from ai_generations
    where task = ${task.name} and input_hash = ${inputHash}
      and status = 'succeeded' and provider = ${activeProvider.name}
      and created_at > now() - interval '7 days'
    order by created_at desc limit 1
  `;
  const hit = cached[0];
  if (hit) {
    const parsed = task.outputSchema.safeParse(hit.output);
    if (parsed.success) {
      return { output: parsed.data, generationId: hit.id, isFallback: false };
    }
  }

  const prompt = task.buildPrompt(input);
  const jsonSchema = zodToJsonSchema(task.outputSchema, {
    $refStrategy: "none",
  }) as Record<string, unknown>;

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await activeProvider.complete(prompt, jsonSchema, {
        temperature: task.temperature,
        maxTokens: task.maxTokens,
      });
      const parsed = task.outputSchema.safeParse(result.json);
      if (!parsed.success) {
        lastError = "schema_validation_failed";
        continue;
      }
      const groundingError = task.validateGrounding?.(input, parsed.data) ?? null;
      if (groundingError) {
        logger.warn("ai output rejected by grounding validator", {
          task: task.name,
          errorCode: "grounding",
        });
        lastError = groundingError;
        continue;
      }
      const generationId = await record({
        ctx, task: task.name, provider: activeProvider.name, model: result.model,
        inputHash, output: parsed.data, status: "succeeded",
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      });
      return { output: parsed.data, generationId, isFallback: false };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown";
      logger.warn("ai call failed", { task: task.name, attempt, ...errorFields(err) });
    }
  }

  // model unavailable or persistently invalid → deterministic fallback so the
  // product keeps working; the record notes the failure
  await record({
    ctx, task: task.name, provider: activeProvider.name, model: env().AI_MODEL,
    inputHash, output: null,
    status: lastError === "schema_validation_failed" || lastError.startsWith("grounding")
      ? "rejected_by_validation" : "failed",
    inputTokens: 0, outputTokens: 0,
  });
  const output = task.outputSchema.parse(task.fallback(input));
  return { output, generationId: null, isFallback: true };
}

async function record(entry: {
  ctx: AiCallContext;
  task: string;
  provider: string;
  model: string | null;
  inputHash: string;
  output: unknown;
  status: "succeeded" | "failed" | "rejected_by_validation";
  inputTokens: number;
  outputTokens: number;
}): Promise<string | null> {
  try {
    const sql = getSql();
    const rows = await sql<{ id: string }[]>`
      insert into ai_generations
        (family_id, child_id, task, provider, model, input_hash, output, status,
         input_tokens, output_tokens)
      values
        (${entry.ctx.familyId ?? null}, ${entry.ctx.childId ?? null}, ${entry.task},
         ${entry.provider}, ${entry.model}, ${entry.inputHash},
         ${entry.output === null ? null : sql.json(entry.output as never)},
         ${entry.status}, ${entry.inputTokens}, ${entry.outputTokens})
      returning id
    `;
    if (entry.ctx.familyId && entry.status === "succeeded" && entry.provider !== "null") {
      await sql`
        insert into usage_ledger (family_id, metric, delta, ref_type, ref_id)
        values (${entry.ctx.familyId}, 'ai_generations', 1, 'ai_generation', ${rows[0]?.id ?? null})
      `;
    }
    return rows[0]?.id ?? null;
  } catch (err) {
    logger.error("failed to record ai generation", errorFields(err));
    return null;
  }
}
