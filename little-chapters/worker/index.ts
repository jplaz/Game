import { randomBytes } from "crypto";
import { claimJobs, completeJob, failJob, reapStuckJobs } from "../src/server/jobs/queue";
import { JOB_HANDLERS } from "../src/server/jobs/registry";
import { env } from "../src/server/env";
import { logger, errorFields } from "../src/server/observability/logger";
import { closeSql, getSql } from "../src/server/db/client";

/**
 * Worker entrypoint (`npm run worker`).
 *
 * A long-running Node process — never serverless — that polls the Postgres
 * queue with SKIP LOCKED claims. Scale horizontally by running more copies.
 * Requires ffmpeg for video jobs (docs/INTEGRATIONS.md §7).
 */

const workerId = `worker-${randomBytes(4).toString("hex")}`;
let running = 0;
let stopping = false;

async function tick(): Promise<void> {
  if (stopping) return;
  const capacity = env().WORKER_CONCURRENCY - running;
  if (capacity <= 0) return;
  const jobs = await claimJobs(workerId, capacity);
  for (const job of jobs) {
    running += 1;
    const started = Date.now();
    logger.info("job started", { jobId: job.id, jobType: job.type, attempt: job.attempts });
    void (async () => {
      try {
        const handler = JOB_HANDLERS[job.type];
        if (!handler) throw new Error(`no handler for job type ${job.type}`);
        await handler(job.id, job.payload as never);
        await completeJob(job.id);
        logger.info("job succeeded", {
          jobId: job.id, jobType: job.type, durationMs: Date.now() - started,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await failJob(job.id, message).catch(() => {});
        logger.error("job failed", {
          jobId: job.id, jobType: job.type, attempt: job.attempts,
          durationMs: Date.now() - started, ...errorFields(err),
        });
      } finally {
        running -= 1;
      }
    })();
  }
}

async function main(): Promise<void> {
  // fail fast if the database is unreachable
  await getSql()`select 1`;
  logger.info("worker online", { jobId: workerId });

  const poll = setInterval(() => void tick().catch((err) =>
    logger.error("tick failed", errorFields(err))
  ), env().WORKER_POLL_INTERVAL_MS);
  const reap = setInterval(() => void reapStuckJobs().catch(() => {}), 60_000);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("worker draining", { jobId: workerId, event: signal });
    clearInterval(poll);
    clearInterval(reap);
    const deadline = Date.now() + 30_000;
    while (running > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await closeSql();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("worker failed to start", errorFields(err));
  process.exit(1);
});
