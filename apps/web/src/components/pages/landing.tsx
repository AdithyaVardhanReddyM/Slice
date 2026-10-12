/* eslint-disable @next/next/no-img-element -- merchant images come from arbitrary hosts */
import type { ReactNode } from "react";
import {
  fontHref,
  safeLink,
  safeSrc,
  themeStyle,
  type BrandKit,
  type PageSection,
  type PageSegment,
} from "@/lib/pages/theme";

// A landing page variant, rendered from its sections in the brand's colours
// and fonts. Pure markup (no hooks) so it renders on the server for visitors
// and inside the editor as a live preview. Layout uses container queries, so
// the preview pane lays out like the real viewport would.
//
// CTA links carry data-lp-cta; the client wrapper (landing-client.tsx) counts
// clicks on them. All text is rendered as text, never as HTML.

export interface LandingReason {
  source: string;
  detail: string;
  matched?: string[];
}

export function LandingView({
  kit,
  domain,
  segment,
  reason,
  afterHero,
  ctaUrl,
}: {
  kit: BrandKit;
  domain: string;
  segment: PageSegment;
  reason?: LandingReason;
  afterHero?: ReactNode;
  ctaUrl: string;
}) {
  const fonts = fontHref(kit);
  const [hero, ...rest] = segment.sections[0]?.kind === "hero" ? segment.sections : [undefined, ...segment.sections];
  return (
    <div className="@container min-h-full" style={themeStyle(kit, segment.accent)}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      <Header kit={kit} ctaUrl={ctaUrl} label={hero?.cta?.label} />
      {hero ? <Hero section={hero} kit={kit} reason={reason} /> : null}
      {afterHero}
      {rest.map((s) => (s ? <Section key={s.id} section={s} /> : null))}
      <footer className="border-t border-[color-mix(in_srgb,var(--lp-text)_12%,transparent)] px-6 py-8 text-sm opacity-70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span>
            © {new Date().getFullYear()} {kit.name} · {domain}
          </span>
          <span className="text-xs">Tuned to your taste with Slice · powered by Qloo</span>
        </div>
      </footer>
    </div>
  );
}

function Logo({ kit, className }: { kit: BrandKit; className?: string }) {
  const src = safeSrc(kit.logo) ?? safeSrc(kit.icon);
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      {src ? <img src={src} alt={`${kit.name} logo`} className="h-8 w-auto max-w-[160px] object-contain" /> : null}
      {!kit.logo ? (
        <span className="text-lg font-semibold" style={{ fontFamily: "var(--lp-heading-font)" }}>
          {kit.name}
        </span>
      ) : null}
    </span>
  );
}

function Button({
  href,
  children,
  id,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  id: string;
  variant?: "primary" | "ghost" | "inverse";
}) {
  const styles = {
    primary: "bg-[var(--lp-primary)] text-[color:var(--lp-on-primary)] hover:opacity-90",
    ghost:
      "border border-[color-mix(in_srgb,var(--lp-text)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--lp-text)_6%,transparent)]",
    inverse: "bg-[var(--lp-on-primary)] text-[color:var(--lp-primary)] hover:opacity-90",
  }[variant];
  return (
    <a
      href={safeLink(href)}
      data-lp-cta={id}
      rel="noopener"
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition ${styles}`}
    >
      {children}
      <span aria-hidden>→</span>
    </a>
  );
}

function Header({ kit, ctaUrl, label }: { kit: BrandKit; ctaUrl: string; label?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[color-mix(in_srgb,var(--lp-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--lp-bg)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Logo kit={kit} />
        <a
          href={safeLink(ctaUrl)}
          data-lp-cta="header"
          rel="noopener"
          className="rounded-full bg-[var(--lp-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--lp-on-primary)]"
        >
          {label ?? "Get started"}
        </a>
      </div>
    </header>
  );
}

function Hero({ section, kit, reason }: { section: PageSection; kit: BrandKit; reason?: LandingReason }) {
  const image = safeSrc(section.image);
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--lp-accent), transparent 70%)" }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 @3xl:grid-cols-[1.1fr_1fr] @3xl:py-24">
        <div>
          {section.eyebrow ? (
            <p className="mb-4 inline-flex rounded-full bg-[color-mix(in_srgb,var(--lp-accent)_16%,transparent)] px-3 py-1 text-xs font-semibold tracking-wide uppercase">
              {section.eyebrow}
            </p>
          ) : null}
          <h1
            className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance @3xl:text-6xl"
            style={{ fontFamily: "var(--lp-heading-font)" }}
          >
            {section.heading}
          </h1>
          {section.body ? <p className="mt-5 max-w-xl text-lg leading-relaxed opacity-80">{section.body}</p> : null}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {section.cta ? (
              <Button href={section.cta.href} id="hero">
                {section.cta.label}
              </Button>
            ) : null}
            {section.secondaryCta ? (
              <Button href={section.secondaryCta.href} id="hero-secondary" variant="ghost">
                {section.secondaryCta.label}
              </Button>
            ) : null}
          </div>
          {reason && reason.source !== "default" ? (
            <p className="mt-6 text-xs opacity-60" title={reason.matched?.join(", ")}>
              ✦ Tuned for you · {reason.detail}
              {reason.matched?.length ? ` · ${reason.matched.slice(0, 3).join(", ")}` : ""}
            </p>
          ) : null}
        </div>
        <div className="relative">
          {image ? (
            <img
              src={image}
              alt=""
              className="aspect-[4/3] w-full rounded-3xl object-cover shadow-2xl shadow-black/10"
            />
          ) : (
            <div
              className="flex aspect-[4/3] w-full items-center justify-center rounded-3xl"
              style={{
                background:
                  "linear-gradient(135deg, var(--lp-primary), color-mix(in srgb, var(--lp-accent) 80%, var(--lp-primary)))",
              }}
            >
              <span
                className="text-5xl font-semibold text-[color:var(--lp-on-primary)] opacity-90"
                style={{ fontFamily: "var(--lp-heading-font)" }}
              >
                {kit.name}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Heading({ section, center }: { section: PageSection; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {section.eyebrow ? (
        <p className="mb-3 text-xs font-semibold tracking-widest text-[color:var(--lp-accent)] uppercase">
          {section.eyebrow}
        </p>
      ) : null}
      <h2
        className="text-3xl leading-tight font-semibold tracking-tight text-balance @3xl:text-4xl"
        style={{ fontFamily: "var(--lp-heading-font)" }}
      >
        {section.heading}
      </h2>
      {section.body && section.kind !== "story" ? (
        <p className="mt-4 text-base leading-relaxed opacity-75">{section.body}</p>
      ) : null}
    </div>
  );
}

function Section({ section }: { section: PageSection }) {
  const items = section.items ?? [];
  switch (section.kind) {
    case "benefits":
      return (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Heading section={section} />
          <div className="mt-10 grid gap-5 @2xl:grid-cols-3">
            {items.map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[color-mix(in_srgb,var(--lp-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--lp-text)_3%,var(--lp-bg))] p-6"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--lp-accent)] text-sm font-semibold text-[color:var(--lp-on-accent)]">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                {item.body ? <p className="mt-2 text-sm leading-relaxed opacity-75">{item.body}</p> : null}
              </div>
            ))}
          </div>
        </section>
      );
    case "products":
      return (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Heading section={section} />
          <div className="mt-10 grid grid-cols-2 gap-5 @3xl:grid-cols-3">
            {items.map((item, i) => {
              const img = safeSrc(item.image);
              return (
                <a
                  key={i}
                  href={safeLink(item.href)}
                  data-lp-cta="product"
                  rel="noopener"
                  className="group block overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--lp-text)_10%,transparent)]"
                >
                  <div className="aspect-square overflow-hidden bg-[color-mix(in_srgb,var(--lp-text)_5%,var(--lp-bg))]">
                    {img ? (
                      <img src={img} alt={item.title} className="size-full object-cover transition group-hover:scale-105" />
                    ) : null}
                  </div>
                  <div className="flex items-start justify-between gap-3 p-4">
                    <span className="text-sm font-medium">{item.title}</span>
                    {item.price ? <span className="text-sm opacity-70">{item.price}</span> : null}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      );
    case "story": {
      const img = safeSrc(section.image);
      return (
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 @3xl:grid-cols-2">
          {img ? <img src={img} alt="" className="aspect-[5/4] w-full rounded-3xl object-cover" /> : null}
          <div className={img ? "" : "@3xl:col-span-2"}>
            <Heading section={section} />
            {section.body ? <p className="mt-5 text-lg leading-relaxed opacity-80">{section.body}</p> : null}
          </div>
        </section>
      );
    }
    case "fit":
      return (
        <section className="bg-[color-mix(in_srgb,var(--lp-accent)_10%,var(--lp-bg))]">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <Heading section={section} />
            <ul className="mt-8 grid gap-4 @2xl:grid-cols-3">
              {items.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 text-[color:var(--lp-accent)]" aria-hidden>
                    ✓
                  </span>
                  <span>
                    <span className="font-semibold">{item.title}</span>
                    {item.body ? <span className="block text-sm opacity-75">{item.body}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="mx-auto max-w-3xl px-6 py-16">
          <Heading section={section} center />
          <div className="mt-8 divide-y divide-[color-mix(in_srgb,var(--lp-text)_12%,transparent)]">
            {items.map((item, i) => (
              <details key={i} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.title}
                  <span className="transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                {item.body ? <p className="mt-3 text-sm leading-relaxed opacity-75">{item.body}</p> : null}
              </details>
            ))}
          </div>
        </section>
      );
    case "cta":
      return (
        <section className="px-6 py-16">
          <div className="mx-auto max-w-6xl rounded-3xl bg-[var(--lp-primary)] px-8 py-14 text-center text-[color:var(--lp-on-primary)]">
            <h2
              className="text-3xl font-semibold tracking-tight text-balance @3xl:text-4xl"
              style={{ fontFamily: "var(--lp-heading-font)" }}
            >
              {section.heading}
            </h2>
            {section.body ? <p className="mx-auto mt-4 max-w-xl opacity-85">{section.body}</p> : null}
            {section.cta ? (
              <div className="mt-8">
                <Button href={section.cta.href} id="final" variant="inverse">
                  {section.cta.label}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      );
    default:
      return (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Heading section={section} />
        </section>
      );
  }
}
