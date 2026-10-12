"use client";

import { useState, type CSSProperties } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandBrief, BrandKit } from "@/lib/pages/types";
import { Segmented } from "@/components/console/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/console/setup/atoms";
import { googleFontHref } from "./kit-editor";

const RADIUS: Record<BrandKit["radius"], number> = { none: 0, sm: 4, md: 8, lg: 12, full: 18 };
const PAD: Record<BrandKit["density"], number> = { compact: 14, regular: 20, airy: 28 };

function stack(f: BrandKit["fonts"]["heading"]) {
  return `"${f.family}", ${f.fallback || "sans-serif"}`;
}

function firstSentence(text: string) {
  const s = text.split(/(?<=[.!?])\s/)[0] ?? "";
  return s.length > 140 ? `${s.slice(0, 137).trimEnd()}…` : s;
}

/** A small landing page drawn from the kit and brief, so every edit is visible. */
function MiniPage({ kit, brief, brandName }: { kit: BrandKit; brief: BrandBrief; brandName: string }) {
  const [logoBroken, setLogoBroken] = useState<string | null>(null);
  const c = kit.colors;
  const pad = PAD[kit.density];
  const radius = RADIUS[kit.radius];
  const button: CSSProperties = {
    borderRadius: kit.buttonStyle === "pill" ? 999 : kit.buttonStyle === "square" ? 0 : Math.max(6, radius),
    textTransform: kit.uppercaseLabels ? "uppercase" : undefined,
    letterSpacing: kit.uppercaseLabels ? "0.06em" : undefined,
  };
  const label: CSSProperties = { textTransform: kit.uppercaseLabels ? "uppercase" : undefined, letterSpacing: kit.uppercaseLabels ? "0.08em" : undefined };
  const logo = kit.logo?.src && logoBroken !== kit.logo.src ? kit.logo.src : null;
  const items = brief.items.slice(0, 2);
  const fonts = googleFontHref([kit.fonts.heading, kit.fonts.body].filter((f) => f.source === "google").map((f) => f.family));

  return (
    <div style={{ background: c.background, color: c.foreground, fontFamily: stack(kit.fonts.body) }}>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <div className="flex items-center justify-between gap-3 border-b" style={{ padding: `10px ${pad}px`, borderColor: `${c.foreground}14` }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-5 max-w-[55%] object-contain object-left" onError={() => setLogoBroken(logo)} />
        ) : (
          <span className="truncate text-sm font-semibold" style={{ fontFamily: stack(kit.fonts.heading) }}>
            {kit.wordmark || brandName}
          </span>
        )}
        <span className="flex shrink-0 gap-3 text-[10px] opacity-70" style={label}>
          {(brief.categories.length ? brief.categories.slice(0, 2) : ["About", "Visit"]).map((t) => (
            <span key={t} className="max-w-20 truncate">
              {t}
            </span>
          ))}
        </span>
      </div>

      <div style={{ padding: pad }}>
        {brief.categories[0] && (
          <div className="text-[10px] font-semibold" style={{ ...label, color: c.primary }}>
            {brief.categories[0]}
          </div>
        )}
        <h3 className="mt-1.5 text-xl leading-tight font-semibold" style={{ fontFamily: stack(kit.fonts.heading) }}>
          {brandName}
        </h3>
        {brief.summary && <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed opacity-80">{firstSentence(brief.summary)}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="px-3 py-1.5 text-[11px] font-medium" style={{ ...button, background: c.primary, color: c.primaryForeground }}>
            {brief.ctas[0] ?? "Get started"}
          </span>
          <span className="border px-3 py-1.5 text-[11px] font-medium" style={{ ...button, borderColor: `${c.foreground}33` }}>
            {brief.ctas[1] ?? "Learn more"}
          </span>
        </div>

        {items.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {items.map((it) => (
              <div key={it.id} className="overflow-hidden" style={{ background: c.surface, borderRadius: radius }}>
                <div
                  className="aspect-[4/3] bg-cover bg-center"
                  style={{ backgroundColor: c.muted, backgroundImage: it.image ? `url("${it.image}")` : undefined }}
                />
                <div className="p-2">
                  <div className="truncate text-[11px] font-semibold" style={{ fontFamily: stack(kit.fonts.heading) }}>
                    {it.name}
                  </div>
                  {it.price && <div className="truncate text-[10px] opacity-70">{it.price}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {brief.proof[0] && (
          <div className="mt-3 truncate px-2.5 py-2 text-[10px]" style={{ background: c.accent, borderRadius: radius }}>
            {brief.proof[0]}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceShot({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <ImageOff className="size-4" /> The screenshot is no longer available.
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="The brand's homepage" className="aspect-[4/3] w-full object-cover object-top" onError={() => setBroken(true)} />;
}

/** Rail card: the kit rendered as a page, the source screenshot, and the palette at a glance. */
export function KitPreview({
  kit,
  brief,
  brandName,
  screenshot,
  anatomy,
  onRecapture,
}: {
  kit: BrandKit;
  brief: BrandBrief;
  brandName: string;
  screenshot?: string;
  /** How the site looks, as the builder reads it (pagesBrands.site.anatomy). */
  anatomy?: string;
  /** Re-run the homepage capture (screenshot, markup, anatomy). */
  onRecapture?: () => Promise<void>;
}) {
  const [view, setView] = useState<"kit" | "site">("kit");
  const [capturing, setCapturing] = useState(false);
  const [showAnatomy, setShowAnatomy] = useState(false);
  const colors = Object.values(kit.colors);
  const recapture = async () => {
    if (!onRecapture) return;
    setCapturing(true);
    try {
      await onRecapture();
    } finally {
      setCapturing(false);
    }
  };
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Preview</div>
          <div className="truncate text-xs text-muted-foreground">{view === "kit" ? "Redraws as you edit" : "The homepage Slice read"}</div>
        </div>
        {screenshot && (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "kit", label: "Kit" },
              { value: "site", label: "Site" },
            ]}
          />
        )}
      </div>
      <div className={cn("border-y", view === "site" && "bg-muted")}>
        {view === "kit" || !screenshot ? <MiniPage kit={kit} brief={brief} brandName={brandName} /> : <SourceShot src={screenshot} />}
      </div>
      <div className="flex h-2" aria-hidden>
        {colors.map((hex, i) => (
          <span key={i} className="flex-1" style={{ background: hex }} />
        ))}
      </div>
      {(onRecapture || anatomy) && (
        <div className="border-t px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="text-left font-medium" onClick={() => setShowAnatomy((v) => !v)} aria-expanded={showAnatomy} disabled={!anatomy}>
              How the site looks
              <span className="block text-xs font-normal text-muted-foreground">{anatomy ? "What the builder read from the homepage" : "Not captured yet"}</span>
            </button>
            {onRecapture && (
              <Button variant="outline" size="sm" onClick={recapture} disabled={capturing}>
                {capturing && <Spinner data-icon="inline-start" />}
                {anatomy ? "Recapture" : "Capture site"}
              </Button>
            )}
          </div>
          {showAnatomy && anatomy && <p className="mt-3 max-h-80 overflow-y-auto text-xs leading-5 whitespace-pre-line text-muted-foreground">{anatomy}</p>}
        </div>
      )}
    </Card>
  );
}
