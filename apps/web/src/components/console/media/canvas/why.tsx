"use client";

// The Why button on a poster, video or generated image or clip: opens the Why
// modal (why/dialog.tsx), which explains every choice in it and how its
// audience's Qloo taste shaped it.

import { Lightbulb } from "lucide-react";
import { useState } from "react";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import { creativeName } from "@slice/backend/convex/mediaTypes";
import { WhyDialog } from "../why/dialog";
import type { WhySubject } from "../why/preview";
import { nameFromPrompt } from "./model";

function subjectOf(creative: Doc<"mediaCreatives"> | undefined, asset: Doc<"mediaAssets"> | undefined, name: string | undefined): WhySubject | null {
  if (creative) return { kind: creative.kind === "video" ? "video" : "poster", id: creative._id, name: name ?? creativeName(creative.name), creative };
  // Uploads and library photos were picked by the merchant, not made for a taste.
  if (!asset || asset.source !== "generated" || (asset.kind !== "image" && asset.kind !== "video")) return null;
  const kind = asset.kind === "video" ? "clip" : "image";
  return { kind, id: asset._id, name: name ?? asset.name ?? nameFromPrompt(asset.prompt, kind === "clip" ? "Clip" : "Image"), asset };
}

export function WhyButton({ creative, asset, name, className }: { creative?: Doc<"mediaCreatives">; asset?: Doc<"mediaAssets">; name?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const subject = subjectOf(creative, asset, name);
  if (!subject) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        title="Why it looks like this, and how its audience's taste shaped it"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Lightbulb />
        <span>Why</span>
      </button>
      {mounted && <WhyDialog subject={subject} open={open} onOpenChange={setOpen} />}
    </>
  );
}
