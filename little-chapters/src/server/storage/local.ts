import { promises as fs } from "fs";
import { dirname, join, normalize, sep } from "path";
import { env } from "@/server/env";
import { signToken } from "@/server/storage/signing";
import type {
  Bucket,
  SignedUploadTarget,
  StorageDriver,
} from "@/server/storage/driver";

/**
 * Filesystem storage driver for development.
 *
 * Objects live under STORAGE_LOCAL_DIR/{bucket}/{key}. "Signed URLs" point at
 * /api/dev-storage which verifies an HMAC token before reading/writing, so
 * even in development nothing is served unauthenticated.
 */

function baseDir(): string {
  return join(process.cwd(), env().STORAGE_LOCAL_DIR);
}

function objectPath(bucket: Bucket, key: string): string {
  const path = normalize(join(baseDir(), bucket, key));
  // path traversal guard: resolved path must stay inside the bucket dir
  const root = normalize(join(baseDir(), bucket)) + sep;
  if (!path.startsWith(root)) {
    throw new Error("Invalid storage key");
  }
  return path;
}

const CONTENT_TYPE_FILE = ".content-type";

export class LocalStorageDriver implements StorageDriver {
  name = "local";

  async createSignedUploadUrl(
    bucket: Bucket,
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<SignedUploadTarget> {
    const token = signToken({
      scope: `write:${bucket}:${key}`,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
    const url = `${env().NEXT_PUBLIC_APP_URL}/api/dev-storage/${bucket}/${encodeURIComponent(key)}?token=${encodeURIComponent(token)}`;
    return { url, headers: { "content-type": contentType }, method: "PUT" };
  }

  async createSignedReadUrl(
    bucket: Bucket,
    key: string,
    expiresInSeconds: number,
    downloadName?: string
  ): Promise<string> {
    const token = signToken({
      scope: `read:${bucket}:${key}`,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
    const dl = downloadName ? `&download=${encodeURIComponent(downloadName)}` : "";
    return `${env().NEXT_PUBLIC_APP_URL}/api/dev-storage/${bucket}/${encodeURIComponent(key)}?token=${encodeURIComponent(token)}${dl}`;
  }

  async putObject(
    bucket: Bucket,
    key: string,
    body: Buffer | Uint8Array,
    contentType: string
  ): Promise<void> {
    const path = objectPath(bucket, key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
    await fs.writeFile(path + CONTENT_TYPE_FILE, contentType, "utf8");
  }

  async getObject(bucket: Bucket, key: string): Promise<Buffer> {
    return fs.readFile(objectPath(bucket, key));
  }

  async headObject(
    bucket: Bucket,
    key: string
  ): Promise<{ sizeBytes: number; contentType: string | null } | null> {
    try {
      const path = objectPath(bucket, key);
      const stat = await fs.stat(path);
      let contentType: string | null = null;
      try {
        contentType = await fs.readFile(path + CONTENT_TYPE_FILE, "utf8");
      } catch {
        contentType = null;
      }
      return { sizeBytes: stat.size, contentType };
    } catch {
      return null;
    }
  }

  async deleteObject(bucket: Bucket, key: string): Promise<void> {
    try {
      await fs.unlink(objectPath(bucket, key));
      await fs.unlink(objectPath(bucket, key) + CONTENT_TYPE_FILE);
    } catch {
      // deleting a missing object is a no-op
    }
  }
}
