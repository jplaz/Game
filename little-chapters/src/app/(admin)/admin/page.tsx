import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { assertStaff } from "@/server/authz";
import { getSql } from "@/server/db/client";
import { formatBytes, formatCents } from "@/lib/format";
import { SectionHeading } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";

export const dynamic = "force-dynamic";

/**
 * Internal admin console: aggregates only. No family media or content is
 * visible here; support access to private content requires an explicit,
 * audited support_access_grants row (none of which this page creates).
 */
export default async function AdminPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login");
  try {
    await assertStaff(user.id);
  } catch {
    redirect("/home");
  }

  const sql = getSql();
  const [stats] = await sql<
    { users: number; families: number; children: number; media: number;
      memories: number; chapters: number; books: number; orders: number }[]
  >`
    select
      (select count(*)::int from users where deleted_at is null) as users,
      (select count(*)::int from families where deleted_at is null) as families,
      (select count(*)::int from children where deleted_at is null) as children,
      (select count(*)::int from media where deleted_at is null) as media,
      (select count(*)::int from memories where deleted_at is null) as memories,
      (select count(*)::int from chapters where deleted_at is null) as chapters,
      (select count(*)::int from books where deleted_at is null) as books,
      (select count(*)::int from print_orders) as orders
  `;
  const [storage] = await sql<{ total: string | null }[]>`
    select sum(size_bytes) as total from storage_objects where deleted_at is null
  `;
  const [aiCost] = await sql<{ total: string | null; calls: number }[]>`
    select sum(cost_microdollars) as total, count(*)::int as calls
    from ai_generations where created_at > now() - interval '30 days'
  `;
  const subscriptions = await sql<{ plan_id: string; status: string; n: number }[]>`
    select plan_id, status, count(*)::int as n from subscriptions
    group by plan_id, status order by plan_id
  `;
  const jobHealth = await sql<{ status: string; n: number }[]>`
    select status, count(*)::int as n from jobs
    where created_at > now() - interval '7 days'
    group by status order by status
  `;
  const failedJobs = await sql<
    { id: string; type: string; last_error: string | null; attempts: number }[]
  >`
    select id, type, last_error, attempts from jobs
    where status in ('failed','dead') order by finished_at desc nulls last limit 10
  `;
  const recentOrders = await sql<
    { id: string; status: string; total_cents: number; created_at: Date }[]
  >`
    select id, status, total_cents, created_at from print_orders
    order by created_at desc limit 10
  `;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl text-ink-700">Operations</h1>
        <p className="text-sm text-ink-300 mt-1">
          Aggregates only — family content requires an audited support grant.
        </p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Users", stats?.users],
          ["Families", stats?.families],
          ["Children", stats?.children],
          ["Media items", stats?.media],
          ["Memories", stats?.memories],
          ["Chapters", stats?.chapters],
          ["Books", stats?.books],
          ["Print orders", stats?.orders],
        ].map(([label, value]) => (
          <div key={String(label)} className="lc-card p-4">
            <p className="text-xs text-ink-300">{label}</p>
            <p className="text-2xl font-display text-ink-700 mt-1">{value ?? 0}</p>
          </div>
        ))}
      </section>

      <section className="grid sm:grid-cols-3 gap-3">
        <div className="lc-card p-4">
          <p className="text-xs text-ink-300">Total storage</p>
          <p className="text-xl font-display text-ink-700 mt-1">
            {formatBytes(Number(storage?.total ?? 0))}
          </p>
        </div>
        <div className="lc-card p-4">
          <p className="text-xs text-ink-300">AI calls (30d)</p>
          <p className="text-xl font-display text-ink-700 mt-1">{aiCost?.calls ?? 0}</p>
        </div>
        <div className="lc-card p-4">
          <p className="text-xs text-ink-300">AI cost (30d)</p>
          <p className="text-xl font-display text-ink-700 mt-1">
            {formatCents(Math.round(Number(aiCost?.total ?? 0) / 10000))}
          </p>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="lc-card p-6">
          <SectionHeading title="Subscriptions" className="mb-3" />
          {subscriptions.length === 0 ? (
            <p className="text-sm text-ink-300">No paid subscriptions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {subscriptions.map((s, i) => (
                <li key={i} className="flex justify-between">
                  <span className="text-ink-600">{s.plan_id}</span>
                  <span className="text-ink-400">
                    {s.n} {s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="lc-card p-6">
          <SectionHeading title="Processing health (7d)" className="mb-3" />
          <div className="flex flex-wrap gap-2">
            {jobHealth.map((j) => (
              <Badge
                key={j.status}
                tone={j.status === "succeeded" ? "success" : j.status === "dead" ? "pending" : "neutral"}
              >
                {j.status}: {j.n}
              </Badge>
            ))}
          </div>
          {failedJobs.length > 0 ? (
            <ul className="mt-4 space-y-2 text-xs text-ink-400">
              {failedJobs.map((job) => (
                <li key={job.id} className="border-b border-sand-100 pb-2">
                  <span className="text-ink-600">{job.type}</span> · attempt {job.attempts} ·{" "}
                  {job.last_error?.slice(0, 120) ?? "no error recorded"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="lc-card p-6">
        <SectionHeading title="Recent print orders" className="mb-3" />
        {recentOrders.length === 0 ? (
          <p className="text-sm text-ink-300">No orders yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentOrders.map((order) => (
              <li key={order.id} className="flex justify-between gap-3">
                <span className="text-ink-500 truncate">{order.id.slice(0, 8)}…</span>
                <span className="text-ink-400">
                  {formatCents(order.total_cents)} · {order.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
