import { notFound } from "next/navigation";
import { href, ridgeline } from "@/lib/ridgeline";
import { ProductDetail } from "@/components/ridgeline/product-detail";

export function generateStaticParams() {
  return ridgeline.inCategory("Coffee").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/ridgeline/coffee/[slug]">) {
  const { slug } = await params;
  const p = ridgeline.get(slug);
  return { title: p?.name ?? "Not found", description: p?.description };
}

export default async function Page({ params }: PageProps<"/ridgeline/coffee/[slug]">) {
  const { slug } = await params;
  const product = ridgeline.get(slug);
  if (!product || product.category !== "Coffee") notFound();
  return <ProductDetail product={product} parent={{ name: "Coffee", url: href.coffee }} />;
}
