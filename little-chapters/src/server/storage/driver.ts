/**
 * Storage driver abstraction.
 *
 * All buckets are private. Objects are addressed by (bucket, key); the rest
 * of the application only ever handles storage_objects ids and asks this
 * layer for short-lived signed URLs after an authorization check.
 */

export type Bucket =
  | "originals"
  | "derivatives"
  | "print-assets"
  | "renders"
  | "exports";

export interface SignedUploadTarget {
  /** URL the client PUTs the file to */
  url: string;
  /** extra headers the client must send */
  headers: Record<string, string>;
  /** how the server later verifies/completes (driver-specific) */
  method: "PUT";
}

export interface StorageDriver {
  name: string;
  /** Signed target for a direct client upload. TTL is short (minutes). */
  createSignedUploadUrl(
    bucket: Bucket,
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<SignedUploadTarget>;
  /** Short-lived signed read URL. */
  createSignedReadUrl(
    bucket: Bucket,
    key: string,
    expiresInSeconds: number,
    downloadName?: string
  ): Promise<string>;
  /** Server-side write (worker derivatives, renders, exports). */
  putObject(
    bucket: Bucket,
    key: string,
    body: Buffer | Uint8Array,
    contentType: string
  ): Promise<void>;
  getObject(bucket: Bucket, key: string): Promise<Buffer>;
  headObject(
    bucket: Bucket,
    key: string
  ): Promise<{ sizeBytes: number; contentType: string | null } | null>;
  deleteObject(bucket: Bucket, key: string): Promise<void>;
}
