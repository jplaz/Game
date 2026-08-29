import { ForbiddenError } from "@/server/errors";
import { env } from "@/server/env";

/**
 * CSRF protection for state-changing route handlers: the browser must send a
 * same-origin request (Sec-Fetch-Site) or an Origin matching the app URL.
 * Webhooks authenticate by signature instead and skip this check.
 */
export function assertSameOrigin(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site" || site === "none") return;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const allowed = new URL(env().NEXT_PUBLIC_APP_URL).origin;
      if (new URL(origin).origin === allowed) return;
    } catch {
      // fall through to rejection
    }
  }
  throw new ForbiddenError("Cross-origin request rejected");
}
