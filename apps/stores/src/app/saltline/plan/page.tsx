import type { Metadata } from "next";
import { openHotels } from "@/lib/saltline";
import { PlanForm } from "@/components/saltline/plan-form";

export const metadata: Metadata = {
  title: "Plan your stay",
  description: "Tell us where, when and what you love, and the team at the hotel will reply with availability and a plan for your days.",
};

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function PlanPage({ searchParams }: PageProps<"/saltline/plan">) {
  const sp = await searchParams;
  const defaults = { hotel: str(sp.hotel), room: str(sp.room), interest: str(sp.interest), offer: str(sp.offer) };
  return (
    <main className="sl-container grid gap-12 py-10 lg:grid-cols-[1fr_1.5fr] lg:gap-20 lg:py-14">
      <div>
        <h1 className="sl-serif text-[48px] sm:text-[60px]">Plan your stay</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-sl-charcoal-soft">
          Tell us roughly when, who is coming and what you like doing, and the team at the hotel will write back with
          availability, a room we think suits you and two or three days&apos; worth of ideas. You can also call or email any hotel directly.
        </p>
        <ul className="mt-8 space-y-4 border-t border-sl-line pt-6 text-[15px]">
          {openHotels.map((h) => (
            <li key={h.slug}>
              <p className="font-medium">{h.name}</p>
              <p className="text-sl-charcoal-soft">{h.phone} · {h.email}</p>
            </li>
          ))}
        </ul>
      </div>
      <PlanForm defaults={defaults} />
    </main>
  );
}
