import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { getCurrentUser } from "@/server/auth/session";
import { resolveQrToken } from "@/server/domain/qr";
import { getMediaUrlUnchecked } from "@/server/media/access";
import { getSql } from "@/server/db/client";

const schema = z.object({
  token: z.string().min(10).max(64),
  password: z.string().max(100).optional(),
});

/**
 * QR resolution endpoint behind /m/[token]. Policy (family/link/password/
 * expiry/revocation) is evaluated on every call; media is exposed only as
 * short-lived signed URLs after the policy passes.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseBody(request, schema);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    await enforceRateLimit({ key: `qr:${ip}`, ...RATE_LIMITS.qrResolve });
    const viewer = await getCurrentUser();
    const resolved = await resolveQrToken(body.token, {
      password: body.password,
      viewerUserId: viewer?.id ?? null,
    });
    if (resolved.requires !== "none") {
      return { requires: resolved.requires };
    }

    const sql = getSql();
    let title = resolved.title;
    let text: string | null = null;
    const media: Array<{ id: string; kind: string; url: string; posterUrl: string | null }> = [];

    const addMedia = async (mediaId: string) => {
      const rows = await sql<{ kind: string }[]>`
        select kind from media where id = ${mediaId} and deleted_at is null
      `;
      const kind = rows[0]?.kind;
      if (!kind) return;
      const variant = kind === "video" ? "web_video" : kind === "audio" ? "original" : "web";
      const url = await getMediaUrlUnchecked(mediaId, variant, false);
      if (!url) return;
      const posterUrl =
        kind === "video" ? await getMediaUrlUnchecked(mediaId, "poster", false) : null;
      media.push({ id: mediaId, kind, url, posterUrl });
    };

    if (resolved.mediaId) await addMedia(resolved.mediaId);
    if (resolved.memoryId) {
      const rows = await sql<
        { title: string | null; body: string | null }[]
      >`
        select title, body from memories
        where id = ${resolved.memoryId} and deleted_at is null
      `;
      const memory = rows[0];
      if (memory) {
        title = title ?? memory.title;
        text = memory.body;
      }
      const attached = await sql<{ media_id: string }[]>`
        select mm.media_id from memory_media mm
        join media m on m.id = mm.media_id and m.status = 'ready' and m.deleted_at is null
        where mm.memory_id = ${resolved.memoryId}
        order by mm.sort_order limit 6
      `;
      for (const row of attached) {
        if (row.media_id !== resolved.mediaId) await addMedia(row.media_id);
      }
    }

    return {
      requires: "none",
      title: title ?? "A little memory",
      text,
      media,
      allowDownload: resolved.allowDownload,
    };
  });
}
