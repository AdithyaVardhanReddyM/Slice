/* eslint-disable @next/next/no-img-element */
// Primitives every section builds from. Server-renderable (no hooks).

import type { CSSProperties, ReactNode } from "react";
import type { Cta, ImageRef, Section, SectionTheme } from "@slice/backend/convex/pagesTypes";

export function Shell({
  section,
  className,
  style,
  children,
  as: Tag = "section",
}: {
  section: Section;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  as?: "section" | "div";
}) {
  const theme: SectionTheme = section.theme ?? "light";
  return (
    <Tag
      id={section.id}
      data-section={section.id}
      data-section-type={section.type}
      className={`pg-section pg-theme-${theme} pg-type-${section.type}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {children}
    </Tag>
  );
}

export function Arrow() {
  return (
    <svg className="pg-btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export type ButtonVariant = "primary" | "secondary" | "contrast" | "inverse" | "outline-light";

export function CtaLink({
  cta,
  variant = "primary",
  size,
  arrow = true,
  className,
}: {
  cta: Cta;
  variant?: ButtonVariant;
  size?: "sm";
  arrow?: boolean;
  className?: string;
}) {
  const cls = ["pg-btn", variant !== "primary" && `pg-btn-${variant}`, size === "sm" && "pg-btn-sm", className]
    .filter(Boolean)
    .join(" ");
  return (
    <a href={cta.href || "#"} className={cls} data-cta={cta.track ?? cta.label}>
      {cta.label}
      {arrow && <Arrow />}
    </a>
  );
}

export function Eyebrow({ children, plain, className }: { children: ReactNode; plain?: boolean; className?: string }) {
  return <span className={`pg-eyebrow${plain ? " pg-eyebrow-plain" : ""}${className ? ` ${className}` : ""}`}>{children}</span>;
}

/** Image in a themed frame. Renders the frame even without a src so layouts hold. */
export function Picture({
  image,
  className,
  sizes,
  priority,
  zoom,
  style,
  credit = true,
}: {
  image?: ImageRef | null;
  className?: string;
  sizes?: string;
  priority?: boolean;
  zoom?: boolean;
  style?: CSSProperties;
  credit?: boolean;
}) {
  const cls = ["pg-frame", !image?.src && "pg-frame-empty", zoom && "pg-zoom", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style}>
      {image?.src ? (
        <img
          src={image.src}
          alt={image.alt ?? ""}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : undefined}
        />
      ) : null}
      {credit && image?.credit ? <span className="pg-credit">{image.credit}</span> : null}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  headline,
  intro,
  row,
  align,
  size = "h2",
}: {
  eyebrow?: string;
  headline?: string;
  intro?: string;
  row?: boolean;
  align?: "center";
  size?: "h2" | "h3";
}) {
  if (!eyebrow && !headline && !intro) return null;
  return (
    <header
      className={`pg-section-head${row && intro ? " pg-section-head-row" : ""}`}
      style={align === "center" ? { textAlign: "center", justifyItems: "center" } : undefined}
    >
      <div style={{ display: "grid", gap: 14, justifyItems: align === "center" ? "center" : undefined }}>
        {eyebrow ? <Eyebrow plain={align === "center"}>{eyebrow}</Eyebrow> : null}
        {headline ? <h2 className={`pg-${size}`}>{headline}</h2> : null}
      </div>
      {intro ? <p className="pg-lead" style={align === "center" ? { marginInline: "auto" } : undefined}>{intro}</p> : null}
    </header>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
