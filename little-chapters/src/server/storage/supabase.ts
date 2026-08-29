import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/server/env";
import type {
  Bucket,
  SignedUploadTarget,
  StorageDriver,
} from "@/server/storage/driver";

/**
 * Supabase Storage driver (production). All buckets must be created private —
 * see docs/INTEGRATIONS.md §1. Signed URLs are minted with the service role
 * only after the caller has passed the authz layer.
 */
export class SupabaseStorageDriver implements StorageDriver {
  name = "supabase";
  private client: SupabaseClient;

  constructor() {
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Supabase storage driver requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    this.client = createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }

  async createSignedUploadUrl(
    bucket: Bucket,
    key: string,
    contentType: string,
    _expiresInSeconds: number
  ): Promise<SignedUploadTarget> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUploadUrl(key);
    if (error || !data) {
      throw new Error(`Failed to create upload URL: ${error?.message}`);
    }
    return {
      url: data.signedUrl,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${data.token}`,
        "x-upsert": "false",
      },
      method: "PUT",
    };
  }

  async createSignedReadUrl(
    bucket: Bucket,
    key: string,
    expiresInSeconds: number,
    downloadName?: string
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(key, expiresInSeconds, {
        download: downloadName ?? undefined,
      });
    if (error || !data) {
      throw new Error(`Failed to sign read URL: ${error?.message}`);
    }
    return data.signedUrl;
  }

  async putObject(
    bucket: Bucket,
    key: string,
    body: Buffer | Uint8Array,
    contentType: string
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async getObject(bucket: Bucket, key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(bucket).download(key);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async headObject(
    bucket: Bucket,
    key: string
  ): Promise<{ sizeBytes: number; contentType: string | null } | null> {
    const { data, error } = await this.client.storage.from(bucket).info(key);
    if (error || !data) return null;
    return {
      sizeBytes: data.size ?? 0,
      contentType: data.contentType ?? null,
    };
  }

  async deleteObject(bucket: Bucket, key: string): Promise<void> {
    await this.client.storage.from(bucket).remove([key]);
  }
}
