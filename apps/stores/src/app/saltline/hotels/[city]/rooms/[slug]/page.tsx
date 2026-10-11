import { notFound } from "next/navigation";
import { hotel, href, rooms, saltline, slugify } from "@/lib/saltline";
import { ItemDetail } from "@/components/saltline/item-detail";

export function generateStaticParams() {
  return rooms().map((p) => ({ city: slugify(p.subcategory), slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/saltline/hotels/[city]/rooms/[slug]">) {
  const { slug } = await params;
  const p = saltline.get(slug);
  return { title: p?.name ?? "Room", description: p?.description };
}

export default async function RoomPage({ params }: PageProps<"/saltline/hotels/[city]/rooms/[slug]">) {
  const { city, slug } = await params;
  const product = saltline.get(slug);
  const h = hotel(city);
  if (!product || !h || product.category !== "Rooms" || slugify(product.subcategory) !== city) notFound();
  return <ItemDetail product={product} parent={{ name: h.name, url: href.hotel(h.slug) }} />;
}
