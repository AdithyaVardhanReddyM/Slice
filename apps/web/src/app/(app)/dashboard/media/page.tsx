import type { Metadata } from "next";
import { Film, ImageIcon, Mail } from "lucide-react";
import { ServicePlaceholder } from "@/components/console/services/placeholder";
import { serviceMeta } from "@/lib/services";

export const metadata: Metadata = { title: "Media" };

export default function MediaPage() {
  return (
    <ServicePlaceholder
      service={serviceMeta("media")}
      capabilities={[
        {
          icon: ImageIcon,
          title: "Posters and static creative",
          body: "Campaign visuals regenerated per taste cluster: different hero, palette and tone.",
        },
        {
          icon: Film,
          title: "Short video",
          body: "Cut-downs that open on the product and setting each audience is most likely to stop for.",
        },
        {
          icon: Mail,
          title: "Email and ad variants",
          body: "Subject lines, images and picks for each segment, exported to your sending tools.",
        },
      ]}
      signals={[
        {
          title: "Taste cluster",
          body: "Audience archetypes from Qloo's taste graph, chosen per campaign.",
        },
        {
          title: "Location",
          body: "A version per market or city, with local references drawn from Qloo.",
        },
        {
          title: "Campaign brief",
          body: "One brief, one asset per channel and audience.",
        },
        {
          title: "Your assets",
          body: "Brand kit, product shots and copy you upload for the campaign.",
        },
      ]}
    />
  );
}
