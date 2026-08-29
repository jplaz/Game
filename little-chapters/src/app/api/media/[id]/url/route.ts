import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { getMediaUrlForUser, type MediaVariant } from "@/server/media/access";
import { ValidationError } from "@/server/errors";

const VARIANTS = new Set(["original", "thumb", "web", "poster", "web_video", "waveform"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const url = new URL(request.url);
    const variant = url.searchParams.get("variant") ?? "web";
    if (!VARIANTS.has(variant)) throw new ValidationError("Unknown variant");
    const download = url.searchParams.get("download") === "1";
    const signedUrl = await getMediaUrlForUser(user.id, id, variant as MediaVariant, download);
    return { url: signedUrl };
  });
}
