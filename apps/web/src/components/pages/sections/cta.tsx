import type { CtaSection } from "@slice/backend/convex/pagesTypes";
import { CtaLink, Shell } from "./ui";

export function CtaBand({ section }: { section: CtaSection }) {
  const theme = section.theme ?? "light";
  const primary = theme === "dark" || theme === "accent" ? "contrast" : "primary";
  return (
    <Shell section={section}>
      <div className="pg-container">
        <div className="pg-cta-band">
          <div>
            <h2 className="pg-h2">{section.headline}</h2>
            {section.body ? <p className="pg-lead">{section.body}</p> : null}
          </div>
          <div className="pg-cta-actions">
            <CtaLink cta={section.cta} variant={primary} />
            {section.secondary ? <CtaLink cta={section.secondary} variant="secondary" arrow={false} /> : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}
