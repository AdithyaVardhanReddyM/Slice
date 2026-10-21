"use client";

// The Why modal's charts, all drawn from Qloo numbers in the report: the
// audience's traits (affinity bars), which trait each choice carries (a
// heatmap), who has the taste (age and gender skew), and where in their city
// it is strongest against another audience (a heat grid with named spots).

import { useMemo, useState } from "react";
import type { MediaWhyReport, WhyChoice, WhyMap, WhyTrait } from "@slice/backend/convex/mediaTypes";
import { AGE_LABEL } from "@/lib/pages/types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { heat, inkOn, KIND, leanColour, ORANGE, score, SKY } from "./bits";

/* Traits ------------------------------------------------------------------- */

export function TraitBars({ traits, active, onHover }: { traits: WhyTrait[]; active: string | null; onHover: (name: string | null) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[12px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: ORANGE }} /> Carried by this piece
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-neutral-300" /> Not used here
        </span>
      </div>
      <ul className="space-y-0.5">
        {traits.map((t) => {
          const used = t.choices.length > 0;
          return (
            <li
              key={t.name}
              onMouseEnter={() => onHover(t.name)}
              onMouseLeave={() => onHover(null)}
              className={cn("grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors", active === t.name && "bg-neutral-50")}
            >
              <span className="min-w-0">
                <span className={cn("block truncate text-[13px]", used ? "font-medium text-neutral-950" : "text-neutral-600")}>{t.name}</span>
                <span className="block text-[11px] text-neutral-400">{t.group}</span>
              </span>
              <span className="relative h-2.5 rounded-r-full bg-neutral-100">
                <span className="absolute inset-y-0 left-0 rounded-r-full transition-[background]" style={{ width: `${score(t.affinity)}%`, background: used ? ORANGE : "#d4d4d4" }} />
              </span>
              <span className="text-right text-[12px] text-neutral-500 tabular-nums">{score(t.affinity)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] leading-5 text-neutral-400">Qloo affinity, 0 to 100: how strongly people with these loves lean toward each trait, against everyone.</p>
    </div>
  );
}

/** Rows: the traits the choices carry (and the strongest left out); columns: the choices. */
export function TraitHeatmap({ traits, choices, activeChoice, activeTrait, onChoice, onTrait }: { traits: WhyTrait[]; choices: WhyChoice[]; activeChoice: string | null; activeTrait: string | null; onChoice: (id: string | null) => void; onTrait: (name: string | null) => void }) {
  const used = traits.filter((t) => t.choices.length);
  const rows = [...used, ...traits.filter((t) => !t.choices.length).slice(0, Math.max(2, 8 - used.length))].slice(0, 10);
  const cols = choices.filter((c) => c.from === "taste" || c.signals.length);
  if (!used.length || !cols.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="w-40" />
            {cols.map((c) => (
              <th key={c.id} className="min-w-14 px-1 pb-2 align-bottom font-normal" onMouseEnter={() => onChoice(c.id)} onMouseLeave={() => onChoice(null)}>
                <span className={cn("mx-auto flex size-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors", activeChoice === c.id ? "bg-orange-600 text-white" : "bg-neutral-900 text-white")}>{choices.indexOf(c) + 1}</span>
                <span className="mt-1 block text-[11px] text-neutral-500">{KIND[c.kind]?.label ?? c.kind}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.name} onMouseEnter={() => onTrait(t.name)} onMouseLeave={() => onTrait(null)}>
              <td className={cn("truncate pr-3 text-[13px]", t.choices.length ? "text-neutral-900" : "text-neutral-400", activeTrait === t.name && "font-medium")}>
                {t.name} <span className="text-[11px] text-neutral-400 tabular-nums">{score(t.affinity)}</span>
              </td>
              {cols.map((c) => {
                const on = t.choices.includes(c.id);
                return (
                  <td key={c.id} className="p-0">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div
                            className={cn("flex h-9 items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-[outline]", !on && "bg-neutral-50", (activeChoice === c.id || activeTrait === t.name) && "outline-2 outline-offset-0 outline-neutral-900/15")}
                            style={on ? { background: heat(t.affinity), color: inkOn(t.affinity) } : undefined}
                          >
                            {on ? score(t.affinity) : ""}
                          </div>
                        }
                      />
                      <TooltipContent>{on ? `${KIND[c.kind]?.label ?? c.kind} (${c.title}) carries ${t.name.toLowerCase()}, a trait they lean ${score(t.affinity)} out of 100.` : `${c.title} does not lean on ${t.name.toLowerCase()}.`}</TooltipContent>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <span>Weaker trait</span>
        <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(to right, ${heat(0.4)}, ${heat(0.7)}, ${heat(1)})` }} />
        <span>Stronger trait</span>
      </div>
    </div>
  );
}

/* Who ---------------------------------------------------------------------- */

type Demo = NonNullable<MediaWhyReport["demographics"]>;

export function demoHeadline(demo: Demo) {
  const age = Object.entries(demo.age ?? {}).sort((a, b) => b[1] - a[1])[0];
  const gender = Object.entries(demo.gender ?? {}).sort((a, b) => b[1] - a[1])[0];
  const who = gender && gender[1] > 0.08 ? (gender[0] === "male" ? "men" : "women") : "people";
  return age && age[1] > 0 ? `Most likely ${who} aged ${(AGE_LABEL[age[0]] ?? age[0]).toLowerCase()}` : `Most likely ${who}`;
}

/** Qloo's skew per bucket, -1..1, as bars either side of the middle. */
export function SkewBars({ demo }: { demo: Demo }) {
  const rows: [string, number][] = [
    ...Object.keys(AGE_LABEL)
      .filter((k) => k in (demo.age ?? {}))
      .map((k): [string, number] => [AGE_LABEL[k], demo.age[k]]),
    ...(["female", "male"] as const).filter((k) => k in (demo.gender ?? {})).map((k): [string, number] => [k === "male" ? "Men" : "Women", demo.gender[k]]),
  ];
  const max = Math.max(0.25, ...rows.map(([, v]) => Math.abs(v)));
  const ages = Object.keys(AGE_LABEL).filter((k) => k in (demo.age ?? {})).length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[12px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: SKY }} /> Less likely than average
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: ORANGE }} /> More likely
        </span>
      </div>
      <ul>
        {rows.map(([label, v], i) => (
          <li key={label} className={cn("grid grid-cols-[6rem_minmax(0,1fr)_2.5rem] items-center gap-3 py-1", i === ages && "mt-2 border-t border-neutral-100 pt-3")}>
            <span className="text-[13px] text-neutral-700">{label}</span>
            <span className="relative h-3">
              <span className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px bg-neutral-300" />
              <span
                className={cn("absolute top-0 h-full", v >= 0 ? "rounded-r-[4px]" : "rounded-l-[4px]")}
                style={v >= 0 ? { left: "50%", width: `${(v / max) * 50}%`, background: ORANGE } : { right: "50%", width: `${(-v / max) * 50}%`, background: SKY }}
              />
            </span>
            <span className="text-right text-[12px] text-neutral-500 tabular-nums">
              {v > 0 ? "+" : v < 0 ? "−" : ""}
              {Math.abs(Math.round(v * 100))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Where -------------------------------------------------------------------- */

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

export function TasteMap({ map, audience }: { map: WhyMap; audience: string }) {
  const [focus, setFocus] = useState<string | null>(null);
  const other = map.versus !== "how busy each area is";
  const geo = useMemo(() => {
    const [dlon, dlat] = map.cell;
    const lats = map.cells.map((c) => c.lat).sort((a, b) => a - b);
    const lons = map.cells.map((c) => c.lon).sort((a, b) => a - b);
    let west = quantile(lons, 0.01) - dlon;
    let east = quantile(lons, 0.99) + dlon;
    let south = quantile(lats, 0.01) - dlat;
    let north = quantile(lats, 0.99) + dlat;
    for (const h of [...map.hotspots, ...map.elsewhere]) {
      west = Math.min(west, h.lon - dlon);
      east = Math.max(east, h.lon + dlon);
      south = Math.min(south, h.lat - dlat);
      north = Math.max(north, h.lat + dlat);
    }
    const k = Math.cos((((north + south) / 2) * Math.PI) / 180);
    const X = (lon: number) => (lon - west) * k;
    const Y = (lat: number) => north - lat;
    const leans = map.cells.map((c) => Math.abs(c.lean)).sort((a, b) => a - b);
    const scale = Math.max(0.05, quantile(leans, 0.95));
    return { X, Y, w: (east - west) * k, h: north - south, cw: dlon * k, ch: dlat, scale };
  }, [map]);
  const r = Math.max(geo.w, geo.h) * 0.024;
  const spots = [...map.hotspots.map((h, i) => ({ ...h, key: `h${i}`, label: String(i + 1), hot: true })), ...map.elsewhere.map((h, i) => ({ ...h, key: `e${i}`, label: String.fromCharCode(65 + i), hot: false }))];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_13rem]">
      <div>
        <div className="overflow-hidden rounded-xl bg-[#faf9f7] ring-1 ring-black/[0.05]">
          <svg viewBox={`0 0 ${geo.w} ${geo.h}`} className="block max-h-[380px] w-full" role="img" aria-label={`Where ${audience} over-index in ${map.region}`}>
            {map.cells.map((c, i) => (
              <rect key={i} x={geo.X(c.lon - map.cell[0] / 2)} y={geo.Y(c.lat + map.cell[1] / 2)} width={geo.cw * 0.92} height={geo.ch * 0.92} rx={geo.ch * 0.12} fill={leanColour(Math.sign(c.lean) * Math.sqrt(Math.min(1, Math.abs(c.lean) / geo.scale)))} />
            ))}
            {spots.map((s) => {
              const on = focus === s.key;
              return (
                <g key={s.key} onMouseEnter={() => setFocus(s.key)} onMouseLeave={() => setFocus(null)}>
                  <circle cx={geo.X(s.lon)} cy={geo.Y(s.lat)} r={r * (on ? 1.35 : 1)} fill={s.hot ? "#9a3412" : "#075985"} stroke="#fff" strokeWidth={r * 0.28} />
                  <text x={geo.X(s.lon)} y={geo.Y(s.lat)} dy="0.36em" textAnchor="middle" fontSize={r * 1.15} fontWeight={600} fill="#fff" className="pointer-events-none">
                    {s.label}
                  </text>
                  <title>{s.name}</title>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-neutral-500">
          <span>{other ? `Leans ${map.versus}` : "Less than its activity"}</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(to right, ${leanColour(-1)}, ${leanColour(0)}, ${leanColour(1)})` }} />
          <span>Leans {audience}</span>
        </div>
      </div>
      <div className="space-y-5 text-[13px]">
        <div>
          <p className="mb-2 font-medium text-neutral-950">Strongest for {audience}</p>
          <ol className="space-y-1">
            {map.hotspots.map((h, i) => (
              <Spot key={h.name} label={String(i + 1)} name={h.name} detail={h.detail} hot on={focus === `h${i}`} onHover={(on) => setFocus(on ? `h${i}` : null)} />
            ))}
          </ol>
        </div>
        {map.elsewhere.length > 0 && (
          <div>
            <p className="mb-2 font-medium text-neutral-950">Where {map.versus} leans instead</p>
            <ol className="space-y-1">
              {map.elsewhere.map((h, i) => (
                <Spot key={h.name} label={String.fromCharCode(65 + i)} name={h.name} detail={h.detail} on={focus === `e${i}`} onHover={(on) => setFocus(on ? `e${i}` : null)} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function Spot({ label, name, detail, hot, on, onHover }: { label: string; name: string; detail: string; hot?: boolean; on: boolean; onHover: (on: boolean) => void }) {
  return (
    <li onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} className={cn("flex items-start gap-2 rounded-lg px-1.5 py-1 transition-colors", on && "bg-neutral-50")}>
      <span className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white", hot ? "bg-orange-800" : "bg-sky-800")}>{label}</span>
      <span className="min-w-0">
        <span className="block leading-5 text-neutral-900">{name}</span>
        {detail && <span className="block text-[11px] text-neutral-400">{detail}</span>}
      </span>
    </li>
  );
}
