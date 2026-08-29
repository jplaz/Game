import { getSql } from "@/server/db/client";
import { notifyFamily } from "@/server/notifications";
import { formatMonth } from "@/lib/format";

/**
 * notify.dispatch — fan out product notifications for domain events.
 */
export async function handleNotifyDispatch(
  _jobId: string,
  payload: { kind: string; chapterId?: string; childId?: string; familyId?: string }
): Promise<void> {
  const sql = getSql();
  if (payload.kind === "chapter.ready" && payload.chapterId) {
    const rows = await sql<
      { family_id: string; period_start: string; nickname: string | null; full_name: string }[]
    >`
      select c.family_id, c.period_start::text as period_start, ch.nickname, ch.full_name
      from chapters c join children ch on ch.id = c.child_id
      where c.id = ${payload.chapterId}
    `;
    const row = rows[0];
    if (!row) return;
    const name = row.nickname || row.full_name.split(" ")[0] || row.full_name;
    await notifyFamily({
      familyId: row.family_id,
      type: "chapter.ready",
      title: `${name}'s ${formatMonth(row.period_start)} chapter is ready`,
      body: "The month's photos, videos and memories have been woven into a chapter. Take a look — everything is editable.",
      linkPath: `/chapters/${payload.chapterId}`,
    });
  }
}
