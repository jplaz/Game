import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { requireUser } from "@/server/auth/session";
import { assertChildAccess } from "@/server/authz";
import { getSql } from "@/server/db/client";
import { runAiTask } from "@/server/ai/run";
import { memoryPromptsTask } from "@/server/ai/tasks/suggestions";
import { rewriteMemoryTask } from "@/server/ai/tasks/writing";
import { computeAge, formatAge } from "@/lib/age";

/**
 * The memory assistant: gentle questions that help parents remember moments
 * worth keeping, and drafting of a structured memory from their answer.
 * Answers become memories only after the parent confirms (POST /api/memories).
 */

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("prompts"), childId: z.string().uuid() }),
  z.object({
    mode: z.literal("draft"),
    childId: z.string().uuid(),
    question: z.string().max(300),
    answer: z.string().min(1).max(5000),
  }),
]);

function season(date: Date): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const ctx = await assertChildAccess(user.id, body.childId, "contributor");
    await enforceRateLimit({ key: `assistant:${user.id}`, ...RATE_LIMITS.aiGenerate });

    const sql = getSql();
    const childRows = await sql<
      { full_name: string; nickname: string | null; pronouns: string | null; birth_date: string | null }[]
    >`
      select full_name, nickname, pronouns, birth_date::text as birth_date
      from children where id = ${body.childId}
    `;
    const child = childRows[0]!;
    const displayName = child.nickname || child.full_name.split(" ")[0] || child.full_name;
    const ageText = child.birth_date
      ? formatAge(computeAge(new Date(`${child.birth_date}T00:00:00`)))
      : "";

    if (body.mode === "prompts") {
      const recent = await sql<{ title: string | null; body: string | null }[]>`
        select title, body from memories
        where child_id = ${body.childId} and deleted_at is null
        order by created_at desc limit 10
      `;
      const monthStart = new Date();
      monthStart.setDate(1);
      const sections = await sql<{ n: string }[]>`
        select count(*)::text as n from growth_entries
        where child_id = ${body.childId} and measured_at >= ${monthStart.toISOString().slice(0, 10)}
      `;
      const missing = Number(sections[0]?.n ?? 0) === 0 ? ["growth"] : [];
      const result = await runAiTask(
        memoryPromptsTask,
        {
          childName: displayName,
          ageText,
          season: season(new Date()),
          recentMemoryTitles: recent
            .map((r) => r.title ?? r.body?.slice(0, 60) ?? "")
            .filter(Boolean),
          missingSections: missing,
        },
        { familyId: ctx.familyId, childId: body.childId, userId: user.id }
      );
      return { prompts: result.output.prompts };
    }

    // draft mode: the parent's answer becomes a keepsake draft they confirm
    const result = await runAiTask(
      rewriteMemoryTask,
      {
        childName: displayName,
        childPronouns: child.pronouns,
        ageText,
        originalText: `${body.question ? `(${body.question}) ` : ""}${body.answer}`,
      },
      { familyId: ctx.familyId, childId: body.childId, userId: user.id }
    );
    return {
      draft: {
        title: result.output.suggestedTitle,
        body: result.output.keepsakeText,
        original: body.answer,
        isFallback: result.isFallback,
      },
    };
  });
}
