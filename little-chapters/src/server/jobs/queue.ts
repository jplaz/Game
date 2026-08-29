import { getSql } from "@/server/db/client";
import { logger } from "@/server/observability/logger";

/**
 * Postgres-backed job queue.
 *
 * - Claiming uses FOR UPDATE SKIP LOCKED so multiple workers never collide.
 * - Idempotency: enqueueing the same (type, idempotencyKey) while one is
 *   queued/running is a no-op (enforced by a partial unique index).
 * - Retries with exponential backoff; jobs exceeding max_attempts go 'dead'.
 * - `progress` / `progress_note` surface to the product UI.
 */

export type JobType =
  | "media.ingest"
  | "media.analyze"
  | "media.transcode"
  | "media.scan"
  | "voice.transcribe"
  | "chapter.generate"
  | "book.compile"
  | "book.render"
  | "recap.render"
  | "export.build"
  | "notify.dispatch"
  | "embeddings.index"
  | "family.purge";

export interface JobRow {
  id: string;
  type: JobType;
  family_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  progress: number;
}

export async function enqueueJob(opts: {
  type: JobType;
  familyId?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
}): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into jobs (type, family_id, payload, idempotency_key, priority, run_at, max_attempts)
    values (
      ${opts.type},
      ${opts.familyId ?? null},
      ${sql.json(opts.payload as never)},
      ${opts.idempotencyKey ?? null},
      ${opts.priority ?? 5},
      ${opts.runAt ?? new Date()},
      ${opts.maxAttempts ?? 5}
    )
    on conflict (type, idempotency_key) where idempotency_key is not null
      and status in ('queued','running')
    do nothing
    returning id
  `;
  const id = rows[0]?.id ?? null;
  if (id) logger.info("job enqueued", { jobId: id, jobType: opts.type });
  return id;
}

/** Claim up to `limit` runnable jobs for this worker. */
export async function claimJobs(
  workerId: string,
  limit: number
): Promise<JobRow[]> {
  const sql = getSql();
  return sql<JobRow[]>`
    update jobs set
      status = 'running',
      started_at = now(),
      attempts = attempts + 1,
      locked_by = ${workerId},
      locked_at = now()
    where id in (
      select id from jobs
      where status = 'queued' and run_at <= now()
      order by priority, run_at
      for update skip locked
      limit ${limit}
    )
    returning id, type, family_id, payload, status, attempts, max_attempts, progress
  `;
}

export async function completeJob(jobId: string): Promise<void> {
  const sql = getSql();
  await sql`
    update jobs set status = 'succeeded', finished_at = now(), progress = 1
    where id = ${jobId}
  `;
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const sql = getSql();
  // retry with exponential backoff, or mark dead after max_attempts
  await sql`
    update jobs set
      status = case when attempts >= max_attempts then 'dead' else 'queued' end,
      run_at = now() + (interval '1 second' * least(3600, pow(2, attempts) * 15)),
      finished_at = case when attempts >= max_attempts then now() else null end,
      last_error = left(${error}, 2000),
      locked_by = null,
      locked_at = null
    where id = ${jobId}
  `;
}

export async function updateJobProgress(
  jobId: string,
  progress: number,
  note?: string
): Promise<void> {
  const sql = getSql();
  await sql`
    update jobs set progress = ${Math.min(1, Math.max(0, progress))},
      progress_note = ${note ?? null}
    where id = ${jobId}
  `;
}

/** Reclaim jobs whose worker died (locked > 15 min without finishing). */
export async function reapStuckJobs(): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    update jobs set status = 'queued', locked_by = null, locked_at = null
    where status = 'running' and locked_at < now() - interval '15 minutes'
    returning id
  `;
  if (rows.length > 0) logger.warn("reaped stuck jobs", { count: rows.length });
  return rows.length;
}

export async function getJobForFamily(
  jobId: string,
  familyId: string
): Promise<{
  id: string;
  type: string;
  status: string;
  progress: number;
  progressNote: string | null;
} | null> {
  const sql = getSql();
  const rows = await sql<
    { id: string; type: string; status: string; progress: number; progress_note: string | null }[]
  >`
    select id, type, status, progress, progress_note
    from jobs where id = ${jobId} and family_id = ${familyId}
  `;
  const r = rows[0];
  return r
    ? { id: r.id, type: r.type, status: r.status, progress: r.progress, progressNote: r.progress_note }
    : null;
}
