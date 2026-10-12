import Link from "next/link";
import { cn } from "cn";
import { type Act, type DayId, actsOn, day, days, href, posterOrder, stage } from "@/lib/tagide";

/**
 * The lineup poster: three columns, one per day, names tiered by type size
 * exactly as the printed poster does it. Every name links to the act page.
 */
export function Poster({ className, dense }: { className?: string; dense?: boolean }) {
  return (
    <div className={cn("grid gap-10 md:grid-cols-3 md:gap-6", className)}>
      {days.map((d) => (
        <PosterDay key={d.id} dayId={d.id} dense={dense} />
      ))}
    </div>
  );
}

export function PosterDay({ dayId, dense }: { dayId: DayId; dense?: boolean }) {
  const d = day(dayId);
  const list = posterOrder(actsOn(dayId));
  const [headliner, ...rest] = list;
  const second = rest.filter((a) => a.tier === 2);
  const third = rest.filter((a) => a.tier === 3);
  return (
    <div className="border-t-4 border-tg-ink pt-4">
      <div className="flex items-baseline justify-between">
        <span className="tg-label">{d.label}</span>
        <span className="tg-label text-tg-mute">{d.date}</span>
      </div>
      <Name act={headliner} className={cn("mt-4 block", dense ? "text-[44px]" : "text-[48px] sm:text-[56px] xl:text-[64px]")} />
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {second.map((a) => (
          <Name key={a.slug} act={a} className={cn(dense ? "text-[22px]" : "text-[24px] sm:text-[28px]")} />
        ))}
      </p>
      <p className="mt-4 flex flex-wrap gap-x-2.5 gap-y-1 leading-tight">
        {third.map((a, i) => (
          <span key={a.slug} className="inline-flex items-baseline gap-2.5">
            <Name act={a} className="text-[15px] sm:text-[16px]" />
            {i < third.length - 1 && <span className="text-tg-orange" aria-hidden="true">·</span>}
          </span>
        ))}
      </p>
    </div>
  );
}

function Name({ act, className }: { act: Act; className?: string }) {
  return (
    <Link
      href={href.act(act.slug)}
      title={`${act.name}, ${stage(act.stage).full}, ${day(act.day).label} ${act.time}`}
      className={cn("tg-display transition-colors hover:text-tg-orange", className)}
    >
      {act.name}
    </Link>
  );
}
