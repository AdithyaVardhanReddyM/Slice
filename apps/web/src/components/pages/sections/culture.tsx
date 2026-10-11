/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import type { CultureSection } from "@slice/backend/convex/pagesTypes";
import { SectionHead, Shell, initials } from "./ui";

const KIND_LABEL: Record<CultureSection["items"][number]["kind"], string> = {
  artist: "Artist",
  film: "Film",
  place: "Place",
  brand: "Brand",
  book: "Book",
  show: "Series",
};

export function Culture({ section }: { section: CultureSection }) {
  const n = section.items.length;
  const cols = n >= 6 ? 6 : n === 5 ? 5 : n === 4 ? 4 : 3;
  return (
    <Shell section={section}>
      <div className="pg-container">
        <SectionHead eyebrow={section.eyebrow} headline={section.headline} intro={section.intro} row />
        <div className="pg-culture" style={{ "--pg-culture-cols": String(cols) } as CSSProperties}>
          {section.items.map((item, i) => (
            <div key={`${i}-${item.name}`} className="pg-culture-item">
              <div className="pg-culture-img">
                {item.image ? (
                  <img src={item.image} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="pg-culture-initial" aria-hidden>
                    {initials(item.name)}
                  </span>
                )}
              </div>
              <div>
                <div className="pg-culture-kind">{KIND_LABEL[item.kind] ?? item.kind}</div>
                <div className="pg-culture-name">{item.name}</div>
                {item.note ? <div className="pg-culture-note">{item.note}</div> : null}
              </div>
            </div>
          ))}
        </div>
        {section.footnote ? <p className="pg-footnote">{section.footnote}</p> : null}
      </div>
    </Shell>
  );
}
