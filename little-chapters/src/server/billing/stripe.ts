import Stripe from "stripe";
import { getSql } from "@/server/db/client";
import { assertFamilyRole } from "@/server/authz";
import { env } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import { logger } from "@/server/observability/logger";

/**
 * Stripe billing: Checkout for subscriptions, customer portal for management,
 * signature-verified idempotent webhooks reconciling the subscriptions table.
 */

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) {
    throw new ValidationError(
      "Billing isn't configured yet (STRIPE_SECRET_KEY) — see docs/INTEGRATIONS.md §4"
    );
  }
  if (!stripe) stripe = new Stripe(key);
  return stripe;
}

export function billingEnabled(): boolean {
  return Boolean(env().STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(opts: {
  userId: string;
  familyId: string;
  planId: string;
  interval: "monthly" | "yearly";
}): Promise<{ url: string }> {
  await assertFamilyRole(opts.userId, opts.familyId, "owner");
  const sql = getSql();
  const plans = await sql<
    { id: string; stripe_price_id_monthly: string | null; stripe_price_id_yearly: string | null }[]
  >`
    select id, stripe_price_id_monthly, stripe_price_id_yearly
    from plans where id = ${opts.planId} and is_active
  `;
  const plan = plans[0];
  if (!plan) throw new NotFoundError("Plan");
  const priceId =
    opts.interval === "monthly" ? plan.stripe_price_id_monthly : plan.stripe_price_id_yearly;
  if (!priceId) {
    throw new ValidationError(
      "This plan isn't connected to Stripe yet — set stripe_price_id on the plans row (docs/INTEGRATIONS.md §4)"
    );
  }

  const users = await sql<{ email: string }[]>`select email from users where id = ${opts.userId}`;
  const existing = await sql<{ stripe_customer_id: string | null }[]>`
    select stripe_customer_id from subscriptions
    where family_id = ${opts.familyId} order by created_at desc limit 1
  `;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: existing[0]?.stripe_customer_id ?? undefined,
    customer_email: existing[0]?.stripe_customer_id ? undefined : users[0]?.email,
    client_reference_id: opts.familyId,
    metadata: { familyId: opts.familyId, planId: opts.planId },
    subscription_data: { metadata: { familyId: opts.familyId, planId: opts.planId } },
    success_url: `${env().NEXT_PUBLIC_APP_URL}/settings/billing?status=success`,
    cancel_url: `${env().NEXT_PUBLIC_APP_URL}/settings/billing?status=canceled`,
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return { url: session.url };
}

export async function createPortalSession(opts: {
  userId: string;
  familyId: string;
}): Promise<{ url: string }> {
  await assertFamilyRole(opts.userId, opts.familyId, "owner");
  const sql = getSql();
  const rows = await sql<{ stripe_customer_id: string | null }[]>`
    select stripe_customer_id from subscriptions
    where family_id = ${opts.familyId} and stripe_customer_id is not null
    order by created_at desc limit 1
  `;
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) throw new NotFoundError("Subscription");
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env().NEXT_PUBLIC_APP_URL}/settings/billing`,
  });
  return { url: session.url };
}

/** Verify, dedupe and apply a Stripe webhook event. */
export async function handleStripeWebhook(rawBody: string, signature: string): Promise<void> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ValidationError("STRIPE_WEBHOOK_SECRET is not configured");
  const event = await getStripe().webhooks.constructEventAsync(rawBody, signature, secret);

  const sql = getSql();
  const inserted = await sql`
    insert into stripe_events (id, type) values (${event.id}, ${event.type})
    on conflict (id) do nothing
    returning id
  `;
  if (inserted.length === 0) return; // already processed

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const familyId = session.client_reference_id ?? session.metadata?.familyId;
      const planId = session.metadata?.planId;
      if (!familyId || !planId) break;
      await sql`
        insert into subscriptions
          (family_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
        values
          (${familyId}, ${planId}, 'active',
           ${typeof session.customer === "string" ? session.customer : null},
           ${typeof session.subscription === "string" ? session.subscription : null})
        on conflict (stripe_subscription_id) do update
          set status = 'active', plan_id = ${planId}
      `;
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const status =
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : sub.status === "active" || sub.status === "trialing"
            ? sub.status
            : sub.status === "past_due"
              ? "past_due"
              : "canceled";
      const periodEnd = sub.current_period_end;
      await sql`
        update subscriptions set
          status = ${status},
          cancel_at_period_end = ${sub.cancel_at_period_end},
          current_period_end = ${periodEnd ? new Date(periodEnd * 1000) : null}
        where stripe_subscription_id = ${sub.id}
      `;
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subId =
        typeof invoice.subscription === "string" ? invoice.subscription : null;
      if (subId) {
        await sql`
          update subscriptions set status = 'past_due'
          where stripe_subscription_id = ${subId}
        `;
      }
      break;
    }
    default:
      logger.info("stripe event ignored", { event: event.type });
  }
}
