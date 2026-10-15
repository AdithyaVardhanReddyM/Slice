"use client";

import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { useImageUpload } from "./use-upload";

/** A file picker as a button: uploads the image to Convex storage and hands back its URL. Errors show under it. */
export function UploadImage({ label, onUploaded, variant = "outline" }: { label: string; onUploaded: (url: string) => void; variant?: "outline" | "default" }) {
  const upload = useImageUpload();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            onUploaded(await upload(file));
          } catch (err) {
            setError(String((err as Error).message ?? err));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button type="button" variant={variant} size="sm" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Spinner data-icon="inline-start" /> : <ImageUp data-icon="inline-start" />}
        {label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
