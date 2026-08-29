/**
 * Typed application errors. API routes map these to HTTP responses;
 * everything else becomes an opaque 500 (no internal details leak).
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, "not_found", 404);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this") {
    super(message, "forbidden", 403);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in required") {
    super(message, "unauthorized", 401);
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "validation", 422);
    this.name = "ValidationError";
  }
}

export class LimitExceededError extends AppError {
  constructor(
    message: string,
    public readonly limitKey: string
  ) {
    super(message, "limit_exceeded", 402);
    this.name = "LimitExceededError";
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests — please slow down") {
    super(message, "rate_limited", 429);
    this.name = "RateLimitedError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "conflict", 409);
    this.name = "ConflictError";
  }
}
