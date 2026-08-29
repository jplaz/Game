import { z } from "zod";

/**
 * Environment configuration, validated once and lazily.
 *
 * Everything has a development-safe default so the app boots with zero
 * credentials (local storage driver, null AI provider, dev auth). Production
 * deployments set the real values — see docs/INTEGRATIONS.md.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z
    .string()
    .default("postgres://postgres:postgres@localhost:54322/postgres"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().default(""),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),

  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".local-storage"),

  AI_PROVIDER: z.enum(["anthropic", "null"]).default("null"),
  ANTHROPIC_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default("claude-sonnet-5"),

  TRANSCRIPTION_PROVIDER: z.enum(["openai_compatible", "null"]).default("null"),
  TRANSCRIPTION_API_URL: z.string().default(""),
  TRANSCRIPTION_API_KEY: z.string().default(""),
  TRANSCRIPTION_MODEL: z.string().default("whisper-1"),

  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),

  PRINT_PROVIDER: z.string().default("manual"),

  EMAIL_PROVIDER: z.enum(["resend_compatible", "null"]).default("null"),
  EMAIL_API_URL: z.string().default("https://api.resend.com"),
  EMAIL_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("Little Chapters <memories@example.com>"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),

  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),

  MEDIA_TOKEN_SECRET: z.string().default("dev-only-secret-do-not-use-in-prod"),
  APP_SECRET: z.string().default("dev-only-app-secret"),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1500),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
    if (
      cached.NODE_ENV === "production" &&
      cached.MEDIA_TOKEN_SECRET === "dev-only-secret-do-not-use-in-prod"
    ) {
      throw new Error(
        "MEDIA_TOKEN_SECRET must be set to a strong random value in production"
      );
    }
  }
  return cached;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}
