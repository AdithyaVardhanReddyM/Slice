"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/console/primitives";
import { ConsolePage } from "@/components/console/shell-ui";
import { useEmailBrand } from "../brand-context";
import { BrandEditor, type BrandTab } from "./brand-editor";

const TABS = new Set<BrandTab>(["identity", "voice", "about", "footer", "sender", "items"]);

function KitEditor() {
  const brand = useEmailBrand();
  // Links like "Add what you sell" open a tab directly (?tab=items).
  const tab = useSearchParams().get("tab") as BrandTab | null;
  return <BrandEditor key={brand._id} brand={brand} withItems defaultTab={tab && TABS.has(tab) ? tab : "identity"} saveLabel="Save changes" />;
}

/** The kit setup reviewed, for a brand that is already sending: the same tabs, plus the catalog. */
export function EmailKitPage() {
  return (
    <ConsolePage>
      <PageHeader
        title="Brand kit"
        description="Logo, colours, type, voice, footer and catalog. New campaigns start from it; the logo and footer update in every email."
      />
      <Suspense>
        <KitEditor />
      </Suspense>
    </ConsolePage>
  );
}
