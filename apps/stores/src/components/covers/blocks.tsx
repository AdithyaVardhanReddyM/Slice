import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "cn";
import {
  areaCover,
  collectionCover,
  countLabel,
  editor,
  href,
  inArea,
  inCollection,
  initials,
  photo,
  priceLabel,
  type CoversArea,
  type CoversCollection,
  type CoversEditorId,
  type CoversRestaurant,
} from "@/lib/covers/site";

export function SectionHead({ title, text, link, className }: { title: string; text?: string; link?: { label: string; to: string }; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-3", className)}>
      <div className="max-w-2xl">
        <h2 className="cv-display text-[30px] sm:text-[38px]">{title}</h2>
        {text && <p className="mt-2 text-[16.5px] leading-relaxed text-(--cv-ink-soft)">{text}</p>}
      </div>
      {link && <MoreLink {...link} />}
    </div>
  );
}

export function MoreLink({ label, to }: { label: string; to: string }) {
  return (
    <Link href={to} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-(--cv-ink) hover:text-(--cv-accent)">
      {label} <ArrowRight className="size-4" strokeWidth={2} />
    </Link>
  );
}

/** A collection: its cover photo with the name on a white label. */
export function CollectionTile({ c, className, lazy = true }: { c: CoversCollection; className?: string; lazy?: boolean }) {
  const cover = collectionCover(c.id);
  return (
    <Link href={href.collection(c.id)} className={cn("group relative block aspect-[4/5] overflow-hidden rounded-[16px] bg-(--cv-muted) sm:aspect-[5/6]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo(cover, 800)} alt={cover.photo.alt} loading={lazy ? "lazy" : "eager"} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      <span className="absolute inset-x-2.5 bottom-2.5 rounded-[12px] bg-white px-3.5 py-3 sm:inset-x-3 sm:bottom-3 sm:px-4">
        <span className="cv-title block text-[16px] leading-snug sm:text-[18px]">{c.name}</span>
        <span className="mt-0.5 block text-[13.5px] text-(--cv-mute)">{countLabel(inCollection(c.id).length)}</span>
      </span>
    </Link>
  );
}

/** An area: a square photo, its name, one line and how many restaurants. */
export function AreaRow({ a, className }: { a: CoversArea; className?: string }) {
  const cover = areaCover(a.id);
  const list = inArea(a.id);
  return (
    <Link href={href.area(a.id)} className={cn("group flex items-center gap-4 rounded-[16px] p-2 pr-4 transition-colors hover:bg-white sm:gap-5", className)}>
      <span className="size-[84px] shrink-0 overflow-hidden rounded-[12px] bg-(--cv-muted) sm:size-[104px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo(cover, 400)} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="cv-title text-[18px] sm:text-[19px]">{a.name}</span>
          <span className="shrink-0 text-[13.5px] text-(--cv-mute)">{countLabel(list.length)}</span>
        </span>
        <span className="mt-1 line-clamp-2 block text-[14.5px] leading-snug text-(--cv-ink-soft)">{a.blurb}</span>
      </span>
    </Link>
  );
}

export function EditorAvatar({ id, className }: { id: CoversEditorId; className?: string }) {
  const e = editor(id);
  const tone = { rosa: "bg-(--cv-primary) text-(--cv-on-primary)", kwame: "bg-(--cv-ink) text-white", hattie: "bg-(--cv-accent) text-white" }[id];
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold", tone, className)}>
      {initials(e.name)}
    </span>
  );
}

/** An editor's tip on a restaurant, with the restaurant underneath. */
export function NoteCard({ r, className }: { r: CoversRestaurant & { note: NonNullable<CoversRestaurant["note"]> }; className?: string }) {
  const e = editor(r.note.by);
  return (
    <article className={cn("cv-card flex flex-col overflow-hidden", className)}>
      <Link href={href.restaurant(r.slug)} className="group block aspect-[16/10] overflow-hidden bg-(--cv-muted)">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo(r, 800)} alt={r.photo.alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="text-[14px] text-(--cv-mute)">
          <Link href={href.restaurant(r.slug)} className="font-semibold text-(--cv-ink) hover:text-(--cv-accent)">
            {r.name}
          </Link>{" "}
          in {r.neighbourhood}, {priceLabel(r.price)}
        </p>
        <blockquote className="cv-title mt-3 text-[19px] leading-snug">&ldquo;{r.note.text}&rdquo;</blockquote>
        <div className="mt-auto flex items-center gap-3 pt-5">
          <EditorAvatar id={r.note.by} />
          <span className="text-[14px] leading-tight">
            <span className="block font-semibold">{e.name}</span>
            <span className="text-(--cv-mute)">{e.role}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

/** The top of a collection or area page: words on the left, its photo on the right. */
export function LandingHead({ crumb, title, text, meta, cover, children }: { crumb: { label: string; to: string }; title: string; text: string; meta: string; cover: CoversRestaurant; children?: ReactNode }) {
  return (
    <div className="border-b border-(--cv-line) bg-white">
      <div className="cv-container grid gap-8 py-10 sm:py-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-14">
        <div>
          <nav aria-label="Breadcrumb" className="text-[14px] text-(--cv-mute)">
            <Link href={href.home} className="hover:text-(--cv-ink)">
              Covers
            </Link>
            <span className="px-2">/</span>
            <Link href={crumb.to} className="hover:text-(--cv-ink)">
              {crumb.label}
            </Link>
          </nav>
          <h1 className="cv-display mt-3 text-[38px] sm:text-[52px]">{title}</h1>
          <p className="mt-3 max-w-xl text-[18px] leading-relaxed text-(--cv-ink-soft)">{text}</p>
          <p className="mt-4 text-[15px] font-medium text-(--cv-mute)">{meta}</p>
          {children}
        </div>
        <Link href={href.restaurant(cover.slug)} className="group relative block aspect-[16/10] overflow-hidden rounded-[20px] bg-(--cv-muted)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo(cover, 1200)} alt={cover.photo.alt} fetchPriority="high" className="h-full w-full object-cover" />
          <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold shadow-sm group-hover:text-(--cv-accent)">{cover.name}</span>
        </Link>
      </div>
    </div>
  );
}
