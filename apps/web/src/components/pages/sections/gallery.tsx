import type { GallerySection } from "@slice/backend/convex/pagesTypes";
import { Picture, SectionHead, Shell } from "./ui";

export function Gallery({ section }: { section: GallerySection }) {
  const layout = section.layout ?? "grid";
  const frames = section.images.map((img, i) => (
    <Picture key={`${i}-${img.src}`} image={img} zoom sizes="(min-width: 760px) 33vw, 50vw" />
  ));

  if (layout === "strip") {
    return (
      <Shell section={section}>
        {section.headline ? (
          <div className="pg-container">
            <SectionHead headline={section.headline} />
          </div>
        ) : null}
        <div className="pg-gallery-strip">{frames}</div>
      </Shell>
    );
  }

  return (
    <Shell section={section}>
      <div className="pg-container">
        <SectionHead headline={section.headline} />
        <div className={layout === "masonry" ? "pg-gallery-masonry" : "pg-gallery-grid"}>{frames}</div>
      </div>
    </Shell>
  );
}
