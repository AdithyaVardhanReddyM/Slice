import type { CustomSection } from "@slice/backend/convex/pagesTypes";
import { sanitizeHtml } from "./sanitize";
import { Shell } from "./ui";

export function Custom({ section }: { section: CustomSection }) {
  return (
    <Shell section={section}>
      <div className="pg-container">
        <div className="pg-custom" dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }} />
      </div>
    </Shell>
  );
}
