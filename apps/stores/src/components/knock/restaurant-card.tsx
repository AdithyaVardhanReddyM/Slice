import Link from "next/link";
import { Clock, Star } from "lucide-react";
import { cn } from "cn";
import { areaById, etaLabel, href, img, signature, type KnockRestaurant } from "@/lib/knock/site";

/** Dark food photo with the offer across it, then rating, time, name and where. */
export function RestaurantCard({ r, priority, className }: { r: KnockRestaurant; priority?: boolean; className?: string }) {
  const area = areaById(r.area);
  return (
    <article className={cn("group flex flex-col", className)}>
      <Link href={href.restaurant(r.slug)} className="relative block aspect-[5/4] overflow-hidden rounded-[28px] bg-(--kn-ink)" aria-label={r.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img(r.image)}
          alt={r.imageAlt}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" aria-hidden />
        <span className="kn-display absolute bottom-5 left-5 right-5 text-[22px] leading-none text-white">{r.offer ?? signature(r)}</span>
      </Link>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="kn-tag">
          <Star className="size-3.5 fill-(--kn-yellow) text-(--kn-ink)" strokeWidth={1.5} />
          {r.rating.toFixed(1)}
        </span>
        <span className="kn-tag">
          <Clock className="size-3.5" strokeWidth={2} />
          {etaLabel(r)}
        </span>
      </div>
      <h3 className="kn-title mt-3 text-[21px]">
        <Link href={href.restaurant(r.slug)} className="hover:underline hover:decoration-2 hover:underline-offset-4">
          {r.name}
        </Link>
      </h3>
      <p className="mt-0.5 text-[15px] text-(--kn-ink-soft)">
        {r.cuisine} in {area?.name}
      </p>
    </article>
  );
}
