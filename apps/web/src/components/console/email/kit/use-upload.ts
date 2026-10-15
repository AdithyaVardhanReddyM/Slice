"use client";

import { useCallback } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Uploads an image (logo, icon, item cover) to Convex storage and returns its public URL. */
export function useImageUpload() {
  const convex = useConvex();
  const uploadUrl = useMutation(api.emailBrands.uploadUrl);
  return useCallback(
    async (file: File): Promise<string> => {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
      if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be under 8 MB");
      const target = await uploadUrl({});
      const res = await fetch(target, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const url = await convex.query(api.emailBrands.fileUrl, { storageId });
      if (!url) throw new Error("Upload failed");
      return url;
    },
    [convex, uploadUrl],
  );
}
