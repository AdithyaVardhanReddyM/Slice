"use client";

import { PageHeader } from "@/components/console/primitives";
import { useBrand } from "./brand-context";
import { BrandReview } from "./new-brand-flow";
import { StatusBadge } from "./shared";

/** The same review editor as onboarding, for a brand that is already set up. */
export function BrandKitPage() {
  const brand = useBrand();
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Brand kit"
        description="Palette, type, logo, voice and the brief the builder works from. Changes apply to versions generated from now on."
        actions={<StatusBadge status={brand.status} />}
      />
      <BrandReview key={brand._id} brand={brand} saveLabel="Save changes" />
    </div>
  );
}
