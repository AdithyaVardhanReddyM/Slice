import Link from "next/link";
import { cn } from "cn";
import type { BookingQuery } from "@/lib/covers/booking";
import { href, photo, priceLabel, type CoversRestaurant } from "@/lib/covers/site";

/** Photo, name, what it cooks and where, and (when given) the next free times to tap. */
export function RestaurantCard({ r, times, query, priority, className }: { r: CoversRestaurant; times?: string[]; query?: BookingQuery; priority?: boolean; className?: string }) {
  const to = href.restaurant(r.slug, query);
  return (
    <article className={cn("group flex flex-col", className)}>
      <Link href={to} className="relative block aspect-[4/3] overflow-hidden rounded-[14px] bg-(--cv-muted)" aria-label={r.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo(r, 800)}
          alt={r.photo.alt}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {r.isNew && <span className="absolute left-3 top-3 rounded-full bg-(--cv-primary) px-2.5 py-1 text-[12.5px] font-semibold leading-none text-(--cv-on-primary)">New on Covers</span>}
      </Link>
      <div className="mt-3.5 flex flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="cv-title text-[19px]">
            <Link href={to} className="hover:underline hover:decoration-1 hover:underline-offset-4">
              {r.name}
            </Link>
          </h3>
          <span className="shrink-0 text-[14.5px] font-medium text-(--cv-ink-soft)" aria-label={`Price ${r.price} of 4`}>
            {priceLabel(r.price)}
          </span>
        </div>
        <p className="mt-0.5 text-[14.5px] text-(--cv-mute)">
          {r.cuisine} in {r.neighbourhood}
        </p>
        {times && times.length > 0 && (
          <ul className="mt-auto flex flex-wrap gap-2 pt-3" aria-label={`Free tables at ${r.name}`}>
            {times.map((t) => (
              <li key={t}>
                <Link href={href.restaurant(r.slug, { ...query, time: t })} className="cv-slot">
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {times && times.length === 0 && <p className="mt-auto pt-3 text-[14px] text-(--cv-mute)">No tables left around then. Try another time.</p>}
      </div>
    </article>
  );
}
