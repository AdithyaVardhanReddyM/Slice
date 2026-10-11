import type { FaqSection } from "@slice/backend/convex/pagesTypes";
import { Eyebrow, Shell } from "./ui";

export function Faq({ section }: { section: FaqSection }) {
  return (
    <Shell section={section}>
      <div className="pg-container">
        <div className="pg-faq-grid">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="pg-h2" style={{ marginTop: 14 }}>
              {section.headline ?? "Good to know"}
            </h2>
          </div>
          <div>
            {section.items.map((item, i) => (
              <details key={i} className="pg-faq" open={i === 0}>
                <summary>
                  <span>{item.q}</span>
                  <span className="pg-plus" aria-hidden>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M6 1v10M1 6h10" />
                    </svg>
                  </span>
                </summary>
                <div className="pg-faq-a">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
