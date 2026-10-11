import { notFound } from "next/navigation";
import { href, ridgeline } from "@/lib/ridgeline";
import { ProductDetail } from "@/components/ridgeline/product-detail";

export function generateStaticParams() {
  return ridgeline.inCategory("Gift sets").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/ridgeline/gifts/[slug]">) {
  const { slug } = await params;
  const p = ridgeline.get(slug);
  return { title: p?.name ?? "Not found", description: p?.description };
}

export default async function Page({ params }: PageProps<"/ridgeline/gifts/[slug]">) {
  const { slug } = await params;
  const product = ridgeline.get(slug);
  if (!product || product.category !== "Gift sets") notFound();
  return <ProductDetail product={product} parent={{ name: "Gift sets", url: href.gifts }} />;
}
