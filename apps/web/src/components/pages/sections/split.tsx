import type { SplitSection } from "@slice/backend/convex/pagesTypes";
import { CtaLink, Eyebrow, Picture, Shell } from "./ui";

export function Split({ section }: { section: SplitSection }) {
  return (
    <Shell section={section}>
      <div className="pg-container">
        <div className={`pg-split-grid${section.imageSide === "right" ? " pg-flip" : ""}`}>
          <Picture image={section.image} zoom sizes="(min-width: 900px) 50vw, 100vw" />
          <div className="pg-split-copy">
            {section.eyebrow ? <Eyebrow>{section.eyebrow}</Eyebrow> : null}
            <h2 className="pg-h2">{section.headline}</h2>
            <p className="pg-body">{section.body}</p>
            {section.bullets?.length ? (
              <ul className="pg-bullets">
                {section.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : null}
            {section.cta ? (
              <div style={{ marginTop: 32 }}>
                <CtaLink cta={section.cta} variant="contrast" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}
