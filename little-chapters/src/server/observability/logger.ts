/**
 * Structured JSON logging with a strict field allowlist.
 *
 * Family content (child names, captions, transcripts, tokens, signed URLs)
 * must never reach logs. Only fields on the allowlist are emitted; anything
 * else is dropped and counted so leaks are visible in development.
 */

const ALLOWED_FIELDS = new Set([
  "requestId",
  "userId",
  "familyId",
  "childId",
  "mediaId",
  "memoryId",
  "chapterId",
  "bookId",
  "jobId",
  "jobType",
  "orderId",
  "exportId",
  "recapId",
  "shareLinkId",
  "qrMemoryId",
  "task",
  "provider",
  "model",
  "status",
  "durationMs",
  "attempt",
  "sizeBytes",
  "count",
  "route",
  "method",
  "statusCode",
  "errorCode",
  "errorName",
  "metric",
  "delta",
  "event",
]);

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: LogLevel, message: string, fields: LogFields = {}) {
  const safe: Record<string, unknown> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (ALLOWED_FIELDS.has(key)) safe[key] = value;
    else dropped += 1;
  }
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...safe,
    ...(dropped > 0 ? { droppedFields: dropped } : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

/** Serialize an unknown error into loggable fields without leaking payloads. */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { errorName: err.name, errorCode: (err as { code?: string }).code ?? null };
  }
  return { errorName: "UnknownError" };
}
