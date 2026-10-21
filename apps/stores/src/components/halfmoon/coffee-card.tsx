import Link from "next/link";
import { cn } from "cn";
import { href, img, money, type HalfMoonCoffee } from "@/lib/halfmoon/site";

/** Pastel card in the coffee's own colour: name, one line, add to bag, and the bag rising from the bottom edge. */
export function CoffeeCard({ c, className }: { c: HalfMoonCoffee; className?: string }) {
  return (
    <article className={cn("group relative flex min-h-[560px] flex-col overflow-hidden rounded-[28px] p-7 sm:min-h-[620px] sm:p-9", className)} style={{ background: c.tint }}>
      <div className="relative z-10">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-(--hm-ink-soft)">{c.kind}</p>
        <h3 className="hm-title mt-2 text-[30px]">
          <Link href={href.coffee(c.slug)} className="after:absolute after:inset-0 after:content-['']">
            {c.name}
          </Link>
        </h3>
        <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-(--hm-ink-soft)">{c.line}</p>
        <div className="relative z-20 mt-6 flex items-center gap-3">
          <Link href={href.coffee(c.slug)} className="hm-btn hm-btn-white hm-btn-sm">
            Add to bag, {money(c.price)}
          </Link>
          <span className="text-[13.5px] text-(--hm-ink-soft)">{c.size}</span>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img(c.image)}
        alt={c.imageAlt}
        loading="lazy"
        className={cn(
          "pointer-events-none absolute bottom-0 left-1/2 w-auto max-w-none -translate-x-1/2 translate-y-[14%] transition-transform duration-500 group-hover:translate-y-[10%]",
          c.isCan ? "h-[400px] sm:h-[430px]" : "h-[400px] sm:h-[450px]",
        )}
      />
    </article>
  );
}
