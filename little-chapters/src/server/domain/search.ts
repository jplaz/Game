import { getSql } from "@/server/db/client";
import { assertFamilyRole } from "@/server/authz";
import { runAiTask } from "@/server/ai/run";
import { searchQueryTask, type SearchFilters } from "@/server/ai/tasks/search";

/**
 * Private search: NL query → structured filters (AI task with deterministic
 * fallback) → family-scoped SQL over full-text vectors, tags, people, dates.
 * Results never cross the family boundary; embeddings (when available) are
 * joined through the same scoped SQL.
 */

export interface SearchResult {
  memoryId: string;
  childId: string;
  title: string | null;
  snippet: string;
  happenedAt: string;
  kind: string;
  mediaCount: number;
  coverMediaId: string | null;
}

export async function searchMemories(opts: {
  userId: string;
  familyId: string;
  query: string;
  limit?: number;
}): Promise<{ results: SearchResult[]; filters: SearchFilters }> {
  const ctx = await assertFamilyRole(opts.userId, opts.familyId, "viewer");
  const sql = getSql();

  const people = await sql<{ name: string; id: string }[]>`
    select id, name from people where family_id = ${opts.familyId} and deleted_at is null
  `;
  const parsed = await runAiTask(
    searchQueryTask,
    {
      query: opts.query.slice(0, 300),
      peopleNames: people.map((p) => p.name),
      today: new Date().toISOString().slice(0, 10),
    },
    { familyId: opts.familyId, userId: opts.userId }
  );
  const filters = parsed.output;

  const personIds = people
    .filter((p) => filters.people.some((n) => n.toLowerCase() === p.name.toLowerCase()))
    .map((p) => p.id);
  const tsQuery = filters.textTerms.length > 0
    ? filters.textTerms.map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).join(" | ")
    : null;
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  const limit = Math.min(opts.limit ?? 30, 60);

  const rows = await sql<
    { id: string; child_id: string; title: string | null; body: string | null;
      transcript: string | null; happened_at: string; kind: string;
      media_count: number; cover_media_id: string | null }[]
  >`
    select m.id, m.child_id, m.title, m.body, m.transcript,
      m.happened_at::text as happened_at, m.kind,
      (select count(*)::int from memory_media mm where mm.memory_id = m.id) as media_count,
      (select mm.media_id from memory_media mm
        join media md on md.id = mm.media_id and md.status = 'ready' and md.deleted_at is null
        where mm.memory_id = m.id order by mm.sort_order limit 1) as cover_media_id
    from memories m
    where m.family_id = ${opts.familyId} and m.deleted_at is null
      and (${isParent} or m.approval_status = 'approved' or m.created_by = ${opts.userId})
      and (${tsQuery}::text is null or m.search_tsv @@ to_tsquery('simple', ${tsQuery ?? ""}))
      and (${filters.dateFrom}::date is null or m.happened_at >= ${filters.dateFrom})
      and (${filters.dateTo}::date is null or m.happened_at <= ${filters.dateTo})
      and (${filters.onlyMilestones} = false
           or exists (select 1 from milestones ms where ms.memory_id = m.id and ms.status = 'confirmed'))
      and (${personIds.length === 0}
           or exists (select 1 from memory_people mp where mp.memory_id = m.id
                      and mp.person_id = any(${personIds})))
      and (${filters.mediaKind} = 'any'
           or exists (select 1 from memory_media mm join media md on md.id = mm.media_id
                      where mm.memory_id = m.id and md.kind = ${filters.mediaKind}))
      and (${filters.tags.length === 0} or m.tags && ${filters.tags})
    order by
      case when ${tsQuery}::text is not null
        then ts_rank(m.search_tsv, to_tsquery('simple', ${tsQuery ?? ""})) end desc nulls last,
      m.happened_at desc
    limit ${limit}
  `;

  return {
    filters,
    results: rows.map((r) => ({
      memoryId: r.id,
      childId: r.child_id,
      title: r.title,
      snippet: (r.body ?? r.transcript ?? "").slice(0, 200),
      happenedAt: r.happened_at,
      kind: r.kind,
      mediaCount: r.media_count,
      coverMediaId: r.cover_media_id,
    })),
  };
}
