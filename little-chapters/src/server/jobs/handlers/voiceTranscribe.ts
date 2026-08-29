import { getSql } from "@/server/db/client";
import { getStorage } from "@/server/storage";
import { getTranscriptionProvider, transcriptionEnabled } from "@/server/transcription";
import { runAiTask } from "@/server/ai/run";
import { voiceMemoryTask } from "@/server/ai/tasks/suggestions";
import { recordUsage } from "@/server/billing/usage";
import { computeAge, formatAge } from "@/lib/age";
import { logger } from "@/server/observability/logger";

/**
 * voice.transcribe — transcribe a voice memory, preserve the verbatim
 * transcript, and draft a title + keepsake version for parent review.
 * Without a transcription provider the memory keeps its audio and politely
 * asks the parent to type what they said (no fake transcripts, ever).
 */
export async function handleVoiceTranscribe(
  _jobId: string,
  payload: { memoryId: string; audioMediaId: string }
): Promise<void> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; child_id: string; happened_at: string }[]
  >`
    select id, family_id, child_id, happened_at::text as happened_at
    from memories where id = ${payload.memoryId} and deleted_at is null
  `;
  const memory = rows[0];
  if (!memory) return;

  if (!transcriptionEnabled()) {
    logger.info("transcription skipped (no provider)", { memoryId: memory.id });
    return;
  }

  const objRows = await sql<
    { bucket: string; object_key: string; content_type: string; original_filename: string | null }[]
  >`
    select so.bucket, so.object_key, so.content_type, m.original_filename
    from media m join storage_objects so on so.id = m.original_object_id
    where m.id = ${payload.audioMediaId}
  `;
  const obj = objRows[0];
  if (!obj) return;

  const audio = await getStorage().getObject(obj.bucket as never, obj.object_key);
  const result = await getTranscriptionProvider().transcribe(
    audio,
    obj.original_filename ?? "memory.m4a",
    obj.content_type
  );

  await sql`
    update memories set transcript = ${result.text} where id = ${memory.id}
  `;
  await sql`
    insert into memory_versions (memory_id, source, body)
    values (${memory.id}, 'user', ${result.text})
  `;
  if (result.durationSeconds) {
    await recordUsage({
      familyId: memory.family_id, metric: "transcription_seconds",
      delta: Math.ceil(result.durationSeconds),
      refType: "memory", refId: memory.id,
    });
  }

  // draft title + keepsake (parent reviews before it becomes the display text)
  const childRows = await sql<
    { full_name: string; nickname: string | null; birth_date: string | null }[]
  >`
    select full_name, nickname, birth_date::text as birth_date
    from children where id = ${memory.child_id}
  `;
  const child = childRows[0]!;
  const displayName = child.nickname || child.full_name.split(" ")[0] || child.full_name;
  const ageText = child.birth_date
    ? formatAge(computeAge(new Date(`${child.birth_date}T00:00:00`), new Date(`${memory.happened_at}T00:00:00`)))
    : "";
  const draft = await runAiTask(
    voiceMemoryTask,
    { childName: displayName, ageText, transcript: result.text },
    { familyId: memory.family_id, childId: memory.child_id }
  );
  if (draft.generationId) {
    await sql`
      insert into memory_versions (memory_id, source, title, body, ai_generation_id)
      values (${memory.id}, 'ai', ${draft.output.suggestedTitle},
              ${draft.output.keepsakeText}, ${draft.generationId})
    `;
  }
  logger.info("voice memory transcribed", { memoryId: memory.id, familyId: memory.family_id });
}
