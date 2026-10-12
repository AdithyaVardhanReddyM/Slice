// HtmlPageRenderer: a builder-written page (HtmlDoc) inside the `.pg-root`
// wrapper so the kit's variables, fonts and tracker apply. Server component;
// the markup and CSS are sanitised here, never trusted from storage.

import type { ReactNode } from "react";
import type { BrandKit, HtmlDoc } from "@slice/backend/convex/pagesTypes";
import type { RendererBrand } from "./render-doc";
import { sanitizePageCss, sanitizePageHtml } from "./sanitize-page";
import { googleFontsHref, kitMode, kitToVars } from "./theme";
import { Tracker } from "./tracker";
import { TrackingProvider } from "./tracking-context";
import type { TrackingMeta } from "./types";

export function HtmlPageRenderer({
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
  doc: HtmlDoc;
  variantId: string;
  pageId: string;
  trackingMeta: Omit<TrackingMeta, "pageId" | "variantId">;
  quiz?: ReactNode;
}) {
  const vars = kitToVars(kit);
  const fonts = googleFontsHref(kit, doc.meta.fonts);
  const meta: TrackingMeta = { ...trackingMeta, pageId, variantId };
  const html = sanitizePageHtml(doc.html);
  const css = sanitizePageCss(doc.css);

  return (
    <TrackingProvider value={meta}>
      <div className={`pg-root pg-page pg-mode-${kitMode(kit)}`} style={vars} data-page={pageId} data-variant={variantId} data-brand={brand.slug}>
        {fonts ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={fonts} precedence="default" />
          </>
        ) : null}
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        {quiz}
        <div className="pg-page-body" dangerouslySetInnerHTML={{ __html: html }} />
        <Tracker meta={meta} />
      </div>
    </TrackingProvider>
  );
}
