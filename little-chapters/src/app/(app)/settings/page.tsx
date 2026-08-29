import { requireAppContext } from "@/server/context";
import { getSql } from "@/server/db/client";
import { getFamilyPlanId, getLimit, getUsage } from "@/server/billing/usage";
import { listExports } from "@/server/domain/exports";
import { formatBytes, formatDate } from "@/lib/format";
import { SectionHeading } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import {
  CheckoutButton,
  DownloadExportButton,
  ExportButton,
  LogoutButton,
} from "@/components/settings/settings-actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireAppContext();
  const sql = getSql();
  const isOwner = ctx.role === "owner";

  const planId = await getFamilyPlanId(ctx.familyId);
  const storageUsed = await getUsage(ctx.familyId, "storage_bytes", false);
  const storageLimit = await getLimit(ctx.familyId, "storage_bytes");
  const plans = await sql<{ id: string; name: string; monthly_price_cents: number; description: string }[]>`
    select id, name, monthly_price_cents, description from plans
    where is_active order by sort_order
  `;
  const exports = isOwner ? await listExports(ctx.user.id, ctx.familyId) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl text-ink-700">Settings</h1>
        <LogoutButton />
      </div>

      <section className="lc-card p-6 space-y-2">
        <SectionHeading title="Account" className="mb-0" />
        <p className="text-sm text-ink-500">{ctx.user.email}</p>
        <p className="text-sm text-ink-300">
          Family: {ctx.familyName} · your role: {ctx.role}
        </p>
      </section>

      <section className="lc-card p-6 space-y-4">
        <SectionHeading
          title="Plan & storage"
          subtitle="Limits are enforced up front — never surprise charges."
          className="mb-0"
        />
        <div className="flex items-center gap-3">
          <Badge tone="accent">{plans.find((p) => p.id === planId)?.name ?? planId}</Badge>
          <span className="text-sm text-ink-400">
            {formatBytes(storageUsed)} used
            {storageLimit > 0 ? ` of ${formatBytes(storageLimit)}` : ""}
          </span>
        </div>
        {storageLimit > 0 ? (
          <div className="h-2 rounded-full bg-sand-100 overflow-hidden">
            <div
              className="h-full bg-clay-500"
              style={{ width: `${Math.min(100, (storageUsed / storageLimit) * 100)}%` }}
            />
          </div>
        ) : null}
        {isOwner ? (
          <div className="grid sm:grid-cols-3 gap-3 pt-2">
            {plans
              .filter((p) => p.id !== "free" && p.id !== planId)
              .map((plan) => (
                <div key={plan.id} className="rounded-xl border border-sand-100 p-4 space-y-2">
                  <p className="font-medium text-ink-700">{plan.name}</p>
                  <p className="text-xs text-ink-300">{plan.description}</p>
                  <p className="text-sm text-ink-600">
                    ${(plan.monthly_price_cents / 100).toFixed(2)}/mo
                  </p>
                  <CheckoutButton
                    familyId={ctx.familyId}
                    planId={plan.id}
                    label={`Upgrade`}
                  />
                </div>
              ))}
          </div>
        ) : null}
      </section>

      {isOwner ? (
        <section className="lc-card p-6 space-y-4">
          <SectionHeading
            title="Your archive belongs to you"
            subtitle="Export everything — originals, transcripts, memories, metadata — any time."
            className="mb-0"
          />
          <ExportButton familyId={ctx.familyId} />
          {exports.length > 0 ? (
            <ul className="space-y-2">
              {exports.map((exp) => (
                <li key={exp.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-500">
                    {formatDate(exp.createdAt)} ·{" "}
                    {exp.status === "ready"
                      ? `${exp.sizeBytes ? formatBytes(exp.sizeBytes) : ""} ready`
                      : exp.status}
                  </span>
                  {exp.status === "ready" ? (
                    <DownloadExportButton exportId={exp.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="lc-card p-6 space-y-2">
        <SectionHeading title="Privacy" className="mb-0" />
        <p className="text-sm text-ink-500 leading-relaxed">
          Everything here is private to your family by default. Nothing is ever
          public unless you create a share link — and every link can be
          password-protected, expiring, or revoked. Your content is never used
          to train AI models.
        </p>
      </section>
    </div>
  );
}
