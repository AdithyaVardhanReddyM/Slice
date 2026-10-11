// The three services a business can subscribe to. They are independent:
// each has its own clients, data and setup, so nothing has to be kept in
// sync across them. Client-safe: no mock catalog imports.

import { Clapperboard, LayoutTemplate, MessagesSquare } from "lucide-react";
import type { ComponentType } from "react";

export type ServiceId = "concierge" | "pages" | "media";

export interface ServiceMeta {
  id: ServiceId;
  label: string;
  /** Route: /dashboard/<segment>. */
  segment: string;
  icon: ComponentType<{ className?: string }>;
  /** False while the service is only a placeholder in the console. */
  available: boolean;
  /** What a client of this service is called in the console. */
  clientNoun: string;
  tagline: string;
  description: string;
}

export const SERVICES: ServiceMeta[] = [
  {
    id: "concierge",
    label: "Concierge",
    segment: "concierge",
    icon: MessagesSquare,
    available: true,
    clientNoun: "widget",
    tagline: "A shopping assistant that knows each visitor's taste.",
    description:
      "An embeddable widget for storefronts. Shoppers answer a few taste questions, then get picks from the store's own catalog ranked by what they're into.",
  },
  {
    id: "pages",
    label: "Pages",
    segment: "pages",
    icon: LayoutTemplate,
    available: true,
    clientNoun: "brand",
    tagline: "Landing, sales and funnel pages that adapt to the visitor.",
    description:
      "One page, many versions. Headlines, imagery, featured offers and calls to action change with the visitor's taste profile, location and campaign.",
  },
  {
    id: "media",
    label: "Media",
    segment: "media",
    icon: Clapperboard,
    available: false,
    clientNoun: "campaign",
    tagline: "Posters, creatives and short video, personalised per audience.",
    description:
      "Generate variants of campaign assets for each taste cluster, export them to ads and email, and see which ones land.",
  },
];

export const serviceMeta = (id: ServiceId) =>
  SERVICES.find((s) => s.id === id)!;
