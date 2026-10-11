import type { GridItem, GridSection } from "@slice/backend/convex/pagesTypes";
import { Arrow, CtaLink, Picture, SectionHead, Shell } from "./ui";

function Card({ item }: { item: GridItem }) {
  const inner = (
    <>
      <div style={{ position: "relative" }}>
        {item.badge ? <span className="pg-badge">{item.badge}</span> : null}
        <Picture image={item.image} sizes="(min-width: 1100px) 25vw, (min-width: 760px) 33vw, 50vw" credit={false} />
      </div>
      <div className="pg-card-body">
        <div className="pg-card-row">
          <h3 className="pg-card-title">{item.title}</h3>
          {item.price ? <span className="pg-card-price pg-num">{item.price}</span> : null}
        </div>
        {item.description ? <p className="pg-card-desc">{item.description}</p> : null}
        {item.href ? (
          <span className="pg-card-cta">
            View <Arrow />
          </span>
        ) : null}
      </div>
    </>
  );
  return item.href ? (
    <a href={item.href} className="pg-card" data-item={item.id} data-cta={`grid:${item.title}`}>
      {inner}
    </a>
  ) : (
    <article className="pg-card" data-item={item.id}>
      {inner}
    </article>
  );
}

export function Grid({ section }: { section: GridSection }) {
  const cols = section.columns ?? 3;
  return (
    <Shell section={section}>
      <div className="pg-container">
        <SectionHead eyebrow={section.eyebrow} headline={section.headline} intro={section.intro} row />
        <div className={`pg-grid pg-grid-${cols}`}>
          {section.items.map((item, i) => (
            <Card key={item.id ?? `${i}-${item.title}`} item={item} />
          ))}
        </div>
        {section.cta ? (
          <div style={{ marginTop: "calc(var(--pg-gap) * 1.6)", display: "flex", justifyContent: "center" }}>
            <CtaLink cta={section.cta} variant="secondary" />
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
