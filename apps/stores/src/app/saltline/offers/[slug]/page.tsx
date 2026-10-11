import { notFound } from "next/navigation";
import { href, offers, saltline } from "@/lib/saltline";
import { ItemDetail } from "@/components/saltline/item-detail";

export function generateStaticParams() {
  return offers().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/saltline/offers/[slug]">) {
  const { slug } = await params;
  const p = saltline.get(slug);
  return { title: p?.name ?? "Offer", description: p?.description };
}

export default async function OfferPage({ params }: PageProps<"/saltline/offers/[slug]">) {
  const { slug } = await params;
  const product = saltline.get(slug);
  if (!product || product.category !== "Offers") notFound();
  return <ItemDetail product={product} parent={{ name: "Offers", url: href.offers }} />;
}
