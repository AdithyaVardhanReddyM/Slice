/* eslint-disable @next/next/no-img-element */
import type { HeroSection } from "@slice/backend/convex/pagesTypes";
import { CtaLink, Eyebrow, Picture, Shell } from "./ui";

export function Hero({ section }: { section: HeroSection }) {
  const layout = section.image?.src ? section.layout : section.layout === "full" ? "centered" : section.layout;

  if (layout === "full") {
    return (
      <Shell section={section} className="pg-hero-full">
        <div className="pg-hero-media" aria-hidden>
          <img src={section.image!.src} alt="" fetchPriority="high" decoding="sync" />
        </div>
        <div className="pg-container">
          <div className="pg-hero-copy">
            {section.eyebrow ? <Eyebrow className="pg-rise">{section.eyebrow}</Eyebrow> : null}
            <h1 className="pg-h1 pg-rise pg-rise-2">{section.headline}</h1>
            {section.subheadline ? <p className="pg-lead pg-rise pg-rise-3">{section.subheadline}</p> : null}
            <div className="pg-hero-actions pg-rise pg-rise-4">
              <CtaLink cta={section.primaryCta} variant="inverse" />
              {section.secondaryCta ? <CtaLink cta={section.secondaryCta} variant="outline-light" arrow={false} /> : null}
            </div>
          </div>
        </div>
        {section.image?.credit ? <span className="pg-credit">{section.image.credit}</span> : null}
      </Shell>
    );
  }

  const copy = (
    <div className="pg-hero-copy">
      {section.eyebrow ? <Eyebrow className="pg-rise" plain={layout === "centered"}>{section.eyebrow}</Eyebrow> : null}
      <h1 className="pg-h1 pg-rise pg-rise-2">{section.headline}</h1>
      {section.subheadline ? <p className="pg-lead pg-rise pg-rise-3">{section.subheadline}</p> : null}
      <div className="pg-hero-actions pg-rise pg-rise-4">
        <CtaLink cta={section.primaryCta} />
        {section.secondaryCta ? <CtaLink cta={section.secondaryCta} variant="secondary" arrow={false} /> : null}
      </div>
    </div>
  );

  if (layout === "split") {
    return (
      <Shell section={section} className="pg-hero-split">
        <div className="pg-container">
          <div className="pg-hero-grid">
            {copy}
            <Picture image={section.image} priority zoom sizes="(min-width: 900px) 48vw, 100vw" />
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell section={section} className="pg-hero-centered">
      <div className="pg-container">
        {copy}
        {section.image?.src ? <Picture image={section.image} priority sizes="100vw" /> : null}
      </div>
    </Shell>
  );
}
