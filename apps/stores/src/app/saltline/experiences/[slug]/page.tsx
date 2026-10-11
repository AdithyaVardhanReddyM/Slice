import { notFound } from "next/navigation";
import { experiences, href, saltline } from "@/lib/saltline";
import { ItemDetail } from "@/components/saltline/item-detail";

export function generateStaticParams() {
  return experiences().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/saltline/experiences/[slug]">) {
  const { slug } = await params;
  const p = saltline.get(slug);
  return { title: p?.name ?? "Experience", description: p?.description };
}

export default async function ExperiencePage({ params }: PageProps<"/saltline/experiences/[slug]">) {
  const { slug } = await params;
  const product = saltline.get(slug);
  if (!product || product.category !== "Experiences") notFound();
  return <ItemDetail product={product} parent={{ name: "Experiences", url: href.experiences }} />;
}
