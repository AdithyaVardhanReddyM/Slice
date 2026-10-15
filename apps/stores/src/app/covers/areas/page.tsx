import type { Metadata } from "next";
import { COVERS_AREAS } from "@/lib/covers/site";
import { AreaRow } from "@/components/covers/blocks";

export const metadata: Metadata = {
  title: "Areas",
  description: "Restaurants to book across London, from Shoreditch and Soho to Mayfair, Marylebone, Notting Hill and south of the river.",
};

export default function AreasPage() {
  return (
    <main className="pb-24">
      <div className="border-b border-(--cv-line) bg-white">
        <div className="cv-container py-10 sm:py-12">
          <h1 className="cv-display text-[38px] sm:text-[52px]">Areas</h1>
          <p className="mt-3 max-w-2xl text-[18px] leading-relaxed text-(--cv-ink-soft)">Eight parts of London and the restaurants in each that we&apos;d cross town for.</p>
        </div>
      </div>
      <div className="cv-container mt-8 grid gap-x-8 gap-y-2 md:grid-cols-2">
        {COVERS_AREAS.map((a) => (
          <AreaRow key={a.id} a={a} className="-mx-2" />
        ))}
      </div>
    </main>
  );
}
