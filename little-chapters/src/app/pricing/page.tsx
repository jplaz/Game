import Link from "next/link";
import { getSql } from "@/server/db/client";
import { formatBytes } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const sql = getSql();
  const plans = await sql<
    { id: string; name: string; description: string; monthly_price_cents: number;
      yearly_price_cents: number }[]
  >`
    select id, name, description, monthly_price_cents, yearly_price_cents
    from plans where is_active order by sort_order
  `;
  const limits = await sql<{ plan_id: string; limit_key: string; limit_value: string }[]>`
    select plan_id, limit_key, limit_value from plan_limits
  `;
  const limitFor = (planId: string, key: string) => {
    const raw = limits.find((l) => l.plan_id === planId && l.limit_key === key)?.limit_value;
    return raw === undefined ? 0 : Number(raw);
  };

  return (
    <main className="min-h-dvh">
      <header className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-display text-xl text-ink-700">
          Little Chapters
        </Link>
        <Link href="/login" className={buttonClass({ variant: "secondary", size: "sm" })}>
          Sign in
        </Link>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="text-center max-w-xl mx-auto">
          <h1 className="text-4xl text-ink-700">Simple, honest plans</h1>
          <p className="mt-3 text-ink-400">
            Storage and creation limits are enforced up front — you will never
            be surprised by a charge. Your archive is exportable on every plan.
          </p>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const storage = limitFor(plan.id, "storage_bytes");
            const members = limitFor(plan.id, "members");
            const ai = limitFor(plan.id, "ai_generations_month");
            return (
              <div key={plan.id} className="lc-card p-6 flex flex-col">
                <h2 className="text-xl text-ink-700">{plan.name}</h2>
                <p className="mt-1 text-sm text-ink-300 leading-relaxed">{plan.description}</p>
                <p className="mt-4 text-3xl font-display text-ink-700">
                  {plan.monthly_price_cents === 0
                    ? "Free"
                    : `$${(plan.monthly_price_cents / 100).toFixed(0)}`}
                  {plan.monthly_price_cents > 0 ? (
                    <span className="text-sm text-ink-300 font-sans">/mo</span>
                  ) : null}
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-ink-500 flex-1">
                  <li>{storage < 0 ? "Unlimited storage" : `${formatBytes(storage)} storage`}</li>
                  <li>{members < 0 ? "Whole-family collaboration" : `${members} family members`}</li>
                  <li>
                    {ai < 0 ? "Unlimited AI writing" : ai > 0 ? `${ai} AI generations/mo` : "A taste of chapters"}
                  </li>
                </ul>
                <Link href="/login" className={buttonClass({ variant: plan.id === "premium" ? "primary" : "secondary", size: "sm", className: "mt-5 text-center" })}>
                  {plan.monthly_price_cents === 0 ? "Start free" : `Choose ${plan.name}`}
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
