import { getSql } from "@/server/db/client";
import { LimitExceededError } from "@/server/errors";

/**
 * Plans, limits and usage metering.
 *
 * Limits are enforced at admission time (uploads, generation requests) with
 * clear messaging — never surprise charges. The business model lives in the
 * plans/plan_limits tables, not in code.
 */

export type LimitKey =
  | "storage_bytes"
  | "video_minutes_month"
  | "ai_generations_month"
  | "transcription_minutes_month"
  | "members"
  | "children"
  | "books"
  | "recaps_month";

const MONTHLY_KEYS = new Set<LimitKey>([
  "video_minutes_month",
  "ai_generations_month",
  "transcription_minutes_month",
  "recaps_month",
]);

export async function getFamilyPlanId(familyId: string): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ plan_id: string }[]>`
    select plan_id from subscriptions
    where family_id = ${familyId} and status in ('active','trialing','past_due')
    order by created_at desc limit 1
  `;
  return rows[0]?.plan_id ?? "free";
}

export async function getLimit(familyId: string, key: LimitKey): Promise<number> {
  const sql = getSql();
  const planId = await getFamilyPlanId(familyId);
  const rows = await sql<{ limit_value: string }[]>`
    select limit_value from plan_limits
    where plan_id = ${planId} and limit_key = ${key}
  `;
  const raw = rows[0]?.limit_value;
  return raw === undefined ? 0 : Number(raw);
}

/** Current metered usage. storage_bytes is all-time; *_month keys reset monthly. */
export async function getUsage(
  familyId: string,
  metric: "storage_bytes" | "video_minutes" | "ai_generations" | "transcription_seconds" | "render_minutes",
  monthly: boolean
): Promise<number> {
  const sql = getSql();
  const rows = monthly
    ? await sql<{ total: string | null }[]>`
        select sum(delta) as total from usage_ledger
        where family_id = ${familyId} and metric = ${metric}
          and created_at >= date_trunc('month', now())
      `
    : await sql<{ total: string | null }[]>`
        select sum(delta) as total from usage_ledger
        where family_id = ${familyId} and metric = ${metric}
      `;
  return Number(rows[0]?.total ?? 0);
}

export async function recordUsage(opts: {
  familyId: string;
  metric: "storage_bytes" | "video_minutes" | "ai_generations" | "transcription_seconds" | "render_minutes";
  delta: number;
  refType?: string;
  refId?: string;
}): Promise<void> {
  const sql = getSql();
  await sql`
    insert into usage_ledger (family_id, metric, delta, ref_type, ref_id)
    values (${opts.familyId}, ${opts.metric}, ${Math.round(opts.delta)},
            ${opts.refType ?? null}, ${opts.refId ?? null})
  `;
}

/** Throws LimitExceededError with a friendly upgrade message when over. */
export async function assertWithinLimit(
  familyId: string,
  key: LimitKey,
  pendingDelta: number,
  friendlyWhat: string
): Promise<void> {
  const limit = await getLimit(familyId, key);
  if (limit < 0) return; // unlimited
  const metric = key === "storage_bytes" ? "storage_bytes"
    : key === "video_minutes_month" ? "video_minutes"
    : key === "ai_generations_month" ? "ai_generations"
    : key === "transcription_minutes_month" ? "transcription_seconds"
    : null;
  let current = 0;
  if (metric) {
    current = await getUsage(familyId, metric, MONTHLY_KEYS.has(key));
    if (key === "transcription_minutes_month") current = current / 60;
  } else {
    const sql = getSql();
    if (key === "members") {
      const r = await sql`select count(*)::int as n from family_members where family_id = ${familyId}`;
      current = Number(r[0]?.n ?? 0);
    } else if (key === "children") {
      const r = await sql`select count(*)::int as n from children where family_id = ${familyId} and deleted_at is null`;
      current = Number(r[0]?.n ?? 0);
    } else if (key === "books") {
      const r = await sql`select count(*)::int as n from books where family_id = ${familyId} and deleted_at is null`;
      current = Number(r[0]?.n ?? 0);
    } else if (key === "recaps_month") {
      const r = await sql`select count(*)::int as n from video_recaps
        where family_id = ${familyId} and created_at >= date_trunc('month', now())`;
      current = Number(r[0]?.n ?? 0);
    }
  }
  if (current + pendingDelta > limit) {
    throw new LimitExceededError(
      `Your plan's ${friendlyWhat} limit is reached. Upgrade to keep going — nothing you've saved is affected.`,
      key
    );
  }
}
