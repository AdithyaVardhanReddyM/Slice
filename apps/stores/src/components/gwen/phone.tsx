import { BedDouble, Plane, ShoppingBag, Ticket, Tv, Utensils, HeartPulse } from "lucide-react";
import { CardArt } from "./card-art";

const credits = [
  { icon: Utensils, name: "Tables", left: 62, of: 150, note: "$88 used at dinner" },
  { icon: Ticket, name: "Front Row", left: 150, of: 150, note: "Presale opens Thursday" },
  { icon: BedDouble, name: "Stays", left: 250, of: 250, note: "Resets 1 January" },
  { icon: Tv, name: "Screen", left: 0, of: 20, note: "Used this month" },
  { icon: Plane, name: "Away", left: 210, of: 300, note: "$90 used on a flight" },
  { icon: ShoppingBag, name: "Shop", left: 200, of: 200, note: "Your pick: Le Labo" },
  { icon: HeartPulse, name: "Move", left: 25, of: 25, note: "Renews on the 1st" },
];

/** The app's credits screen in a phone frame. Static: it is a picture of the app. */
export function Phone() {
  return (
    <div className="relative mx-auto w-[300px] rounded-[48px] bg-gw-ink p-[10px] shadow-[0_50px_100px_-40px_rgb(12_15_29/0.6)] sm:w-[320px]">
      <div className="relative h-[640px] overflow-hidden rounded-[39px] bg-gw-paper">
        <div className="flex items-center justify-between px-7 pb-2 pt-3.5 text-[12px] font-semibold">
          <span>9:41</span>
          <span className="absolute left-1/2 top-2.5 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-gw-ink" />
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-[3px] border border-gw-ink/70" />
          </span>
        </div>

        <div className="px-5 pb-5 pt-3">
          <div className="text-[12px] text-gw-mute">Good evening, Alex</div>
          <div className="gw-display mt-0.5 text-[24px]">Your credits</div>
          <div className="mt-3 w-[62%]">
            <CardArt />
          </div>
          <div className="mt-4 flex gap-1.5 text-[11.5px] font-semibold">
            <span className="rounded-full bg-gw-ink px-3 py-1.5 text-white">July to Dec</span>
            <span className="rounded-full bg-white px-3 py-1.5 text-gw-mute">This month</span>
          </div>

          <ul className="mt-3 space-y-2">
            {credits.map((c) => {
              const Icon = c.icon;
              const used = 1 - c.left / c.of;
              return (
                <li key={c.name} className="rounded-2xl bg-white px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gw-mist">
                      <Icon className="size-3.5" strokeWidth={2} />
                    </span>
                    <span className="flex-1 text-[13px] font-semibold">{c.name}</span>
                    <span className="gw-num text-[13px] font-semibold">${c.left}</span>
                    <span className="text-[11px] text-gw-soft">left</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-gw-mist">
                    <div className="h-full rounded-full bg-gw-ink" style={{ width: `${Math.round(used * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 text-[11px] text-gw-mute">{c.note}</div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
