"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

/**
 * Resilient multi-file uploader: admission → direct PUT → completion, with
 * per-file progress, retry, and mobile camera-roll friendly input. Large
 * batches upload with limited concurrency so phones stay responsive.
 */

export interface UploadedItem {
  mediaId: string;
  filename: string;
  kind: "photo" | "video" | "audio";
}

interface FileState {
  file: File;
  status: "queued" | "uploading" | "processing" | "done" | "error";
  progress: number;
  mediaId?: string;
  error?: string;
}

const CONCURRENCY = 3;

export function Uploader({
  familyId,
  childId,
  onUploaded,
  accept = "image/*,video/*",
  label = "Add photos & videos",
}: {
  familyId: string;
  childId?: string | null;
  onUploaded?: (items: UploadedItem[]) => void;
  accept?: string;
  label?: string;
}) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const completedRef = useRef<UploadedItem[]>([]);

  const updateFile = useCallback((file: File, patch: Partial<FileState>) => {
    setFiles((prev) => prev.map((f) => (f.file === file ? { ...f, ...patch } : f)));
  }, []);

  const uploadOne = useCallback(
    async (file: File): Promise<void> => {
      updateFile(file, { status: "uploading", progress: 0.02, error: undefined });
      try {
        const admission = await fetch("/api/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            familyId,
            childId: childId ?? null,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
          }),
        });
        if (!admission.ok) {
          const data = (await admission.json().catch(() => null)) as
            | { error?: { message?: string } } | null;
          throw new Error(data?.error?.message ?? "Upload couldn't start");
        }
        const target = (await admission.json()) as {
          mediaId: string;
          uploadUrl: string;
          headers: Record<string, string>;
        };
        updateFile(file, { mediaId: target.mediaId, progress: 0.05 });

        // XHR gives us real progress events
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", target.uploadUrl);
          for (const [k, v] of Object.entries(target.headers)) {
            xhr.setRequestHeader(k, v);
          }
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              updateFile(file, { progress: 0.05 + (e.loaded / e.total) * 0.85 });
            }
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error("Upload interrupted"));
          xhr.onerror = () => reject(new Error("Upload interrupted"));
          xhr.send(file);
        });

        updateFile(file, { status: "processing", progress: 0.95 });
        const complete = await fetch(`/api/uploads/${target.mediaId}/complete`, {
          method: "POST",
        });
        if (!complete.ok) throw new Error("Couldn't finish the upload — retry");
        updateFile(file, { status: "done", progress: 1 });
        const kind = file.type.startsWith("video/")
          ? ("video" as const)
          : file.type.startsWith("audio/")
            ? ("audio" as const)
            : ("photo" as const);
        completedRef.current.push({ mediaId: target.mediaId, filename: file.name, kind });
        onUploaded?.(completedRef.current.slice());
      } catch (err) {
        updateFile(file, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [familyId, childId, onUploaded, updateFile]
  );

  const startUploads = useCallback(
    (incoming: File[]) => {
      const fresh: FileState[] = incoming.map((file) => ({
        file, status: "queued", progress: 0,
      }));
      setFiles((prev) => [...prev, ...fresh]);
      // limited-concurrency queue
      let index = 0;
      const next = async (): Promise<void> => {
        const i = index++;
        const item = fresh[i];
        if (!item) return;
        await uploadOne(item.file);
        return next();
      };
      for (let i = 0; i < CONCURRENCY; i++) void next();
    },
    [uploadOne]
  );

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          startUploads(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "w-full rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-clay-500 bg-clay-400/10"
            : "border-sand-200 bg-white hover:border-sand-300"
        )}
      >
        <p className="text-ink-600 font-medium">{label}</p>
        <p className="text-sm text-ink-300 mt-1">
          Tap to choose, or drop files here · JPG, PNG, HEIC, MP4, MOV
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) startUploads(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      {files.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {files.map((f, i) => (
            <li key={i} className="lc-card px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-600 truncate">{f.file.name}</p>
                <p className="text-xs text-ink-300">
                  {formatBytes(f.file.size)}
                  {f.status === "error" ? ` · ${f.error}` : ""}
                  {f.status === "processing" ? " · finishing…" : ""}
                  {f.status === "done" ? " · added" : ""}
                </p>
                {(f.status === "uploading" || f.status === "processing") && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-sand-100 overflow-hidden">
                    <div
                      className="h-full bg-clay-500 transition-all"
                      style={{ width: `${Math.round(f.progress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {f.status === "error" ? (
                <button
                  type="button"
                  onClick={() => void uploadOne(f.file)}
                  className="text-sm font-medium text-clay-600 hover:text-clay-700 shrink-0"
                >
                  Retry
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
