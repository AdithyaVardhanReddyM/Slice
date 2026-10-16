"use client";

// Audience insights in the studio. The pre-test shows a creative to a panel of
// people drawn from its audience's Qloo taste before any money is spent; the
// taste map shows where that taste is strongest so the merchant can open a new
// audience there. Both run on the agent as studio actions and are read live
// from Convex (mediaInsights).

import { useMutation, useQuery } from "convex/react";
import { Loader2, Map as MapIcon, MapPin, MessageSquare, Plus, RotateCw, Users, X } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { MediaAudience, MediaPretest, MediaTasteMap, PretestAction, PretestPersona, TasteHotspot } from "@slice/backend/convex/mediaTypes";
import { audienceId as makeAudienceId } from "@/lib/media/kit";
import { AGE_LABEL } from "@/lib/pages/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/console/form";
import { WORLD_H, WORLD_LAND_PATH, WORLD_W } from "@/components/concierge/world-land";
import { Section, SmallButton } from "./controls";
import { useStudio } from "./context";
import { mediaAction } from "./use-media-agent";

type Demographics = MediaPretest["demographics"];

/* Pre-test ---------------------------------------------------------------------------- */

const ACTION: Record<PretestAction, { label: string; tone: string }> = {
  scroll_past: { label: "Scrolls past", tone: "bg-red-50 text-red-700" },
  pause: { label: "Pauses", tone: "bg-amber-50 text-amber-700" },
  tap: { label: "Taps through", tone: "bg-emerald-50 text-emerald-700" },
  save_or_share: { label: "Saves or shares", tone: "bg-emerald-100 text-emerald-800" },
};

const scoreTone = (n: number) => (n >= 70 ? "text-emerald-600" : n >= 50 ? "text-amber-600" : "text-red-600");

export function PretestPanel({ onSend }: { onSend: (text: string) => void }) {
  const { campaignId, campaign, creative, act, pending } = useStudio();
  const rows = useQuery(api.media.insights, { id: campaignId, kind: "pretest" });
  const audiences = campaign.audiences as MediaAudience[];
  const [chosen, setChosen] = useState<string | null>(null);
  if (!creative) return <p className="p-4 text-sm text-muted-foreground">Open a creative to pre-test it.</p>;

  const result = rows?.find((r) => r.key === creative._id)?.data as MediaPretest | undefined;
  const audience = chosen ?? result?.audienceKey ?? creative.audienceKey;
  const label = `Pre-test ${creative._id}`;
  const running = pending.includes(label);
  const run = () => void act("pretest", { creative_id: creative._id, audience_id: audience }, label);
  const stale = result && result.version < creative.version;
  const missed = result?.personas.filter((p) => p.action === "scroll_past") ?? [];

  const applyText = (fixes: MediaPretest["fixes"]) =>
    [
      `Apply these pre-test fixes to "${creative.name}" (${creative._id}).` + (missed.length ? ` ${missed.map((p) => p.name).join(" and ")} scrolled past.` : ""),
      ...fixes.map((f, i) => `${i + 1}. [${f.layer}] ${f.what} (${f.why})`),
    ].join("\n");

  return (
    <div>
      <Section title="Pre-test" aside={result ? <span className="text-[11px] text-muted-foreground">v{result.version}</span> : undefined}>
        <p className="text-xs leading-5 text-muted-foreground">Five people from the audience, built from its Qloo tastes and demographics, see this creative as it will be published and say whether they would stop. No generation cost.</p>
        <div className="flex items-center gap-1.5">
          <Select aria-label="Audience" value={audience} onChange={(e) => setChosen(e.target.value)} className="h-7 text-xs">
            {audiences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <SmallButton tone="primary" disabled={running} onClick={run} className="shrink-0">
            {running ? <Loader2 className="animate-spin" /> : result ? <RotateCw /> : <Users />}
            {running ? "Testing" : result ? "Run again" : "Run pre-test"}
          </SmallButton>
        </div>
        {running && <p className="text-[11px] text-muted-foreground">Rendering the creative and asking the panel. About half a minute.</p>}
      </Section>

      {result && (
        <>
          <Section title="Result" aside={stale ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">Edited since</span> : undefined}>
            <div className="flex items-center gap-3.5">
              <ScoreRing score={result.score} />
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">
                  {result.personas.length - missed.length} of {result.personas.length} would stop
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.audienceName} · {new Date(result.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <p className="text-sm leading-5">{result.verdict}</p>
          </Section>

          {result.fixes.length > 0 && (
            <Section title="Fixes" aside={<SmallButton onClick={() => onSend(applyText(result.fixes))}><MessageSquare /> Apply all</SmallButton>}>
              <ol className="space-y-2.5">
                {result.fixes.map((f, i) => (
                  <li key={i} className="group space-y-0.5 text-xs">
                    <div className="flex items-start gap-1.5">
                      <span className={cn("mt-px shrink-0 rounded px-1 text-[10px] font-medium uppercase", f.impact === "high" ? "bg-red-50 text-red-700" : f.impact === "medium" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600")}>{f.impact}</span>
                      <p className="flex-1 leading-4 font-medium">{f.what}</p>
                      <button type="button" onClick={() => onSend(applyText([f]))} className="shrink-0 text-[11px] text-sky-700 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:underline">
                        Apply
                      </button>
                    </div>
                    <p className="pl-[3.25rem] leading-4 text-muted-foreground">
                      {f.why} <span className="font-mono text-[10px]">{f.layer}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section title="The panel">
            <ul className="space-y-3">
              {result.personas.map((p, i) => (
                <Persona key={i} p={p} />
              ))}
            </ul>
          </Section>

          {result.demographics && (
            <Section title="Who has this taste (Qloo)">
              <SkewBars demo={result.demographics} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-neutral-100" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} className={scoreTone(score)} />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums", scoreTone(score))}>{score}</span>
    </div>
  );
}

function Persona({ p }: { p: PretestPersona }) {
  const a = ACTION[p.action] ?? ACTION.pause;
  return (
    <li className="space-y-1.5 rounded-lg p-2.5 ring-1 ring-black/5">
      <div className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">{p.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">
            {p.name}, {p.age} <span className="font-normal text-muted-foreground">· {p.city}</span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground" title={p.bio}>
            {p.bio}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{p.score}/10</span>
      </div>
      {p.tastes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.tastes.map((t) => (
            <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-700">
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs leading-5 text-neutral-800">“{p.reaction}”</p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={cn("rounded px-1.5 py-0.5 font-medium", a.tone)}>{a.label}</span>
        {p.likes.map((x) => (
          <span key={x} className="text-emerald-700">
            + {x}
          </span>
        ))}
        {p.dislikes.map((x) => (
          <span key={x} className="text-red-700">
            − {x}
          </span>
        ))}
      </div>
    </li>
  );
}

/** Qloo's skew per bucket, -1..1, as bars either side of the middle. */
function SkewBars({ demo }: { demo: NonNullable<Demographics> }) {
  const rows: [string, number][] = [
    ...Object.keys(AGE_LABEL)
      .filter((k) => k in (demo.age ?? {}))
      .map((k): [string, number] => [AGE_LABEL[k], demo.age[k]]),
    ...Object.entries(demo.gender ?? {}).map(([k, v]): [string, number] => [k === "male" ? "Men" : k === "female" ? "Women" : k, v]),
  ];
  return (
    <div className="space-y-1">
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2 text-[11px]">
          <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
          <div className="relative h-2 flex-1 rounded-full bg-neutral-100">
            <span className="absolute top-0 left-1/2 h-full w-px bg-neutral-300" />
            <span className={cn("absolute top-0 h-full rounded-full", v >= 0 ? "bg-sky-500" : "bg-neutral-400")} style={v >= 0 ? { left: "50%", width: `${Math.min(1, v) * 50}%` } : { right: "50%", width: `${Math.min(1, -v) * 50}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
            {v > 0 ? "+" : ""}
            {Math.round(v * 100)}
          </span>
        </div>
      ))}
      <p className="pt-1 text-[10px] text-muted-foreground">More or less likely than average to share these tastes.</p>
    </div>
  );
}

/* Taste map --------------------------------------------------------------------------- */

const REGIONS = ["United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "India", "New York", "Los Angeles", "London", "Paris", "Tokyo"];

function defaultRegion(a: MediaAudience | undefined) {
  return a?.seed?.city || "United States";
}

export function TasteMapView({ onClose, onSend }: { onClose: () => void; onSend: (text: string) => void }) {
  const { campaignId, campaign } = useStudio();
  const rows = useQuery(api.media.insights, { id: campaignId, kind: "map" });
  const update = useMutation(api.media.update);
  const audiences = campaign.audiences as MediaAudience[];
  const mappable = audiences.filter((a) => a.kind !== "everyone");
  const [picked, setPicked] = useState<string | null>(null);
  const current = mappable.find((a) => a.id === picked) ?? mappable[0];
  const map = rows?.find((r) => r.key === current?.id)?.data as MediaTasteMap | undefined;
  const [regionDraft, setRegionDraft] = useState<{ for: string; text: string } | null>(null);
  const region = regionDraft && regionDraft.for === current?.id ? regionDraft.text : (map?.region ?? defaultRegion(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  const run = async () => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    const r = await mediaAction(campaignId, "taste_map", { audience_id: current.id, region: region.trim() });
    if (!r.ok) setError(r.error ?? "The map failed");
    setFocus(null);
    setBusy(false);
  };

  const addAudience = async (a: MediaAudience) => {
    await update({ id: campaignId, audiences: [...audiences, a] });
    return a;
  };

  const hotspotAudience = (h: TasteHotspot) => audiences.find((a) => a.kind === "seed" && a.seed?.city?.split(",")[0].trim() === h.name);

  const addHotspot = async (h: TasteHotspot) => {
    if (!current || !map) return;
    const name = `${current.name} · ${h.name}`;
    const interests = current.seed?.interests?.length ? current.seed.interests : map.signals.slice(0, 6);
    await addAudience({ id: makeAudienceId(name, new Set(audiences.map((a) => a.id))), name, kind: "seed", seed: { interests, city: [h.name, h.detail].filter(Boolean).join(", "), ...(current.seed?.age ? { age: current.seed.age } : {}) } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <MapIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Taste map</span>
        {mappable.length > 0 && (
          <>
            <Select aria-label="Audience" value={current?.id} onChange={(e) => setPicked(e.target.value)} className="h-7 w-48 text-xs">
              {mappable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted-foreground">in</span>
            <Input
              aria-label="Region"
              list="taste-map-regions"
              value={region}
              onChange={(e) => current && setRegionDraft({ for: current.id, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              className="h-7 w-40 text-xs"
            />
            <datalist id="taste-map-regions">
              {REGIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <Button size="sm" disabled={busy || !region.trim()} onClick={() => void run()}>
              {busy ? <Loader2 className="animate-spin" /> : null} {map ? "Map again" : "Map it"}
            </Button>
          </>
        )}
        {error && <span className="truncate text-xs text-destructive">{error}</span>}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
          <X /> Back to canvas
        </Button>
      </div>

      {!mappable.length ? (
        <NewAudience full={audiences.length >= 6} onAdd={async (a) => setPicked((await addAudience(a)).id)} taken={new Set(audiences.map((a) => a.id))} />
      ) : !map ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          {busy ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <MapIcon className="size-6 text-muted-foreground" />}
          <h2 className="text-base font-semibold">{busy ? `Mapping ${current?.name}` : `Where is “${current?.name}” strongest?`}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{busy ? "Asking Qloo where this taste concentrates, then naming the hotspots." : "Qloo maps where people with this audience's tastes concentrate. The hotspots are places to aim a campaign, or to open a new audience."}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 bg-sky-50/60 p-4">
            <HeatMap map={map} focus={focus} onFocus={setFocus} />
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
              Weaker
              <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(to right, ${heat(0)}, ${heat(0.5)}, ${heat(1)})` }} />
              Stronger taste
            </div>
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <aside className="scrollbar-thin w-80 shrink-0 overflow-y-auto border-l">
            <Section title={`Hotspots in ${map.resolved}`}>
              <ol className="space-y-1">
                {map.hotspots.map((h, i) => {
                  const there = hotspotAudience(h);
                  return (
                    <li key={h.name} onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)} className={cn("space-y-1.5 rounded-lg p-2 transition-colors", focus === i && "bg-neutral-50")}>
                      <div className="flex items-start gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-medium text-white">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-5 font-medium">{h.name}</p>
                          {h.detail && <p className="text-[11px] text-muted-foreground">{h.detail}</p>}
                        </div>
                        <span className="shrink-0 text-right text-[11px] leading-4 tabular-nums text-muted-foreground">
                          <span className="font-medium text-foreground">{Math.round(h.affinity * 100)}</span> taste
                          <br />
                          {h.popularity >= 0.9 ? "busy" : h.popularity >= 0.6 ? "active" : "quiet"} area
                        </span>
                      </div>
                      <div className="flex gap-1.5 pl-7">
                        {there ? (
                          <SmallButton onClick={() => onSend(`Make creatives for the audience "${there.name}" (${there.id}), angled to ${h.name}: the same taste, with local references people there would recognise.`)}>
                            <MessageSquare /> Make creatives
                          </SmallButton>
                        ) : (
                          <SmallButton disabled={audiences.length >= 6} title={audiences.length >= 6 ? "A campaign has up to 6 audiences" : undefined} onClick={() => void addHotspot(h)}>
                            <Plus /> Audience here
                          </SmallButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Section>
            <Section title="Mapped from">
              <div className="flex flex-wrap gap-1">
                {map.signals.map((s) => (
                  <span key={s} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-700">
                    {s}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{map.cells.length} strongest areas shown. Qloo heatmap; place names from OpenStreetMap.</p>
            </Section>
            {map.demographics && (
              <Section title="Who has this taste (Qloo)">
                <SkewBars demo={map.demographics} />
              </Section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function NewAudience({ onAdd, taken, full }: { onAdd: (a: MediaAudience) => Promise<void>; taken: Set<string>; full: boolean }) {
  const [interests, setInterests] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const list = interests
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  const add = async () => {
    if (!list.length || busy) return;
    setBusy(true);
    const name = [city.trim(), list.slice(0, 2).join(" & ")].filter(Boolean).join(" · ");
    try {
      await onAdd({ id: makeAudienceId(name, new Set(taken)), name, kind: "seed", seed: { interests: list, ...(city.trim() ? { city: city.trim() } : {}) } });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md space-y-3">
        <div className="space-y-1 text-center">
          <MapPin className="mx-auto size-6 text-muted-foreground" />
          <h2 className="text-base font-semibold">Map an audience&rsquo;s taste</h2>
          <p className="text-sm text-muted-foreground">This campaign only has Everyone, which has no taste to map. Describe an audience by what they are into; Qloo finds where those people are.</p>
        </div>
        <Input placeholder="Interests, comma separated: Khruangbin, natural wine, Aesop" value={interests} onChange={(e) => setInterests(e.target.value)} />
        <Input placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />
        <Button className="w-full" disabled={!list.length || busy || full} onClick={() => void add()}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add audience
        </Button>
      </div>
    </div>
  );
}

/** 0..1 to a heat colour, pale yellow to deep red. */
function heat(t: number) {
  return `hsl(${Math.round(48 - 44 * t)} 95% ${Math.round(62 - 18 * t)}% / ${(0.3 + 0.65 * t).toFixed(2)})`;
}

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

function HeatMap({ map, focus, onFocus }: { map: MediaTasteMap; focus: number | null; onFocus: (i: number | null) => void }) {
  const [dlon, dlat] = map.cell;
  const lats = map.cells.map((c) => c[0]).sort((a, b) => a - b);
  const lons = map.cells.map((c) => c[1]).sort((a, b) => a - b);
  // Frame the bulk of the taste (and every hotspot), not far-off outliers.
  let west = quantile(lons, 0.02) - dlon;
  let east = quantile(lons, 0.98) + dlon;
  let south = quantile(lats, 0.02) - dlat;
  let north = quantile(lats, 0.98) + dlat;
  for (const h of map.hotspots) {
    west = Math.min(west, h.lon - dlon);
    east = Math.max(east, h.lon + dlon);
    south = Math.min(south, h.lat - dlat);
    north = Math.max(north, h.lat + dlat);
  }
  const k = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const X = (lon: number) => ((lon + 180) / 360) * WORLD_W * k;
  const Y = (lat: number) => ((84 - lat) / 142) * WORLD_H;
  const padX = (X(east) - X(west)) * 0.05;
  const padY = (Y(south) - Y(north)) * 0.05;
  const vx = X(west) - padX;
  const vy = Y(north) - padY;
  const vw = X(east) - X(west) + 2 * padX;
  const vh = Y(south) - Y(north) + 2 * padY;
  const unit = Math.max(vw, vh);
  const aff = map.cells.map((c) => c[2]);
  const lo = Math.min(...aff);
  const span = Math.max(1e-6, Math.max(...aff) - lo);
  const cw = (dlon / 360) * WORLD_W * k;
  const ch = (dlat / 142) * WORLD_H;
  const cells = [...map.cells].sort((a, b) => a[2] - b[2]);

  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="h-full w-full" role="img" aria-label={`Where the taste is strongest in ${map.resolved}`}>
      <path d={WORLD_LAND_PATH} transform={`scale(${k} 1)`} fill="#fff" stroke="#cbd5e1" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {cells.map((c, i) => (
        <rect key={i} x={X(c[1] - dlon / 2)} y={Y(c[0] + dlat / 2)} width={cw} height={ch} fill={heat((c[2] - lo) / span)} />
      ))}
      {map.hotspots.map((h, i) => {
        const x = X(h.lon);
        const y = Y(h.lat);
        const r = unit * 0.011;
        const on = focus === i;
        return (
          <g key={h.name} onMouseEnter={() => onFocus(i)} onMouseLeave={() => onFocus(null)} className="cursor-default">
            {on && <circle cx={x} cy={y} r={r * 1.9} fill="none" stroke="#0f172a" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
            <circle cx={x} cy={y} r={r} fill="#0f172a" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={r * 1.2} fontWeight={600} fill="#fff">
              {i + 1}
            </text>
            <text x={x + r * 1.5} y={y} dy="0.35em" fontSize={unit * 0.017} fontWeight={on ? 600 : 500} fill="#0f172a" stroke="#fff" strokeWidth={3} paintOrder="stroke" vectorEffect="non-scaling-stroke">
              {h.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
