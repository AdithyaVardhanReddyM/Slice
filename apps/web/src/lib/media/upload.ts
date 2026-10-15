"use client";

// Uploads for Media: product shots, logos, reference photos, the merchant's own
// clips and music. Files go to Convex storage; with a campaign they also join
// its library (mediaAssets) so the agent and the studio can use them.

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";

export const MAX_UPLOAD_BYTES = { image: 15 * 1024 * 1024, video: 200 * 1024 * 1024, audio: 30 * 1024 * 1024 };

export type UploadKind = keyof typeof MAX_UPLOAD_BYTES;

export interface Uploaded {
  storageId: Id<"_storage">;
  kind: UploadKind;
  mime: string;
  name: string;
  w?: number;
  h?: number;
  duration?: number;
  /** Set when the file joined a campaign's library. */
  url?: string;
  assetId?: Id<"mediaAssets">;
}

export const kindOf = (mime: string): UploadKind | null => (mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : null);

/** Width, height and length, read in the browser so the agent knows the shape of each file. */
async function measure(file: File, kind: UploadKind): Promise<{ w?: number; h?: number; duration?: number }> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    }
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.src = url;
    await new Promise<void>((resolve) => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => resolve();
      setTimeout(resolve, 4000);
    });
    const v = el as HTMLVideoElement;
    return { duration: Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : undefined, ...(kind === "video" && v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : {}) };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useMediaUpload(campaignId?: Id<"mediaCampaigns">) {
  const uploadUrl = useMutation(api.media.uploadUrl);
  const addAsset = useMutation(api.media.addAsset);
  return useCallback(
    async (file: File, opts: { source?: string; accept?: UploadKind[] } = {}): Promise<Uploaded> => {
      const kind = kindOf(file.type);
      if (!kind || (opts.accept && !opts.accept.includes(kind))) throw new Error(`${file.name}: choose ${opts.accept?.join(" or ") ?? "an image, video or audio"} file`);
      if (file.size > MAX_UPLOAD_BYTES[kind]) throw new Error(`${file.name}: ${kind}s must be under ${MAX_UPLOAD_BYTES[kind] / 1024 / 1024} MB`);
      const [target, dims] = await Promise.all([uploadUrl({}), measure(file, kind)]);
      const res = await fetch(target, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const out: Uploaded = { storageId, kind, mime: file.type, name: file.name, ...dims };
      if (campaignId) {
        const { id, url } = await addAsset({ campaignId, asset: { storageId, kind, source: opts.source ?? "upload", mime: file.type, name: file.name, ...dims } });
        return { ...out, url, assetId: id };
      }
      return out;
    },
    [uploadUrl, addAsset, campaignId],
  );
}
