import { env } from "@/server/env";
import type { AiCompletionResult, AiPrompt, AiProvider } from "@/server/ai/types";

/**
 * Anthropic provider using the Messages API with forced tool use, which
 * guarantees schema-shaped JSON output. No SDK dependency — a small, pinned
 * fetch client keeps the surface auditable.
 */
export class AnthropicProvider implements AiProvider {
  name = "anthropic";

  async complete(
    prompt: AiPrompt,
    jsonSchema: Record<string, unknown>,
    opts: { temperature: number; maxTokens: number }
  ): Promise<AiCompletionResult> {
    const { ANTHROPIC_API_KEY, AI_MODEL } = env();
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
        tools: [
          {
            name: "emit_result",
            description: "Emit the structured result for this writing task.",
            input_schema: jsonSchema,
          },
        ],
        tool_choice: { type: "tool", name: "emit_result" },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      throw new Error(`Anthropic API error (${status})`);
    }

    const data = (await response.json()) as {
      model: string;
      content: Array<{ type: string; input?: unknown }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const toolUse = data.content.find((c) => c.type === "tool_use");
    if (!toolUse?.input) {
      throw new Error("Anthropic response contained no structured output");
    }

    return {
      json: toolUse.input,
      model: data.model,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }
}
