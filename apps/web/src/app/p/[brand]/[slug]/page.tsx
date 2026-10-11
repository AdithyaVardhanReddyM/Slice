import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import type { BrandKit, PageDoc, QuizConfig } from "@slice/backend/convex/pagesTypes";
import { EmptyVariant, PageRenderer } from "@/components/pages/render-doc";
import { QuizBar } from "@/components/pages/quiz-bar";
import { CookieSync } from "@/components/pages/cookie-sync";
import { audienceCookieName, first, loadPage, resolveRequest } from "@/components/pages/resolve";

// Published page: {brand}.{PAGES_HOST}/{slug} is rewritten here by proxy.ts.
// Everything is request-time (cookies, geo headers, search params), so the
// body renders inside a Suspense boundary; nothing here is prerendered.

type Props = PageProps<"/p/[brand]/[slug]">;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { brand, slug } = await params;
  const sp = await searchParams;
  const data = await loadPage(brand, slug);
  if (!data) return { title: "Page not found", robots: { index: false } };
  const forced = first(sp.v);
  const variant = (forced && data.variants.find((v) => v._id === forced)) || data.variants.find((v) => v._id === data.page.defaultVariantId) || data.variants[0];
  const meta = (variant?.doc as PageDoc | undefined)?.meta;
  const draft = data.page.status !== "published";
  const preview = first(sp.preview) === "1" || Boolean(forced);
  return {
    title: meta?.title ?? data.page.title,
    description: meta?.description,
    openGraph: meta ? { title: meta.title, description: meta.description, images: meta.image ? [meta.image] : undefined, siteName: data.brand.name } : undefined,
    robots: draft || preview ? { index: false, follow: false } : undefined,
  };
}

export default function PublishedPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Resolved {...props} />
    </Suspense>
  );
}

async function Resolved({ params, searchParams }: Props) {
  const { brand: brandSlug, slug } = await params;
  const sp = await searchParams;
  const data = await loadPage(brandSlug, slug);
  if (!data) notFound();

  const { brand, page } = data;
  const kit = brand.kit as BrandKit | undefined;
  if (!kit) notFound();

  const wantsPreview = first(sp.preview) === "1" || Boolean(first(sp.v));
  if (page.status !== "published" && !wantsPreview) notFound();

  const cookieStore = await cookies();
  const h = await headers();
  const res = await resolveRequest(data, { sp, cookie: cookieStore.get(audienceCookieName(page._id))?.value, headers: h });

  if (!res.doc) {
    return <EmptyVariant brand={brand} kit={kit} title={page.title} />;
  }

  const audienceIds = data.variants.filter((v) => v.audienceId && v.status === "ready").map((v) => v.audienceId as string);

  return (
    <>
      <PageRenderer
        brand={{ name: brand.name, slug: brand.slug, url: brand.url }}
        kit={kit}
        doc={res.doc}
        variantId={res.resolved.variantId}
        pageId={page._id}
        trackingMeta={{ resolvedBy: res.resolved.resolvedBy, disabled: res.preview, overrides: res.overrides }}
        quiz={res.showQuiz && page.quiz ? <QuizBar pageId={page._id} quiz={page.quiz as QuizConfig} audienceIds={audienceIds} /> : null}
      />
      {res.remember ? <CookieSync pageId={page._id} audienceId={res.resolved.audienceId} how={res.resolved.resolvedBy} /> : null}
    </>
  );
}
