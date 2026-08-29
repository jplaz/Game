import { notFound } from "next/navigation";
import { requireAppContext } from "@/server/context";
import { assertResourceAccess } from "@/server/authz";
import { getSql } from "@/server/db/client";
import { getStorage } from "@/server/storage";
import { NotFoundError } from "@/server/errors";
import type { StoryboardScene } from "@/server/domain/recaps";
import { MediaImage } from "@/components/media/media-image";
import { Badge, Spinner } from "@/components/ui/misc";
import {
  AspectPicker,
  RemoveSceneButton,
  RenderRecapButton,
} from "@/components/recaps/recap-actions";
import { formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RecapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  try {
    await assertResourceAccess(ctx.user.id, "video_recaps", id, "viewer");
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const sql = getSql();
  const rows = await sql<
    { id: string; title: string; status: string; aspect: string;
      target_duration_s: number; storyboard: StoryboardScene[];
      output_object_id: string | null }[]
  >`
    select id, title, status, aspect, target_duration_s, storyboard, output_object_id
    from video_recaps where id = ${id}
  `;
  const recap = rows[0];
  if (!recap) notFound();
  const isParent = ctx.role === "owner" || ctx.role === "parent";

  let videoUrl: string | null = null;
  if (recap.status === "ready" && recap.output_object_id) {
    const objects = await sql<{ bucket: string; object_key: string }[]>`
      select bucket, object_key from storage_objects where id = ${recap.output_object_id}
    `;
    if (objects[0]) {
      videoUrl = await getStorage().createSignedReadUrl(
        objects[0].bucket as never, objects[0].object_key, 600
      );
    }
  }

  const totalMs = recap.storyboard.reduce((s, scene) => s + scene.durationMs, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl text-ink-700">{recap.title}</h1>
          <p className="text-sm text-ink-300 mt-1">
            Video recap · about {formatDuration(totalMs)}
          </p>
        </div>
        {recap.status === "ready" ? (
          <Badge tone="success">Ready</Badge>
        ) : recap.status === "rendering" ? (
          <span className="inline-flex items-center gap-2 text-sm text-ink-400">
            <Spinner /> Rendering…
          </span>
        ) : recap.status === "failed" ? (
          <Badge tone="pending">Render failed — adjust and retry</Badge>
        ) : (
          <Badge>Draft</Badge>
        )}
      </header>

      {videoUrl ? (
        <video
          controls
          playsInline
          src={videoUrl}
          className="w-full rounded-card bg-ink-800 shadow-lifted"
        />
      ) : null}

      {isParent ? (
        <div className="flex flex-wrap items-center gap-4">
          <AspectPicker recapId={recap.id} current={recap.aspect} />
          {recap.status !== "rendering" ? <RenderRecapButton recapId={recap.id} /> : null}
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg text-ink-700">Scenes</h2>
        {recap.storyboard.length === 0 ? (
          <p className="text-sm text-ink-300">No scenes yet.</p>
        ) : (
          <ol className="space-y-2">
            {recap.storyboard.map((scene, i) => (
              <li key={`${scene.mediaId}-${i}`} className="lc-card p-3 flex items-center gap-3">
                <MediaImage
                  mediaId={scene.mediaId}
                  variant={scene.kind === "video" ? "poster" : "thumb"}
                  alt=""
                  className="h-14 w-14 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-600">
                    {scene.kind === "video" ? "Video clip" : "Photo"} ·{" "}
                    {formatDuration(scene.durationMs)}
                  </p>
                  {scene.caption ? (
                    <p className="text-xs text-ink-300 truncate">“{scene.caption}”</p>
                  ) : null}
                </div>
                {isParent && recap.status !== "rendering" ? (
                  <RemoveSceneButton
                    recapId={recap.id}
                    index={i}
                    storyboard={recap.storyboard}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
