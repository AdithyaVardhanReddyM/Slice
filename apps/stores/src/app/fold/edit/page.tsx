import Link from "next/link";
import { fold, href } from "@/lib/fold";
import { ProductImage } from "@/components/fold/product-image";

export const metadata = { title: "The edits" };

// Index of the ten style edits: each a numbered row with a fan of three pieces.
export default function EditsPage() {
  return (
    <main className="px-4 sm:px-8">
      <header className="pb-14 pt-14 lg:pt-20">
        <p className="tag text-fog">Ten ways to dress</p>
        <h1 className="didone fold-rise mt-4 text-[17vw] leading-[0.86] sm:text-8xl lg:text-[8.5rem]">
          the <em>edits</em>
        </h1>
      </header>
      <ol>
        {fold.store.styles.map((s, i) => {
          const items = fold.withStyle(s.id);
          const fan = items.filter((p) => p.images.length).slice(0, 3);
          const brands = new Set(items.map((p) => p.brand)).size;
          return (
            <li key={s.id} className="border-t border-seam last:border-b">
              <Link
                href={href.edit(s.id)}
                className="group grid items-center gap-6 py-8 md:grid-cols-[4rem_1fr_16rem] lg:grid-cols-[5rem_1fr_22rem]"
              >
                <span className="tag text-fog">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2 className="didone text-5xl transition-colors group-hover:italic group-hover:text-signal sm:text-7xl">
                    {s.label.toLowerCase()}
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-bone-2">{s.description}</p>
                  <p className="tag mt-4 text-fog">
                    {items.length} pieces · {brands} labels
                  </p>
                </div>
                <div className="relative hidden h-44 md:block">
                  {fan.map((p, j) => (
                    <div
                      key={p.id}
                      className="absolute top-0 h-44 w-32 overflow-hidden bg-night-3 shadow-xl shadow-black/50 transition-transform duration-700 ease-fold"
                      style={{
                        left: `${j * 28}%`,
                        transform: `rotate(${(j - 1) * 5}deg)`,
                        zIndex: 3 - Math.abs(j - 1),
                      }}
                    >
                      <ProductImage product={p} sizes="128px" />
                    </div>
                  ))}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
