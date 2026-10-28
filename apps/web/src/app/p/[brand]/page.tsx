import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import type { BrandKit } from "@slice/backend/convex/pagesTypes";
import { googleFontsHref, kitToVars } from "@/components/pages/theme";
import { CONVEX_URL } from "@/components/pages/resolve";

// {brand}.{PAGES_HOST}/ lists the brand's published pages.

type Props = PageProps<"/p/[brand]">;

async function loadBrand(slug: string) {
  await connection();
  if (!CONVEX_URL) return null;
  return fetchQuery(api.pages.publishedBySlug, { brandSlug: slug }, { url: CONVEX_URL });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand } = await params;
  const data = await loadBrand(brand);
  return { title: data ? data.brand.name : "Not found", robots: { index: false } };
}

export default function BrandIndex(props: Props) {
  return (
    <Suspense fallback={null}>
      <Index {...props} />
    </Suspense>
  );
}

async function Index({ params }: Props) {
  const { brand: slug } = await params;
  const data = await loadBrand(slug);
  if (!data) notFound();
  const { brand, pages } = data;
  const kit = brand.kit as BrandKit | undefined;
  if (!kit) notFound();
  const fonts = googleFontsHref(kit);

  return (
    <div className="pg-root" style={kitToVars(kit)}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      <header className="pg-header">
        <div className="pg-container pg-header-inner">
          <a href={brand.url || "#"} className="pg-logo" aria-label={brand.name}>
            {kit.logo?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={kit.logo.src} alt={kit.logo.alt || brand.name} />
            ) : (
              <span className="pg-wordmark">{kit.wordmark || brand.name}</span>
            )}
          </a>
        </div>
      </header>
      <main className="pg-section pg-theme-light">
        <div className="pg-container pg-narrow">
          <h1 className="pg-h2" style={{ marginBottom: 32 }}>
            {pages.length ? `From ${brand.name}` : `${brand.name} has nothing published yet`}
          </h1>
          {pages.length ? (
            <div className="pg-index">
              {pages.map((p) => (
                <a key={p._id} href={`/p/${brand.slug}/${p.slug}`}>
                  <span className="pg-index-title">{p.title}</span>
                  <span className="pg-muted">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
