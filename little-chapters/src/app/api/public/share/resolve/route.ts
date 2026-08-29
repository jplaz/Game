import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { getCurrentUser } from "@/server/auth/session";
import { resolveShareLink } from "@/server/domain/sharing";
import { getChapterUnchecked } from "@/server/domain/chapters";
import { getMediaUrlUnchecked } from "@/server/media/access";
import { getSql } from "@/server/db/client";

const schema = z.object({
  token: z.string().min(10).max(64),
  password: z.string().max(100).optional(),
});

/**
 * Share-link resolution behind /s/[token]. After policy checks the target is
 * returned with every referenced media id mapped to a short-lived signed URL.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseBody(request, schema);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    await enforceRateLimit({ key: `share:${ip}`, ...RATE_LIMITS.shareResolve });
    const viewer = await getCurrentUser();
    const resolved = await resolveShareLink(body.token, {
      password: body.password,
      viewerUserId: viewer?.id ?? null,
    });
    if (resolved.requires !== "none") {
      return { requires: resolved.requires };
    }

    const sql = getSql();
    const mediaUrls: Record<string, { kind: string; url: string; posterUrl: string | null }> = {};
    const addMedia = async (mediaId: string) => {
      if (mediaUrls[mediaId]) return;
      const rows = await sql<{ kind: string }[]>`
        select kind from media where id = ${mediaId}
          and deleted_at is null and status = 'ready'
      `;
      const kind = rows[0]?.kind;
      if (!kind) return;
      const variant = kind === "video" ? "web_video" : kind === "audio" ? "original" : "web";
      const url = await getMediaUrlUnchecked(mediaId, variant, false);
      if (!url) return;
      mediaUrls[mediaId] = {
        kind,
        url,
        posterUrl: kind === "video" ? await getMediaUrlUnchecked(mediaId, "poster") : null,
      };
    };

    if (resolved.targetType === "chapter") {
      const chapter = await getChapterUnchecked(resolved.targetId, resolved.familyId);
      const ids = new Set<string>();
      if (chapter.coverMediaId) ids.add(chapter.coverMediaId);
      for (const section of chapter.sections) {
        for (const id of (section.content.mediaIds as string[] | undefined) ?? []) {
          ids.add(id);
        }
      }
      for (const id of ids) await addMedia(id);
      return {
        requires: "none",
        targetType: "chapter",
        chapter: {
          title: chapter.title,
          subtitle: chapter.subtitle,
          coverMediaId: chapter.coverMediaId,
          sections: chapter.sections
            .filter((s) => !s.hidden)
            .map((s) => ({
              type: s.type,
              title: s.title,
              content: s.content,
            })),
        },
        mediaUrls,
      };
    }

    if (resolved.targetType === "memory") {
      const rows = await sql<
        { title: string | null; body: string | null; family_id: string }[]
      >`
        select title, body, family_id from memories
        where id = ${resolved.targetId} and family_id = ${resolved.familyId}
          and deleted_at is null
      `;
      const memory = rows[0];
      if (!memory) return { requires: "none", targetType: "gone" };
      const attached = await sql<{ media_id: string }[]>`
        select media_id from memory_media where memory_id = ${resolved.targetId}
        order by sort_order limit 12
      `;
      for (const row of attached) await addMedia(row.media_id);
      return {
        requires: "none",
        targetType: "memory",
        memory: { title: memory.title, body: memory.body, mediaIds: attached.map((a) => a.media_id) },
        mediaUrls,
      };
    }

    if (resolved.targetType === "recap") {
      const rows = await sql<{ title: string; output_object_id: string | null }[]>`
        select title, output_object_id from video_recaps
        where id = ${resolved.targetId} and family_id = ${resolved.familyId}
      `;
      const recap = rows[0];
      if (recap?.output_object_id) {
        const objects = await sql<{ bucket: string; object_key: string }[]>`
          select bucket, object_key from storage_objects where id = ${recap.output_object_id}
        `;
        if (objects[0]) {
          const { getStorage } = await import("@/server/storage");
          const url = await getStorage().createSignedReadUrl(
            objects[0].bucket as never, objects[0].object_key, 600
          );
          return {
            requires: "none",
            targetType: "recap",
            recap: { title: recap.title, url },
          };
        }
      }
      return { requires: "none", targetType: "gone" };
    }

    return { requires: "none", targetType: "gone" };
  });
}
