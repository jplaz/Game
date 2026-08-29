import { notFound } from "next/navigation";
import { requireAppContext } from "@/server/context";
import { getMemory } from "@/server/domain/memories";
import { getComments } from "@/server/domain/feed";
import { getSql } from "@/server/db/client";
import { formatDate } from "@/lib/format";
import { MediaAudio, MediaImage, MediaVideo } from "@/components/media/media-image";
import { CommentForm, ReactionBar } from "@/components/memories/reaction-bar";
import { VersionPicker } from "@/components/memories/version-picker";
import { Badge } from "@/components/ui/misc";
import { NotFoundError } from "@/server/errors";

export const dynamic = "force-dynamic";

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  let memory;
  try {
    memory = await getMemory(ctx.user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const comments = memory.commentsEnabled
    ? await getComments(ctx.user.id, memory.familyId, "memory", memory.id)
    : [];

  const sql = getSql();
  const reactionRows = await sql<{ emoji: string; n: number; mine: boolean }[]>`
    select emoji, count(*)::int as n,
           bool_or(author_id = ${ctx.user.id}) as mine
    from reactions
    where target_type = 'memory' and target_id = ${memory.id}
    group by emoji
  `;
  const counts = Object.fromEntries(reactionRows.map((r) => [r.emoji, r.n]));
  const mine = reactionRows.filter((r) => r.mine).map((r) => r.emoji);

  return (
    <article className="max-w-2xl mx-auto space-y-6 animate-fade-up">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-300">
          <span>{formatDate(memory.happenedAt)}</span>
          {memory.ageText ? <span>· {memory.ageText}</span> : null}
          {memory.approvalStatus === "pending" ? (
            <Badge tone="pending">Awaiting approval</Badge>
          ) : null}
        </div>
        {memory.title ? (
          <h1 className="text-2xl sm:text-3xl text-ink-700">{memory.title}</h1>
        ) : null}
        {memory.milestones.filter((m) => m.status === "confirmed").length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {memory.milestones
              .filter((m) => m.status === "confirmed")
              .map((m) => (
                <Badge key={m.id} tone="accent">
                  {m.title}
                </Badge>
              ))}
          </div>
        ) : null}
      </header>

      {memory.body ? (
        <p className="text-lg text-ink-600 leading-relaxed whitespace-pre-wrap">
          {memory.body}
        </p>
      ) : null}

      {memory.audioMediaId ? (
        <div className="lc-card p-4 space-y-3">
          <p className="text-xs uppercase tracking-wide text-ink-300">Voice memory</p>
          <MediaAudio mediaId={memory.audioMediaId} />
          {memory.transcript ? (
            <details className="text-sm text-ink-500">
              <summary className="cursor-pointer text-ink-400">Transcript</summary>
              <p className="mt-2 leading-relaxed whitespace-pre-wrap">{memory.transcript}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      {memory.canEdit ? (
        <VersionPicker memoryId={memory.id} versions={memory.versions} />
      ) : null}

      {memory.media.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {memory.media.map((m) =>
            m.kind === "video" ? (
              <div key={m.id} className="col-span-2 sm:col-span-3">
                <MediaVideo mediaId={m.id} />
              </div>
            ) : (
              <MediaImage
                key={m.id}
                mediaId={m.id}
                variant="web"
                alt={m.altText ?? "A family photo"}
                className="aspect-square"
              />
            )
          )}
        </div>
      ) : null}

      {memory.people.length > 0 ? (
        <p className="text-sm text-ink-400">
          With {memory.people.map((p) => p.name).join(", ")}
        </p>
      ) : null}

      <footer className="space-y-4 border-t border-sand-100 pt-5">
        <ReactionBar
          familyId={memory.familyId}
          targetType="memory"
          targetId={memory.id}
          counts={counts}
          mine={mine}
        />
        {memory.commentsEnabled ? (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div key={comment.id} className="text-sm">
                <span className="font-medium text-ink-600">{comment.authorName}</span>{" "}
                <span className="text-ink-500">{comment.body}</span>
              </div>
            ))}
            <CommentForm
              familyId={memory.familyId}
              targetType="memory"
              targetId={memory.id}
            />
          </div>
        ) : null}
      </footer>
    </article>
  );
}
