import type { CSSProperties } from "react";
import type { StatsSection } from "@slice/backend/convex/pagesTypes";
import { Shell } from "./ui";

export function Stats({ section }: { section: StatsSection }) {
  const cols = Math.min(Math.max(section.items.length, 2), 4);
  return (
    <Shell section={section} style={{ paddingBlock: "calc(var(--pg-pad) * 0.6)" }}>
      <div className="pg-container">
        <dl className="pg-stats" style={{ "--pg-stat-cols": String(cols), margin: 0 } as CSSProperties}>
          {section.items.map((s, i) => (
            <div key={i} className="pg-stat">
              <dd className="pg-stat-value" style={{ margin: 0 }}>
                {s.value}
              </dd>
              <dt className="pg-stat-label">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </Shell>
  );
}
