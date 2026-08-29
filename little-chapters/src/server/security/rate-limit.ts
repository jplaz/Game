import { getSql } from "@/server/db/client";
import { RateLimitedError } from "@/server/errors";

/**
 * Token-bucket rate limiting backed by Postgres (works across web instances;
 * put a CDN/WAF in front for volumetric protection in production).
 */
export async function enforceRateLimit(opts: {
  key: string;            // e.g. `login:ip:1.2.3.4`, `share:token:abc`
  capacity: number;       // bucket size
  refillPerSecond: number;
}): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ tokens: number }[]>`
    insert into rate_limits (bucket_key, tokens, updated_at)
    values (${opts.key}, ${opts.capacity - 1}, now())
    on conflict (bucket_key) do update set
      tokens = least(
        ${opts.capacity},
        rate_limits.tokens
          + extract(epoch from (now() - rate_limits.updated_at)) * ${opts.refillPerSecond}
      ) - 1,
      updated_at = now()
    returning tokens
  `;
  const tokens = rows[0]?.tokens ?? 0;
  if (tokens < 0) throw new RateLimitedError();
}

export const RATE_LIMITS = {
  login: { capacity: 10, refillPerSecond: 0.1 },
  uploadAdmission: { capacity: 60, refillPerSecond: 1 },
  shareResolve: { capacity: 30, refillPerSecond: 0.5 },
  qrResolve: { capacity: 30, refillPerSecond: 0.5 },
  aiGenerate: { capacity: 20, refillPerSecond: 0.2 },
  passwordAttempt: { capacity: 5, refillPerSecond: 0.05 },
} as const;
