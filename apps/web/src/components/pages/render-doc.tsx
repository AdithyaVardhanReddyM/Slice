/* eslint-disable @next/next/no-img-element */
// PageRenderer: header, sections, footer for one variant document, themed by
// the brand kit. Server component; the tracker, the form and the quiz are the
// only client islands.

import type { ReactNode } from "react";
import type { BrandKit, PageDoc } from "@slice/backend/convex/pagesTypes";
import { googleFontsHref, kitMode, kitToVars } from "./theme";
import { renderSection } from "./sections";
import { Arrow } from "./sections/ui";
import { Tracker } from "./tracker";
import { Year } from "./year";
import { TrackingProvider } from "./tracking-context";
import type { TrackingMeta } from "./types";

export interface RendererBrand {
  name: string;
  slug: string;
  url?: string;
}

export function PageRenderer({
  brand,
  kit,
  doc,
  variantId,
  pageId,
  trackingMeta,
  quiz,
}: {
  brand: RendererBrand;
  kit: BrandKit;
  doc: PageDoc;
  variantId: string;
  pageId: string;
  trackingMeta: Omit<TrackingMeta, "pageId" | "variantId">;
  /** Rendered between the header and the first section (the quiz bar). */
  quiz?: ReactNode;
}) {
  const vars = kitToVars(kit, doc.theme);
  const fonts = googleFontsHref(kit);
  const meta: TrackingMeta = { ...trackingMeta, pageId, variantId };
  const header = doc.header ?? { showLogo: true };

  return (
    <TrackingProvider value={meta}>
      <div className={`pg-root pg-mode-${kitMode(kit)}`} style={vars} data-page={pageId} data-variant={variantId}>
        {fonts ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={fonts} precedence="default" />
          </>
        ) : null}

        <header className="pg-header" data-section="header">
          <div className="pg-container pg-header-inner">
            <a href={brand.url || "#"} className="pg-logo" aria-label={brand.name}>
              {header.showLogo !== false && kit.logo?.src ? (
                <img src={kit.logo.src} alt={kit.logo.alt || brand.name} />
              ) : (
                <span className="pg-wordmark">{kit.wordmark || brand.name}</span>
              )}
            </a>
            {header.links?.length ? (
              <nav className="pg-nav" aria-label="Page">
                {header.links.map((l) => (
                  <a key={`${l.label}-${l.href}`} href={l.href} data-cta={l.track ?? `nav:${l.label}`}>
                    {l.label}
                  </a>
                ))}
              </nav>
            ) : null}
            {header.cta ? (
              <a href={header.cta.href} className="pg-btn pg-btn-contrast pg-btn-sm" data-cta={header.cta.track ?? header.cta.label}>
                {header.cta.label}
                <Arrow />
              </a>
            ) : null}
          </div>
        </header>

        {quiz}

        <main>{doc.sections.map((s) => renderSection(s))}</main>

        <footer className="pg-footer" data-section="footer">
          <div className="pg-container pg-footer-inner">
            <span>{doc.footer?.text ?? (<>© <Year /> {brand.name}</>)}</span>
            {doc.footer?.links?.length ? (
              <nav style={{ display: "flex", gap: 20, flexWrap: "wrap" }} aria-label="Footer">
                {doc.footer.links.map((l) => (
                  <a key={`${l.label}-${l.href}`} href={l.href} data-cta={l.track ?? `footer:${l.label}`}>
                    {l.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
        </footer>

        <Tracker meta={meta} />
      </div>
    </TrackingProvider>
  );
}

/** Shown when a variant has no document yet (still building). */
export function EmptyVariant({ brand, kit, title }: { brand: RendererBrand; kit: BrandKit; title: string }) {
  const fonts = googleFontsHref(kit);
  return (
    <div className="pg-root" style={kitToVars(kit)}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      <div className="pg-empty">
        <div style={{ display: "grid", gap: 14, justifyItems: "center" }}>
          <span className="pg-wordmark">{kit.wordmark || brand.name}</span>
          <h1 className="pg-h3">{title} is being prepared</h1>
          <p>This version of the page has not been published yet. Check back shortly.</p>
        </div>
      </div>
    </div>
  );
}
