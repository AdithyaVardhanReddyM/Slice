"use client";

import { useMutation } from "convex/react";
import { X } from "lucide-react";
import { useCallback } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/console/setup/atoms";

/** An image the merchant attached to a builder message; lives in Convex storage. */
export interface Attachment {
  url: string;
  name: string;
  type: string;
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Uploads a file to Convex storage and returns its public URL. */
export function useAttachmentUpload() {
  const uploadUrl = useMutation(api.pages.attachmentUploadUrl);
  const resolve = useMutation(api.pages.attachmentUrl);
  return useCallback(
    async (file: File): Promise<Attachment> => {
      if (!file.type.startsWith("image/")) throw new Error("Only images can be attached");
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Images must be under 8 MB");
      const target = await uploadUrl({});
      const res = await fetch(target, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const url = await resolve({ storageId });
      if (!url) throw new Error("Upload failed");
      return { url, name: file.name, type: file.type };
    },
    [uploadUrl, resolve],
  );
}

/** Thumbnails of attached images, with a remove button while composing. */
export function AttachmentStrip({
  items,
  onRemove,
  className,
  size = "md",
}: {
  items: (Attachment & { pending?: boolean; error?: string; preview?: string })[];
  onRemove?: (index: number) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  if (items.length === 0) return null;
  const box = size === "sm" ? "size-12" : "size-16";
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((a, i) => (
        <div key={`${a.url || a.preview}-${i}`} className={cn("group relative shrink-0 overflow-hidden rounded-lg border bg-muted", box)} title={a.error ?? a.name}>
          {/* Merchant uploads live in Convex storage; next/image would need the host allow-listed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.preview || a.url} alt={a.name} className={cn("size-full object-cover", (a.pending || a.error) && "opacity-50")} />
          {a.pending && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner className="size-4" />
            </span>
          )}
          {a.error && <span className="absolute inset-x-0 bottom-0 bg-destructive/90 px-1 text-[10px] leading-4 text-white">Failed</span>}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${a.name}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemove(i)}
              className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
