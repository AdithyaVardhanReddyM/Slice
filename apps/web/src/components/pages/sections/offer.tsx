import type { OfferSection } from "@slice/backend/convex/pagesTypes";
import { CtaLink, Eyebrow, Picture, Shell } from "./ui";

export function Offer({ section }: { section: OfferSection }) {
  const hasImage = Boolean(section.image?.src);
  return (
    <Shell section={section}>
      <div className="pg-container">
        <div className={`pg-offer${hasImage ? " pg-offer-media" : ""}`}>
          <div className="pg-offer-copy">
            {section.eyebrow ? <Eyebrow>{section.eyebrow}</Eyebrow> : null}
            <h2 className="pg-h2">{section.headline}</h2>
            <p className="pg-body" style={{ margin: 0 }}>
              {section.body}
            </p>
            {section.price ? (
              <div className="pg-price">
                <span className="pg-price-now">{section.price}</span>
                {section.was ? <span className="pg-price-was">{section.was}</span> : null}
              </div>
            ) : null}
            {section.perks?.length ? (
              <ul className="pg-perks">
                {section.perks.map((p, i) => (
                  <li key={i}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginTop: 6 }}>
              <CtaLink cta={section.cta} />
              {section.deadline ? <span className="pg-deadline">{section.deadline}</span> : null}
            </div>
          </div>
          {hasImage ? <Picture image={section.image} sizes="(min-width: 900px) 45vw, 100vw" /> : null}
        </div>
      </div>
    </Shell>
  );
}
