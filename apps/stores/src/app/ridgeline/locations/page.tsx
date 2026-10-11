import type { Metadata } from "next";
import { CafeList } from "@/components/ridgeline/cafe-list";

export const metadata: Metadata = {
  title: "Locations",
  description: "Where to find Ridgeline Coffee Roasters: Portland, Seattle and, from November 2026, Austin. Addresses, hours and phone numbers.",
  alternates: { canonical: "/ridgeline/cafes" },
};

export default function LocationsPage() {
  return (
    <CafeList
      title="Locations"
      intro="Ridgeline Coffee Roasters is based at 2211 NE Alberta St, Portland, Oregon, where every bag is roasted. Our cafés are in Portland and Seattle, and the Austin café opens in November 2026."
    />
  );
}
