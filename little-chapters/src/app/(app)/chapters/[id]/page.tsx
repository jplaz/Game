import { notFound } from "next/navigation";
import { requireAppContext } from "@/server/context";
import { getChapter } from "@/server/domain/chapters";
import { ChapterReader } from "@/components/chapters/chapter-view";
import { ChapterActions } from "@/components/chapters/chapter-actions";
import { NotFoundError } from "@/server/errors";
import { Spinner } from "@/components/ui/misc";

export const dynamic = "force-dynamic";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  let chapter;
  try {
    chapter = await getChapter(ctx.user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const isParent = ctx.role === "owner" || ctx.role === "parent";

  if (chapter.status === "generating") {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <Spinner className="mx-auto h-8 w-8" />
        <h1 className="text-2xl text-ink-700">{chapter.title}</h1>
        <p className="text-ink-400">
          This chapter is being written from your memories. It usually takes a
          minute — come back shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {isParent ? (
        <ChapterActions
          chapterId={chapter.id}
          familyId={chapter.familyId}
          childId={chapter.childId}
          month={chapter.periodStart.slice(0, 7)}
        />
      ) : null}
      <ChapterReader chapter={chapter} />
    </div>
  );
}
