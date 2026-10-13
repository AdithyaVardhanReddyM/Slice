import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isHtmlDoc } from "@slice/backend/convex/pagesTypes";
import type { Brand, Variant } from "@/lib/pages/types";
import { loadPage } from "@/components/pages/resolve";
import { BuildReplay } from "@/components/console/pages/builder/build-replay";

// Dev-only: /p/_build?brand=tagide-festival&page=berlin&speed=1 replays a
// build of that page through the builder's chat card and canvas; &stop=20
// freezes it 20 seconds in.

export const metadata = { title: "Build replay", robots: { index: false } };

export default function BuildReplayPage(props: PageProps<"/p/_build">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <Replay {...props} />
    </Suspense>
  );
}

async function Replay({ searchParams }: PageProps<"/p/_build">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined, d: string) => (typeof v === "string" && v ? v : d);
  const data = await loadPage(one(sp.brand, "tagide-festival"), one(sp.page, "berlin"));
  const variant = data?.variants.find((v) => isHtmlDoc(v.doc));
  if (!data || !variant || !isHtmlDoc(variant.doc)) notFound();
  return <BuildReplay brand={data.brand as Brand} pageSlug={data.page.slug} variant={variant as Variant} doc={variant.doc} speed={Number(one(sp.speed, "1")) || 1} stopAt={sp.stop ? Number(sp.stop) : undefined} />;
}
