"use client";

import { useState } from "react";

const rows = [
  { id: "dining", label: "Dining and bars", rate: 3, start: 600, max: 3000, step: 50 },
  { id: "travel", label: "Flights and hotels through Gwen Travel", rate: 5, start: 400, max: 3000, step: 50 },
  { id: "tickets", label: "Tickets and streaming", rate: 3, start: 150, max: 1000, step: 10 },
  { id: "else", label: "Everything else", rate: 1, start: 1800, max: 8000, step: 100 },
] as const;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-US");

/** Monthly spend in, first-year value out. Same maths as the rates on the page. */
export function Calculator({
  credits,
  fee,
  welcomePoints,
  pointValue,
}: {
  credits: number;
  fee: number;
  welcomePoints: number;
  pointValue: number;
}) {
  const [spend, setSpend] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.id, r.start])));

  const points = rows.reduce((sum, r) => sum + spend[r.id] * 12 * r.rate, 0);
  const pointsValue = (points * pointValue) / 100;
  const welcomeValue = (welcomePoints * pointValue) / 100;
  const net = pointsValue + credits + welcomeValue - fee;

  return (
    <div className="rounded-[28px] border border-gw-line bg-white p-6 shadow-[0_30px_60px_-40px_rgb(12_15_29/0.35)] sm:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[17px] font-semibold">What you spend in a month</h3>
        <span className="text-[13px] text-gw-mute">Drag to adjust</span>
      </div>

      <div className="mt-6 space-y-6">
        {rows.map((r) => {
          const fill = `${(spend[r.id] / r.max) * 100}%`;
          return (
            <label key={r.id} className="block">
              <span className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="text-gw-ink/80">
                  {r.label} <span className="ml-1 rounded-full bg-gw-mist px-2 py-0.5 text-[12px] font-semibold text-gw-ink">{r.rate}x</span>
                </span>
                <span className="gw-num text-[17px] font-semibold">{usd.format(spend[r.id])}</span>
              </span>
              <input
                type="range"
                min={0}
                max={r.max}
                step={r.step}
                value={spend[r.id]}
                onChange={(e) => setSpend((s) => ({ ...s, [r.id]: Number(e.target.value) }))}
                className="gw-range mt-3"
                style={{ "--fill": fill } as React.CSSProperties}
                aria-label={`${r.label}, monthly spend`}
              />
            </label>
          );
        })}
      </div>

      <div className="mt-8 rounded-[20px] bg-gw-ink p-6 text-white">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-[13px] text-white/55">Points in a year</div>
            <div className="gw-num mt-1 text-[44px] font-semibold leading-none">{num.format(points)}</div>
          </div>
          <div className="text-right text-[14px] text-white/60">worth {usd.format(pointsValue)} at Gwen Travel</div>
        </div>
        <dl className="mt-6 space-y-2.5 border-t border-white/10 pt-5 text-[14.5px]">
          <div className="flex justify-between">
            <dt className="text-white/65">Points</dt>
            <dd className="gw-num">{usd.format(pointsValue)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/65">Credits, if you use them all</dt>
            <dd className="gw-num">{usd.format(credits)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/65">Welcome offer, first year</dt>
            <dd className="gw-num">{usd.format(welcomeValue)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/65">Annual fee</dt>
            <dd className="gw-num">−{usd.format(fee)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
            <dt className="font-semibold">Your first year</dt>
            <dd className="gw-num gw-gold-text text-[22px] font-semibold">{usd.format(net)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
