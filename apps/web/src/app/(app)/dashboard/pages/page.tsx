import type { Metadata } from "next";
import { Megaphone, PanelsTopLeft, Route } from "lucide-react";
import { ServicePlaceholder } from "@/components/console/services/placeholder";
import { serviceMeta } from "@/lib/services";

export const metadata: Metadata = { title: "Pages" };

export default function PagesPage() {
  return (
    <ServicePlaceholder
      service={serviceMeta("pages")}
      capabilities={[
        {
          icon: PanelsTopLeft,
          title: "Landing pages",
          body: "A campaign page whose hero, copy and featured offers change with who's looking.",
        },
        {
          icon: Megaphone,
          title: "Sales pages",
          body: "Long-form offers that lead with the angle each taste cluster responds to.",
        },
        {
          icon: Route,
          title: "Funnels",
          body: "Multi-step flows where every step reads the profile the previous one built.",
        },
      ]}
      signals={[
        {
          title: "Lead taste profile",
          body: "Tastes you already know about a lead, passed in with the link or matched from your CRM.",
        },
        {
          title: "Location",
          body: "City-level taste from Qloo, so a visitor in Austin and one in London see different leads.",
        },
        {
          title: "Campaign",
          body: "UTM, ad set or referrer, for a version per channel.",
        },
        {
          title: "On-page questions",
          body: "A short taste quiz on the page itself, for visitors you know nothing about yet.",
        },
      ]}
    />
  );
}
