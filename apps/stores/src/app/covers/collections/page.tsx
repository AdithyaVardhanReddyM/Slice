import type { Metadata } from "next";
import { COVERS_COLLECTIONS } from "@/lib/covers/site";
import { CollectionTile } from "@/components/covers/blocks";

export const metadata: Metadata = {
  title: "Collections",
  description: "Small plates and natural wine, grand rooms, tasting menus, counter seats and more: lists of London restaurants our editors keep up to date.",
};

export default function CollectionsPage() {
  return (
    <main className="pb-24">
      <div className="border-b border-(--cv-line) bg-white">
        <div className="cv-container py-10 sm:py-12">
          <h1 className="cv-display text-[38px] sm:text-[52px]">Collections</h1>
          <p className="mt-3 max-w-2xl text-[18px] leading-relaxed text-(--cv-ink-soft)">
            Eight lists our editors keep up to date. Start with what you&apos;re in the mood for, then pick a time.
          </p>
        </div>
      </div>
      <div className="cv-container mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {COVERS_COLLECTIONS.map((c, i) => (
          <div key={c.id}>
            <CollectionTile c={c} lazy={i >= 4} />
            <p className="mt-3 hidden text-[15px] leading-snug text-(--cv-ink-soft) sm:block">{c.blurb}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
