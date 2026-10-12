import Link from "next/link";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { eur, href } from "@/lib/tagide";
import { Photo } from "./photo";

export function TicketCard({ product, tone = "cream", detailed }: { product: Product; tone?: "cream" | "ink" | "lilac"; detailed?: boolean }) {
  const dark = tone === "ink";
  return (
    <article
      id={product.slug}
      className={cn(
        "flex flex-col overflow-hidden rounded-[22px] border-2 border-tg-ink",
        tone === "cream" && "bg-tg-cream",
        tone === "ink" && "bg-tg-ink text-tg-cream",
        tone === "lilac" && "bg-tg-lilac",
      )}
    >
      <div className="aspect-[16/9] overflow-hidden border-b-2 border-tg-ink">
        <Photo src={product.images[0]} alt={product.name} />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="tg-display text-[26px]">{product.name}</h3>
          <div className="text-right">
            <div className="tg-display text-[26px] text-tg-orange">{eur(product.price)}</div>
            {product.variants.length > 1 && product.variants[0].label !== "Per person" && (
              <div className={cn("text-[12px] font-semibold", dark ? "text-tg-cream/70" : "text-tg-mute")}>{product.variants[0].label}</div>
            )}
          </div>
        </div>
        <p className={cn("mt-3 text-[15px] leading-relaxed", dark ? "text-tg-cream/85" : "text-tg-ink-soft")}>{product.description}</p>
        {detailed && (
          <ul className={cn("mt-4 flex flex-col gap-1.5 text-[14px]", dark ? "text-tg-cream/85" : "text-tg-ink-soft")}>
            {product.details.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-tg-orange" />
                {d}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto pt-6">
          <Link href={detailed ? "#" : href.ticket(product)} className={cn("tg-btn w-full", dark ? "bg-tg-orange text-white hover:bg-tg-orange-deep" : "bg-tg-ink text-tg-cream hover:bg-black")}>
            {detailed ? "Buy" : "Details"}
          </Link>
        </div>
      </div>
    </article>
  );
}
