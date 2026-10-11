import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, hotel, href, post, posts, saltline, sceneSrc } from "@/lib/saltline";
import { ItemCard } from "@/components/saltline/item-card";
import { Photo } from "@/components/saltline/photo";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/saltline/journal/[slug]">) {
  const { slug } = await params;
  const p = post(slug);
  return { title: p?.title ?? "Journal", description: p?.standfirst };
}

export default async function PostPage({ params }: PageProps<"/saltline/journal/[slug]">) {
  const { slug } = await params;
  const p = post(slug);
  if (!p) notFound();
  const h = hotel(p.hotel);
  const related = p.related.map((s) => saltline.get(s)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.standfirst,
    datePublished: p.date,
    author: { "@type": "Person", name: p.author.split(",")[0] },
    publisher: { "@type": "Organization", name: saltline.store.name },
    image: sceneSrc(p.scene),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <article className="sl-container py-10 lg:py-14">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm text-sl-mute">
            <Link href={href.journal} className="hover:text-sl-charcoal">Journal</Link>
            {h && (
              <>
                {" "}· <Link href={href.hotel(h.slug)} className="hover:text-sl-charcoal">{h.name}</Link>
              </>
            )}{" "}
            · {formatDate(p.date)}
          </p>
          <h1 className="sl-serif mt-5 text-[44px] sm:text-[64px]">{p.title}</h1>
          <p className="mt-5 text-[19px] text-sl-charcoal-soft">{p.standfirst}</p>
          <p className="mt-4 text-sm text-sl-mute">{p.author} · {p.readingTime}</p>
        </header>
        <div className="mx-auto mt-12 aspect-[16/9] max-w-5xl overflow-hidden bg-sl-stone">
          <Photo src={sceneSrc(p.scene)} alt="" priority />
        </div>
        <div className="mx-auto mt-14 max-w-2xl space-y-6 text-[18px] leading-[1.75] text-sl-charcoal">
          {p.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </article>
      {related.length > 0 && (
        <section className="sl-container mt-16 border-t border-sl-line pt-12">
          <h2 className="sl-serif text-[32px]">Mentioned here</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-3">
            {related.map((x) => (
              <ItemCard key={x.id} product={x} sizes="(min-width: 1024px) 33vw, 50vw" />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
