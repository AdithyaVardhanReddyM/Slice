import type { Section } from "@slice/backend/convex/pagesTypes";
import { Hero } from "./hero";
import { Split } from "./split";
import { Grid } from "./grid";
import { Story } from "./story";
import { Gallery } from "./gallery";
import { Testimonials } from "./testimonials";
import { Stats } from "./stats";
import { Faq } from "./faq";
import { Offer } from "./offer";
import { Locations } from "./locations";
import { Culture } from "./culture";
import { Form } from "./form";
import { CtaBand } from "./cta";
import { Custom } from "./custom";

export function renderSection(section: Section) {
  switch (section.type) {
    case "hero":
      return <Hero key={section.id} section={section} />;
    case "split":
      return <Split key={section.id} section={section} />;
    case "grid":
      return <Grid key={section.id} section={section} />;
    case "story":
      return <Story key={section.id} section={section} />;
    case "gallery":
      return <Gallery key={section.id} section={section} />;
    case "testimonials":
      return <Testimonials key={section.id} section={section} />;
    case "stats":
      return <Stats key={section.id} section={section} />;
    case "faq":
      return <Faq key={section.id} section={section} />;
    case "offer":
      return <Offer key={section.id} section={section} />;
    case "locations":
      return <Locations key={section.id} section={section} />;
    case "culture":
      return <Culture key={section.id} section={section} />;
    case "form":
      return <Form key={section.id} section={section} />;
    case "cta":
      return <CtaBand key={section.id} section={section} />;
    case "custom":
      return <Custom key={section.id} section={section} />;
    default:
      return null;
  }
}
