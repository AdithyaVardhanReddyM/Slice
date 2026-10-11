import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, href, post, posts, ridgeline, sceneSrc } from "@/lib/ridgeline";
import { ProductCard } from "@/components/ridgeline/product-card";
import { Scene } from "@/components/ridgeline/product-image";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/ridgeline/journal/[slug]">) {
  const { slug } = await params;
  const p = post(slug);
  return { title: p?.title ?? "Journal", description: p?.standfirst };
}

export default async function PostPage({ params }: PageProps<"/ridgeline/journal/[slug]">) {
  const { slug } = await params;
  const p = post(slug);
  if (!p) notFound();
  const related = p.related.map((s) => ridgeline.get(s)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.standfirst,
    datePublished: p.date,
    author: { "@type": "Person", name: p.author.split(",")[0] },
    publisher: { "@type": "Organization", name: ridgeline.store.name },
    image: sceneSrc(p.scene),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <article className="rl-container py-10">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-rl-rust">
            <Link href={href.journal} className="hover:underline">Journal</Link> · {formatDate(p.date)} · {p.readingTime}
          </p>
          <h1 className="rl-serif mt-4 text-[38px] sm:text-[54px]">{p.title}</h1>
          <p className="mt-5 text-[19px] text-rl-ink-soft">{p.standfirst}</p>
          <p className="mt-4 text-sm text-rl-mute">{p.author}</p>
        </header>
        <div className="mx-auto mt-10 aspect-[16/9] max-w-5xl overflow-hidden rounded-[4px] bg-rl-sand">
          <Scene src={sceneSrc(p.scene)} alt="" priority />
        </div>
        <div className="mx-auto mt-12 max-w-2xl space-y-6 text-[18px] leading-[1.7] text-rl-ink">
          {p.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </article>

      {related.length > 0 && (
        <section className="rl-container mt-16 border-t border-rl-line pt-12">
          <h2 className="rl-serif text-[28px]">Mentioned in this post</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {related.map((x) => (
              <ProductCard key={x.id} product={x} sizes="(min-width: 1024px) 25vw, 50vw" />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
