import { env } from "@/server/env";

/**
 * Transcription provider abstraction.
 *
 * Production: any OpenAI-compatible /v1/audio/transcriptions endpoint
 * (OpenAI, Groq, self-hosted faster-whisper). Development: the null provider
 * returns an explicit "needs transcription" marker so nothing pretends to
 * have understood audio it never processed.
 */

export interface TranscriptionResult {
  text: string;
  durationSeconds: number | null;
  provider: string;
}

export interface TranscriptionProvider {
  name: string;
  transcribe(audio: Buffer, filename: string, contentType: string): Promise<TranscriptionResult>;
}

class OpenAiCompatibleProvider implements TranscriptionProvider {
  name = "openai_compatible";

  async transcribe(
    audio: Buffer,
    filename: string,
    contentType: string
  ): Promise<TranscriptionResult> {
    const { TRANSCRIPTION_API_URL, TRANSCRIPTION_API_KEY, TRANSCRIPTION_MODEL } = env();
    if (!TRANSCRIPTION_API_URL || !TRANSCRIPTION_API_KEY) {
      throw new Error("Transcription provider is not configured");
    }
    const form = new FormData();
    form.append("model", TRANSCRIPTION_MODEL);
    form.append(
      "file",
      new Blob([new Uint8Array(audio)], { type: contentType }),
      filename
    );
    form.append("response_format", "verbose_json");

    const response = await fetch(
      `${TRANSCRIPTION_API_URL.replace(/\/$/, "")}/v1/audio/transcriptions`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${TRANSCRIPTION_API_KEY}` },
        body: form,
      }
    );
    if (!response.ok) {
      throw new Error(`Transcription failed (${response.status})`);
    }
    const data = (await response.json()) as { text?: string; duration?: number };
    if (!data.text) throw new Error("Transcription returned no text");
    return {
      text: data.text,
      durationSeconds: typeof data.duration === "number" ? data.duration : null,
      provider: this.name,
    };
  }
}

class NullTranscriptionProvider implements TranscriptionProvider {
  name = "null";

  async transcribe(): Promise<TranscriptionResult> {
    // Honest failure: without a provider we cannot transcribe. The voice
    // memory flow keeps the audio and lets the parent type what they said.
    throw new Error(
      "No transcription provider configured — see docs/INTEGRATIONS.md §3"
    );
  }
}

let provider: TranscriptionProvider | null = null;

export function getTranscriptionProvider(): TranscriptionProvider {
  if (!provider) {
    provider =
      env().TRANSCRIPTION_PROVIDER === "openai_compatible"
        ? new OpenAiCompatibleProvider()
        : new NullTranscriptionProvider();
  }
  return provider;
}

export function transcriptionEnabled(): boolean {
  return env().TRANSCRIPTION_PROVIDER !== "null";
}
