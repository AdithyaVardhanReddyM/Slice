import { notFound } from "next/navigation";
import { href, ridgeline } from "@/lib/ridgeline";
import { ProductDetail } from "@/components/ridgeline/product-detail";

export function generateStaticParams() {
  return ridgeline.inCategory("Subscriptions").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/ridgeline/subscriptions/[slug]">) {
  const { slug } = await params;
  const p = ridgeline.get(slug);
  return { title: p?.name ?? "Not found", description: p?.description };
}

export default async function Page({ params }: PageProps<"/ridgeline/subscriptions/[slug]">) {
  const { slug } = await params;
  const product = ridgeline.get(slug);
  if (!product || product.category !== "Subscriptions") notFound();
  return <ProductDetail product={product} parent={{ name: "Subscriptions", url: href.subscriptions }} cta="Start subscription" />;
}
