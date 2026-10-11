import type { StorySection } from "@slice/backend/convex/pagesTypes";
import { Eyebrow, Picture, Shell } from "./ui";

export function Story({ section }: { section: StorySection }) {
  const hasImage = Boolean(section.image?.src);
  return (
    <Shell section={section}>
      <div className="pg-container">
        <div className="pg-story-grid" style={hasImage ? undefined : { gridTemplateColumns: "minmax(0, 1fr)", maxWidth: 820 }}>
          {hasImage ? (
            <aside className="pg-story-aside">
              <Picture image={section.image} zoom sizes="(min-width: 960px) 40vw, 100vw" />
            </aside>
          ) : null}
          <div className="pg-story-body">
            {section.eyebrow ? (
              <div style={{ marginBottom: 18 }}>
                <Eyebrow>{section.eyebrow}</Eyebrow>
              </div>
            ) : null}
            <h2 className="pg-h2">{section.headline}</h2>
            <div className="pg-prose pg-body">
              {section.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {section.pullQuote ? <blockquote className="pg-pullquote">{section.pullQuote}</blockquote> : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}
