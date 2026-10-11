import type { Metadata } from "next";
import { CafeList } from "@/components/ridgeline/cafe-list";

export const metadata: Metadata = {
  title: "Cafés",
  description: "Ridgeline cafés in Portland (2211 NE Alberta St) and Seattle (1521 12th Ave), with Austin (1900 E 6th St) opening November 2026. Hours and addresses.",
};

export default function CafesPage() {
  return (
    <CafeList
      title="Cafés"
      intro="Two cafés in the Northwest and a third on the way. Every café pours the full range, sells every current bag and runs free cuppings on the first Saturday of the month."
    />
  );
}
