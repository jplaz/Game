import { MediaImage, MediaVideo } from "@/components/media/media-image";
import { formatDateShort } from "@/lib/format";
import type { ChapterView } from "@/server/domain/chapters";

/**
 * The chapter reading experience — shared by the app viewer and private
 * share pages. Server-rendered; media loads via signed URLs client-side.
 */
export function ChapterReader({ chapter }: { chapter: ChapterView }) {
  const visible = chapter.sections.filter((s) => !s.hidden);
  const cover = visible.find((s) => s.type === "cover");
  const coverMediaId = chapter.coverMediaId ?? cover?.content.mediaIds?.[0] ?? null;

  return (
    <article className="max-w-2xl mx-auto space-y-10">
      {/* cover */}
      <header className="text-center space-y-4 lc-grain bg-cream-100 rounded-card px-6 py-10 border border-sand-100">
        {coverMediaId ? (
          <MediaImage
            mediaId={coverMediaId}
            variant="web"
            alt=""
            className="mx-auto h-56 w-56 sm:h-72 sm:w-72 rounded-card shadow-lifted rotate-1"
          />
        ) : null}
        <div>
          <h1 className="text-3xl sm:text-4xl text-ink-700">{chapter.title}</h1>
          {chapter.subtitle ? (
            <p className="text-clay-600 mt-1 font-display text-lg">{chapter.subtitle}</p>
          ) : null}
        </div>
      </header>

      {visible
        .filter((s) => s.type !== "cover")
        .map((section) => (
          <Section key={section.id} section={section} />
        ))}
    </article>
  );
}

function Section({
  section,
}: {
  section: ChapterView["sections"][number];
}) {
  const { content } = section;
  const text = typeof content.text === "string" ? content.text : null;
  const items = Array.isArray(content.items) ? content.items : [];
  const mediaIds = Array.isArray(content.mediaIds) ? content.mediaIds : [];
  const captions = (content.captions ?? {}) as Record<string, string>;

  return (
    <section aria-label={section.title ?? section.type}>
      {section.title ? (
        <h2 className="text-xl sm:text-2xl text-ink-700 mb-4 text-center">
          {section.title}
        </h2>
      ) : null}

      {text ? (
        <div className="text-ink-600 leading-loose text-[1.05rem] whitespace-pre-wrap max-w-prose mx-auto">
          {text}
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="max-w-md mx-auto space-y-2.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-4 border-b border-sand-100 pb-2.5"
            >
              <span className="text-ink-600">{item.label}</span>
              <span className="text-sm text-ink-300 shrink-0">
                {item.value ?? (item.date ? formatDateShort(item.date) : "")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.type === "video_memories" || section.type === "favorite_video" ? (
        <div className="space-y-4">
          {mediaIds.map((id) => (
            <MediaVideo key={id} mediaId={id} />
          ))}
        </div>
      ) : mediaIds.length === 1 ? (
        <figure className="text-center">
          <MediaImage
            mediaId={mediaIds[0]!}
            variant="web"
            alt={captions[mediaIds[0]!] ?? ""}
            className="mx-auto max-w-md aspect-square"
          />
          {captions[mediaIds[0]!] ? (
            <figcaption className="mt-3 text-sm text-clay-600 italic">
              {captions[mediaIds[0]!]}
            </figcaption>
          ) : null}
        </figure>
      ) : mediaIds.length > 1 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {mediaIds.map((id) => (
            <MediaImage
              key={id}
              mediaId={id}
              alt={captions[id] ?? ""}
              className="aspect-square"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
