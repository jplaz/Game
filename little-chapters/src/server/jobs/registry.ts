import type { JobType } from "@/server/jobs/queue";
import { handleMediaIngest } from "@/server/jobs/handlers/mediaIngest";
import { handleVoiceTranscribe } from "@/server/jobs/handlers/voiceTranscribe";
import { handleBookRender } from "@/server/jobs/handlers/bookRender";
import { handleRecapRender } from "@/server/jobs/handlers/recapRender";
import { handleExportBuild } from "@/server/jobs/handlers/exportBuild";
import { handleNotifyDispatch } from "@/server/jobs/handlers/notifyDispatch";
import { generateChapter } from "@/server/domain/chapters";
import { compileBook } from "@/server/domain/books";

/**
 * Job registry: every job type the worker can execute. Handlers are
 * idempotent — a retried job converges to the same result.
 */

export type JobHandler = (jobId: string, payload: never) => Promise<void>;

export const JOB_HANDLERS: Partial<Record<JobType, JobHandler>> = {
  "media.ingest": handleMediaIngest as JobHandler,
  "voice.transcribe": handleVoiceTranscribe as JobHandler,
  "chapter.generate": ((_jobId, payload: { chapterId: string }) =>
    generateChapter(payload.chapterId)) as JobHandler,
  "book.compile": ((_jobId, payload: { bookId: string }) =>
    compileBook(payload.bookId)) as JobHandler,
  "book.render": handleBookRender as JobHandler,
  "recap.render": handleRecapRender as JobHandler,
  "export.build": handleExportBuild as JobHandler,
  "notify.dispatch": handleNotifyDispatch as JobHandler,
};
