import type { LocationsSection } from "@slice/backend/convex/pagesTypes";
import { CtaLink, Picture, SectionHead, Shell } from "./ui";

export function Locations({ section }: { section: LocationsSection }) {
  // With images: a card grid. Without any image: a static list, one row per place.
  const withImages = section.places.some((p) => p.image?.src);
  return (
    <Shell section={section}>
      <div className="pg-container">
        <SectionHead eyebrow="Find us" headline={section.headline} intro={section.intro} row />
        <div className={withImages ? "pg-places" : "pg-place-list"}>
          {section.places.map((place, i) => (
            <article key={`${i}-${place.name}`} className="pg-place">
              {withImages ? (
                <>
                  <Picture image={place.image} zoom sizes="(min-width: 800px) 33vw, 100vw" credit={false} />
                  <div>
                    <div className="pg-place-head">
                      <h3 className="pg-place-name">{place.name}</h3>
                      <span className="pg-place-index pg-num">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    {place.kind ? <div className="pg-place-kind">{place.kind}</div> : null}
                    {place.address ? <p className="pg-place-address" style={{ marginTop: 10 }}>{place.address}</p> : null}
                    {place.detail ? <p className="pg-place-detail" style={{ marginTop: 8 }}>{place.detail}</p> : null}
                  </div>
                </>
              ) : (
                <>
                  <span className="pg-place-index pg-num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="pg-place-name">{place.name}</h3>
                    {place.kind ? <div className="pg-place-kind">{place.kind}</div> : null}
                  </div>
                  <p className="pg-place-address" style={{ margin: 0 }}>{place.address ?? ""}</p>
                  <p className="pg-place-detail" style={{ margin: 0 }}>{place.detail ?? ""}</p>
                </>
              )}
            </article>
          ))}
        </div>
        {section.cta ? (
          <div style={{ marginTop: "calc(var(--pg-gap) * 1.4)" }}>
            <CtaLink cta={section.cta} variant="secondary" />
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
