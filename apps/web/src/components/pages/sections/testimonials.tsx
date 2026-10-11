import type { TestimonialsSection } from "@slice/backend/convex/pagesTypes";
import { SectionHead, Shell, initials } from "./ui";

export function Testimonials({ section }: { section: TestimonialsSection }) {
  return (
    <Shell section={section}>
      <div className="pg-container">
        <SectionHead headline={section.headline} align="center" />
        <div className="pg-quotes">
          {section.quotes.map((q, i) => (
            <figure key={i} className="pg-quote" style={{ margin: 0 }}>
              <blockquote className="pg-quote-text">{q.text}</blockquote>
              <figcaption className="pg-quote-by">
                <span className="pg-avatar" aria-hidden>
                  {initials(q.name)}
                </span>
                <div>
                  <b>{q.name}</b>
                  {q.detail ? (
                    <>
                      <br />
                      <span>{q.detail}</span>
                    </>
                  ) : null}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Shell>
  );
}
