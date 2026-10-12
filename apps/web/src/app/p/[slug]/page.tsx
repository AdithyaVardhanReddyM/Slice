import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchAction, fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import { LandingView } from "@/components/pages/landing";
import { LandingTracker, TasteQuiz } from "@/components/pages/landing-client";

// A published page. The variant is picked per request from what we know about
// the visitor (pages.resolve): a shared ?seg= link, their quiz answer (cookie),
// a Slice taste profile (?p=), the campaign (utm_*), or their city's Qloo
// taste (Vercel's geo header, or ?city= to try it). Unknown cities are scored
// on the fly, with a short timeout so the page never waits long.

const SLUG = /^[a-z0-9-]{1,64}$/;
const CITY_TIMEOUT_MS = 2500;

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function cleanCity(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let city = raw;
  try {
    city = decodeURIComponent(raw);
  } catch {}
  city = city.trim();
  return /^[\p{L}][\p{L} .'-]{1,59}$/u.test(city) ? city : undefined;
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return { title: "Page not found" };
  const meta = await fetchQuery(api.pages.meta, { slug }).catch(() => null);
  if (!meta) return { title: "Page not found" };
  return {
    title: { absolute: meta.title },
    description: meta.description,
    icons: meta.icon && /^https?:\/\//.test(meta.icon) ? [{ url: meta.icon }] : undefined,
  };
}

export default function PublishedPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Landing params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Landing({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const [sp, h, jar] = await Promise.all([searchParams, headers(), cookies()]);

  const city = cleanCity(first(sp.city)) ?? cleanCity(h.get("x-vercel-ip-city"));
  const utm = ["utm_campaign", "utm_term", "utm_content", "utm_source"]
    .map((k) => first(sp[k])?.slice(0, 100))
    .filter((v): v is string => !!v);
  const args = {
    slug,
    seg: first(sp.seg)?.slice(0, 40),
    choice: jar.get(`slp_${slug}`)?.value.slice(0, 40),
    profileId: first(sp.p)?.slice(0, 64),
    utm,
    city,
  };

  let resolved = await fetchQuery(api.pages.resolve, args).catch(() => null);
  if (!resolved) notFound();
  if (resolved.needsCity && city) {
    const scored = await Promise.race([
      fetchAction(api.pageRouting.cityFit, { slug, city }).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), CITY_TIMEOUT_MS)),
    ]);
    if (scored) resolved = (await fetchQuery(api.pages.resolve, args).catch(() => null)) ?? resolved;
  }

  const { page, brand, segment, reason, quiz } = resolved;
  return (
    <main className="min-h-screen">
      <LandingView
        kit={brand.kit}
        domain={brand.domain}
        segment={segment}
        reason={reason}
        ctaUrl={page.ctaUrl}
        afterHero={
          quiz.length > 1 ? (
            <TasteQuiz
              slug={page.slug}
              pageId={page.id}
              options={quiz}
              current={segment.id}
              picked={reason.source !== "default"}
            />
          ) : null
        }
      />
      <LandingTracker pageId={page.id} segmentId={segment.id} source={reason.source} city={city} />
    </main>
  );
}
