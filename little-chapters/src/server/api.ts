import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError, ValidationError } from "@/server/errors";
import { errorFields, logger } from "@/server/observability/logger";

/**
 * Route-handler helpers: consistent JSON errors, no internal leakage.
 */

export function jsonError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.httpStatus }
    );
  }
  if (err instanceof ZodError) {
    const first = err.errors[0];
    return NextResponse.json(
      {
        error: {
          code: "validation",
          message: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input",
        },
      },
      { status: 422 }
    );
  }
  logger.error("unhandled route error", errorFields(err));
  return NextResponse.json(
    { error: { code: "internal", message: "Something went wrong" } },
    { status: 500 }
  );
}

/** Wrap a route handler body with error mapping. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be JSON");
  }
  return schema.parse(raw);
}
