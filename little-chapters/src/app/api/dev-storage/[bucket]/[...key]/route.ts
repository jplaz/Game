import { NextResponse } from "next/server";
import { LocalStorageDriver } from "@/server/storage/local";
import { verifyToken } from "@/server/storage/signing";
import { env } from "@/server/env";

/**
 * Local storage driver endpoint (development only).
 * Every request must carry a valid HMAC token scoped to the exact operation
 * and object — nothing is served unauthenticated even in dev.
 */

const BUCKETS = new Set(["originals", "derivatives", "print-assets", "renders", "exports"]);

function checkToken(
  request: Request,
  op: "read" | "write",
  bucket: string,
  key: string
): boolean {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return false;
  const payload = verifyToken(token);
  return payload?.scope === `${op}:${bucket}:${key}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bucket: string; key: string[] }> }
) {
  if (env().STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }
  const { bucket, key } = await params;
  const objectKey = key.map(decodeURIComponent).join("/");
  if (!BUCKETS.has(bucket) || !checkToken(request, "read", bucket, objectKey)) {
    return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
  }
  const driver = new LocalStorageDriver();
  try {
    const body = await driver.getObject(bucket as never, objectKey);
    const head = await driver.headObject(bucket as never, objectKey);
    const download = new URL(request.url).searchParams.get("download");
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": head?.contentType ?? "application/octet-stream",
        "cache-control": "private, max-age=300",
        "x-robots-tag": "noindex",
        ...(download
          ? { "content-disposition": `attachment; filename="${download.replace(/[^\w.\-]/g, "_")}"` }
          : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bucket: string; key: string[] }> }
) {
  if (env().STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }
  const { bucket, key } = await params;
  const objectKey = key.map(decodeURIComponent).join("/");
  if (!BUCKETS.has(bucket) || !checkToken(request, "write", bucket, objectKey)) {
    return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  const driver = new LocalStorageDriver();
  await driver.putObject(
    bucket as never,
    objectKey,
    body,
    request.headers.get("content-type") ?? "application/octet-stream"
  );
  return NextResponse.json({ ok: true });
}
