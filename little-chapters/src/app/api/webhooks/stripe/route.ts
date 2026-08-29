import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/server/billing/stripe";
import { logger, errorFields } from "@/server/observability/logger";

/**
 * Stripe webhook: authenticated by signature (no CSRF/session checks apply).
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }
  const rawBody = await request.text();
  try {
    await handleStripeWebhook(rawBody, signature);
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.warn("stripe webhook rejected", errorFields(err));
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
