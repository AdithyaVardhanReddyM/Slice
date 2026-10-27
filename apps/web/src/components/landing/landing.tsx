import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Heart,
  LayoutTemplate,
  Mail,
  MessagesSquare,
  Mic,
  MousePointerClick,
  ScanEye,
  UserStar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentsTour, type TourAgent } from "./agents-tour";
import { LaptopFrame, PhoneFrame, TalkKeys } from "./devices";
import { Showcase } from "./showcase";
import "./landing.css";

const NAV = [
  { href: "#media", label: "Media" },
  { href: "#pages", label: "Pages" },
  { href: "#email", label: "Email" },
  { href: "#concierge", label: "Concierge" },
  { href: "#mac", label: "Mac" },
];

export function Landing() {
  return (
    <div className="bg-[#fbf8f1] text-neutral-950">
      <Header />
      <main>
        <Hero />
        <Brands />
        <HowItWorks />
        <Audiences />
        <section className="pb-10 lg:pb-0">
          <div className="mx-auto max-w-[760px] px-4 pb-12 text-center sm:px-6 lg:pb-4">
            <p className="text-sm font-medium text-brand-orange">
              Four agents for your business
            </p>
            <h2 className="landing-serif mt-4 text-5xl leading-[1.02] sm:text-7xl">
              Each one owns a job your team never has time for.
            </h2>
          </div>
          <AgentsTour agents={AGENTS} />
        </section>
        <MacSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* Shared bits */

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 17 20" fill="currentColor" aria-hidden className={className}>
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1ZM11.6 3c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z" />
    </svg>
  );
}

function PrimaryButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-12 items-center gap-2 rounded-full bg-neutral-950 px-6 text-[15px] font-medium text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.5)] transition-all hover:-translate-y-px hover:bg-neutral-800",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function SecondaryButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-neutral-950 ring-1 ring-black/10 transition-all hover:-translate-y-px hover:bg-neutral-50",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function Tag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-1.5 rounded-full bg-white py-1 pr-3 pl-1 text-xs font-medium whitespace-nowrap text-neutral-900 shadow-[0_8px_24px_rgb(0_0_0/0.16)] sm:text-[13px]",
        className,
      )}
    >
      <span className="grid size-5 place-items-center rounded-full bg-brand-yellow sm:size-6">
        <UserStar className="size-3 sm:size-3.5" />
      </span>
      {children}
    </div>
  );
}

/** A painting with a composition laid over it; fills its parent on large screens. */
function Composition({
  art,
  children,
}: {
  art: string;
  children: ReactNode;
}) {
  return (
    <div className="relative aspect-[5/4] w-full lg:aspect-auto lg:size-full">
      <div className="absolute inset-0 overflow-hidden rounded-[22px] bg-brand-sand">
        <Image
          src={art}
          alt=""
          fill
          sizes="(min-width: 1024px) 680px, 100vw"
          className="object-cover"
        />
      </div>
      {children}
    </div>
  );
}

/* Header */

function Header() {
  return (
    <header className="sticky top-3 z-50 px-3 sm:top-4 sm:px-6">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between rounded-full bg-white/80 pr-2 pl-5 shadow-[0_8px_30px_-12px_rgb(60_30_0/0.25)] ring-1 ring-black/5 backdrop-blur-xl">
        <Link href="/" aria-label="Slice home" className="shrink-0">
          <Image
            src="/brand/slice_logo_blktext.svg"
            alt="Slice"
            width={88}
            height={20}
            priority
          />
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-950"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link
            href="/sign-in"
            className="hidden rounded-full px-3.5 py-2 text-sm text-neutral-600 hover:text-neutral-950 sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center rounded-full bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

/* Hero */

function Hero() {
  return (
    <section className="relative -mt-[72px] overflow-hidden px-4 pt-32 pb-16 sm:px-6 sm:pt-44 sm:pb-24">
      <div className="landing-dots pointer-events-none absolute inset-x-0 top-0 h-[760px] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto flex max-w-[960px] flex-col items-center text-center">
        <a
          href="#how"
          className="mb-8 inline-flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-[13px] text-neutral-600 shadow-sm ring-1 ring-black/5 transition-colors hover:text-neutral-950"
        >
          <span className="rounded-full bg-brand-yellow px-2 py-0.5 font-medium text-neutral-950">
            Five agents
          </span>
          One taste graph, from Qloo
          <ArrowRight className="size-3.5" />
        </a>
        <h1 className="landing-serif text-[68px] leading-[0.92] sm:text-[112px] lg:text-[136px]">
          Agents, with{" "}
          <span className="relative inline-block whitespace-nowrap">
            taste.
            <svg
              viewBox="0 0 200 24"
              preserveAspectRatio="none"
              aria-hidden
              className="absolute -bottom-[0.06em] left-[2%] h-[0.16em] w-[92%]"
            >
              <path
                d="M4 16C50 6 120 4 196 12"
                pathLength={1}
                fill="none"
                stroke="#ff7900"
                strokeWidth={7}
                strokeLinecap="round"
                className="landing-draw"
              />
            </svg>
          </span>
        </h1>
        <p className="mt-9 max-w-[640px] text-lg leading-relaxed text-neutral-600 sm:text-xl">
          Slice makes your ads, landing pages and emails, guides the shoppers in
          your store, and runs errands on your Mac. Every pick starts from what
          people actually love.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <PrimaryButton href="/sign-up">
            Start for free
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </PrimaryButton>
          <SecondaryButton href="#mac">
            <AppleLogo className="size-4 -translate-y-px" />
            Download for Mac
          </SecondaryButton>
        </div>
      </div>
      <div className="relative mt-16 sm:mt-24">
        <Showcase />
      </div>
    </section>
  );
}

/* Demo brands */

function Brands() {
  const icon = (src: string, name: string, size = 28) => (
    <span className="flex items-center gap-2 text-[19px] font-semibold tracking-tight">
      <Image src={src} alt="" width={size} height={size} className="rounded-md" />
      {name}
    </span>
  );
  const logos: { key: string; node: ReactNode }[] = [
    { key: "tagide", node: icon("/landing/brands/tagide.svg", "Tágide") },
    {
      key: "knock",
      node: <Image src="/landing/brands/knock.svg" alt="Knock" width={104} height={28} />,
    },
    {
      key: "halfmoon",
      node: (
        <Image src="/landing/brands/halfmoon.svg" alt="Half Moon Coffee" width={124} height={28} />
      ),
    },
    {
      key: "covers",
      node: <Image src="/landing/brands/covers.svg" alt="Covers" width={120} height={28} />,
    },
    {
      key: "stackhouse",
      node: (
        <Image src="/landing/brands/stackhouse.svg" alt="Stackhouse Books" width={172} height={28} />
      ),
    },
    { key: "gwen", node: icon("/landing/brands/gwen.svg", "Gwen") },
    {
      key: "marlow",
      node: <span className="text-[24px] font-black tracking-tighter uppercase">Marlow</span>,
    },
    { key: "fold", node: icon("/landing/brands/fold.svg", "fold", 24) },
  ];
  return (
    <section className="px-4 pb-6 sm:px-6">
      <p className="text-center text-sm text-neutral-500">
        Running today for eight demo brands, from a festival in Lisbon to a
        bookshop in Brooklyn
      </p>
      <div className="mx-auto mt-8 flex max-w-[1240px] flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {logos.map((l) => (
          <div
            key={l.key}
            className="flex h-9 items-center opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
          >
            {l.node}
          </div>
        ))}
      </div>
    </section>
  );
}

/* How it works */

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-[1240px]">
        <div className="landing-reveal mx-auto max-w-[780px] text-center">
          <p className="text-sm font-medium text-brand-orange">
            How every Slice agent works
          </p>
          <h2 className="landing-serif mt-4 text-5xl leading-[1.02] sm:text-7xl">
            Taste is the brief. Qloo is the toolbox.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-neutral-600">
            Before an agent makes anything, it reads who it is working for: the
            music, films, food, brands and places they love, through
            Qloo&apos;s cultural graph. Then it reaches for Qloo whenever it
            needs to know more, and shows you the evidence for every choice.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          <HowCard
            step="1"
            title="It starts from a taste brief"
            body="A city, an age band, a few artists, a customer list or five quick answers become one Qloo read of the audience."
          >
            <BriefVisual />
          </HowCard>
          <HowCard
            step="2"
            title="It calls Qloo as it works"
            body="Re-rank a lineup, check which brands a crowd already buys, map where they live. The agent decides when it needs to."
          >
            <ToolsVisual />
          </HowCard>
          <HowCard
            step="3"
            title="It shows you why"
            body="Every creative, page, email and product carries the signals behind it, written in plain words."
          >
            <WhyVisual />
          </HowCard>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {[
            { n: "57", label: "festival acts re-ranked for fans from Berlin" },
            { n: "48", label: "London restaurants ranked for Olivia's email" },
            { n: "160", label: "Marlow pieces compared for one shopper" },
            { n: "6", label: "landing pages from one Tágide lineup" },
          ].map((s) => (
            <div
              key={s.n}
              className="landing-reveal rounded-[24px] bg-white p-6 ring-1 ring-black/5 sm:p-7"
            >
              <p className="landing-serif text-6xl text-brand-orange sm:text-7xl">
                {s.n}
              </p>
              <p className="mt-2 text-[15px] leading-snug text-neutral-600">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowCard({
  step,
  title,
  body,
  children,
}: {
  step: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="landing-reveal flex flex-col overflow-hidden rounded-[28px] bg-white ring-1 ring-black/5">
      <div className="relative flex h-[300px] items-center justify-center overflow-hidden bg-[#f6efe0] p-6">
        <div className="landing-dots absolute inset-0 opacity-50 [mask-image:radial-gradient(circle_at_50%_50%,black,transparent_75%)]" />
        <div className="relative w-full">{children}</div>
      </div>
      <div className="p-7">
        <div className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-full bg-neutral-950 text-[13px] font-medium text-white">
            {step}
          </span>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        </div>
        <p className="mt-3 leading-relaxed text-neutral-600">{body}</p>
      </div>
    </div>
  );
}

function BriefVisual() {
  const people = [
    { src: "/landing/q-peggy.webp", name: "Peggy Gou" },
    { src: "/landing/q-ellen.webp", name: "Ellen Allien" },
    { src: "/landing/q-dettmann.webp", name: "Marcel Dettmann" },
    { src: "/landing/q-fka.webp", name: "FKA twigs" },
  ];
  return (
    <div className="mx-auto w-full max-w-[300px] rotate-[-2deg] rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgb(80_40_0/0.4)]">
      <p className="text-xs text-neutral-500">Audience</p>
      <p className="mt-0.5 font-semibold">Fans from Berlin</p>
      <div className="mt-4 flex items-center">
        {people.map((p, i) => (
          <Image
            key={p.name}
            src={p.src}
            alt={p.name}
            width={40}
            height={40}
            className={cn(
              "size-9 rounded-full object-cover ring-2 ring-white",
              i > 0 && "-ml-2",
            )}
          />
        ))}
        <span className="ml-3 text-xs leading-snug text-neutral-500">
          Loves Peggy Gou, Ellen Allien and more
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {["Avant-garde", "Functional details", "Dramatic", "European"].map((t) => (
          <span
            key={t}
            className="rounded-full bg-[#fff4cc] px-2.5 py-1 text-xs text-neutral-800"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ToolsVisual() {
  const calls = [
    "Ranked 57 acts for fans from Berlin",
    "Found the coffee hikers already drink",
    "Mapped where Lakers fans live in LA",
    "Compared Dad's taste with Walter's",
  ];
  return (
    <div className="mx-auto w-full max-w-[310px] space-y-2">
      {calls.map((c, i) => (
        <div
          key={c}
          className="landing-step flex items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-[13px] shadow-[0_10px_30px_-15px_rgb(80_40_0/0.45)]"
          style={{ marginLeft: `${(i % 2) * 16}px`, "--i": i } as CSSProperties}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-orange text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
          {c}
        </div>
      ))}
    </div>
  );
}

function WhyVisual() {
  return (
    <div className="mx-auto w-full max-w-[300px] rotate-[2deg] rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgb(80_40_0/0.4)]">
      <p className="font-semibold">Frances Ha</p>
      <p className="text-xs text-neutral-500">Film, 2012</p>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#ffecd9] px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[#b54a00]">
        <Heart className="size-3.5 fill-current" />
        Because you love Bon Iver and Mitski
      </div>
      <ul className="mt-4 space-y-2 text-[13px] text-neutral-600">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-brand-orange" strokeWidth={3} />
          Tender and restless, like your records
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-brand-orange" strokeWidth={3} />
          Close to Aftersun and Past Lives
        </li>
      </ul>
    </div>
  );
}

/* Audience marquee */

const AUDIENCES_A = [
  { name: "Fans from Berlin", img: "/landing/q-peggy.webp" },
  { name: "Lakers game night", img: "/landing/poster-lakers.webp" },
  { name: "Bay Area trail crowd", img: "/landing/poster-trail.webp" },
  { name: "Food lovers in Chicago", img: "/landing/q-next.webp" },
  { name: "Under 25s in Lisbon", img: "/landing/q-fred.webp" },
  { name: "Small plates & natural wine", img: "/landing/q-jolene.webp" },
  { name: "Anime night", img: "/landing/poster-ad-anime.webp" },
  { name: "Newly engaged in Austin", img: "/landing/q-ace.webp" },
  { name: "Slow mornings", img: "/landing/poster-no-rush.webp" },
];
const AUDIENCES_B = [
  { name: "Olivia in Notting Hill", img: "/landing/q-ledbury.webp" },
  { name: "Música Mexicana fans", img: "/landing/poster-ad-birria.webp" },
  { name: "NYC film lovers", img: "/landing/poster-film.webp" },
  { name: "Metalheads", img: "/landing/poster-heavy-rotation.webp" },
  { name: "Leo in Peckham", img: "/landing/q-rambutan.webp" },
  { name: "Patagonia fans", img: "/landing/q-hozier.webp" },
  { name: "Grand rooms", img: "/landing/q-rivercafe.webp" },
  { name: "Fans of Tyler, the Creator", img: "/landing/q-tyler.webp" },
];

function MarqueeRow({
  items,
  reverse,
}: {
  items: { name: string; img: string }[];
  reverse?: boolean;
}) {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
      <div
        className="landing-marquee flex shrink-0 gap-3 py-2 pr-3"
        data-reverse={reverse ? "" : undefined}
      >
        {[...items, ...items].map((a, i) => (
          <span
            key={i}
            aria-hidden={i >= items.length}
            className="flex items-center gap-2.5 rounded-full bg-white py-1.5 pr-5 pl-1.5 text-base whitespace-nowrap shadow-[0_6px_20px_-12px_rgb(80_40_0/0.4)] ring-1 ring-black/5"
          >
            <Image
              src={a.img}
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-full object-cover object-top"
            />
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function Audiences() {
  return (
    <section className="pt-4 pb-24 sm:pb-32">
      <div className="mx-auto max-w-[1240px] px-4 text-center sm:px-6">
        <h2 className="landing-serif text-5xl leading-[1.02] sm:text-7xl">
          One brief.
          <br />A version for every crowd.
        </h2>
        <p className="mx-auto mt-5 max-w-[560px] text-lg text-neutral-600">
          The audiences our demo brands run right now, from whole cities down to
          a single customer.
        </p>
      </div>
      <div className="mt-12 flex flex-col gap-1">
        <MarqueeRow items={AUDIENCES_A} />
        <MarqueeRow items={AUDIENCES_B} reverse />
      </div>
    </section>
  );
}

/* The four business agents */

function MediaVisual() {
  const posters = [
    {
      src: "/landing/poster-lakers.webp",
      audience: "Lakers game night",
      tilt: "-rotate-[7deg] translate-y-[4%]",
      side: true,
    },
    {
      src: "/landing/poster-trail.webp",
      audience: "Bay Area trail crowd",
      tilt: "z-10 -translate-y-[2%]",
      side: false,
    },
    {
      src: "/landing/poster-heavy-rotation.webp",
      audience: "Metalheads",
      tilt: "rotate-[7deg] translate-y-[4%]",
      side: true,
    },
  ];
  return (
    <Composition art="/landing/art-city.webp">
      <div className="group absolute inset-0 flex items-center justify-center">
        {posters.map((p) => (
          <figure
            key={p.src}
            className={cn(
              "relative -mx-[2.5%] w-[28%] transition-transform duration-500 group-hover:mx-[1%]",
              p.tilt,
            )}
          >
            <Image
              src={p.src}
              alt={`Poster made for ${p.audience}`}
              width={720}
              height={1280}
              sizes="(min-width: 1024px) 200px, 30vw"
              className="h-auto w-full rounded-xl shadow-[0_30px_60px_-15px_rgb(40_10_0/0.6)] ring-1 ring-white/20"
            />
            <figcaption
              className={cn(
                "absolute -bottom-4 left-1/2 -translate-x-1/2",
                p.side && "hidden sm:block",
              )}
            >
              <Tag>{p.audience}</Tag>
            </figcaption>
          </figure>
        ))}
      </div>
    </Composition>
  );
}

function MiniBrowser({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-[0_30px_60px_-15px_rgb(40_10_0/0.55)] ring-1 ring-black/5 sm:rounded-xl">
      <div className="flex h-4 items-center gap-1 px-2 sm:h-5 sm:px-3">
        <span className="size-1.5 rounded-full bg-neutral-300" />
        <span className="size-1.5 rounded-full bg-neutral-300" />
        <span className="size-1.5 rounded-full bg-neutral-300" />
      </div>
      <Image
        src={src}
        alt={alt}
        width={1440}
        height={900}
        sizes="(min-width: 1024px) 440px, 64vw"
        className="h-auto w-full"
      />
    </div>
  );
}

function PagesVisual() {
  return (
    <Composition art="/landing/art-coast.webp">
      <div className="absolute top-[10%] right-[5%] w-[44%] rotate-[3deg]">
        <MiniBrowser src="/landing/page-patagonia.webp" alt="Tágide page for Patagonia fans" />
        <Tag className="absolute -top-3 right-3">Patagonia fans</Tag>
      </div>
      <div className="absolute bottom-[10%] left-[5%] w-[44%] -rotate-[3deg]">
        <MiniBrowser src="/landing/page-under25.webp" alt="Tágide page for under 25s" />
        <Tag className="absolute -bottom-3 left-3">Under 25s</Tag>
      </div>
      <div className="absolute top-1/2 left-1/2 w-[64%] -translate-x-1/2 -translate-y-1/2">
        <MiniBrowser src="/landing/page-berlin.webp" alt="Tágide page for fans from Berlin" />
        <Tag className="absolute -bottom-3 left-4">Fans from Berlin</Tag>
      </div>
    </Composition>
  );
}

/** An email on a phone screen; the image already carries the inbox header and the time. */
function MailScreen({
  src,
  alt,
  scroll,
}: {
  src: string;
  alt: string;
  scroll?: boolean;
}) {
  return (
    <div className="size-full bg-white pt-[14%] [container-type:size]">
      <div
        className={cn(scroll && "landing-mail-scroll")}
        style={{ "--phone-h": "86cqh" } as CSSProperties}
      >
        <Image
          src={src}
          alt={alt}
          width={780}
          height={6110}
          sizes="260px"
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

function EmailVisual() {
  return (
    <Composition art="/landing/art-terrace.webp">
      <div className="absolute inset-0 flex items-center justify-center gap-[7%]">
        <div className="relative h-[78%] translate-y-[3%] -rotate-[5deg]">
          <PhoneFrame className="h-full drop-shadow-[0_30px_30px_rgb(40_10_0/0.45)]">
            <MailScreen src="/landing/mail-leo.webp" alt="Covers email written for Leo" />
          </PhoneFrame>
          <div className="absolute -bottom-3 left-1/2 hidden -translate-x-1/2 sm:block">
            <Tag>Leo in Peckham</Tag>
          </div>
        </div>
        <div className="relative h-[86%]">
          <PhoneFrame className="h-full drop-shadow-[0_30px_30px_rgb(40_10_0/0.45)]">
            <MailScreen
              scroll
              src="/landing/mail-olivia.webp"
              alt="Covers email written for Olivia"
            />
          </PhoneFrame>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
            <Tag>Olivia, a Core regular</Tag>
          </div>
        </div>
      </div>
    </Composition>
  );
}

function ConciergeVisual() {
  return (
    <Composition art="/landing/art-room.webp">
      <div className="absolute top-[8%] left-[5%] w-[72%]">
        <div className="overflow-hidden rounded-xl bg-white shadow-[0_30px_60px_-15px_rgb(40_10_0/0.55)] ring-1 ring-black/5">
          <Image
            src="/landing/ui-marlow.webp"
            alt="Marlow's store with the Slice concierge open"
            width={1600}
            height={1105}
            sizes="(min-width: 1024px) 480px, 72vw"
            className="h-auto w-full"
          />
        </div>
        <Tag className="absolute -bottom-3 left-4">A shopper from New York</Tag>
      </div>
      <div className="absolute right-[5%] bottom-[6%] w-[27%] rotate-[4deg]">
        <Image
          src="/landing/card-why.webp"
          alt="Why this pick: art deco, sophisticated elegance, brass and marble"
          width={560}
          height={1098}
          sizes="180px"
          className="h-auto w-full rounded-2xl shadow-[0_30px_60px_-15px_rgb(40_10_0/0.6)]"
        />
      </div>
    </Composition>
  );
}

const AGENTS: TourAgent[] = [
  {
    key: "media",
    icon: <Clapperboard className="size-4" />,
    name: "Slice Media",
    art: "/landing/art-city.webp",
    title: "An ad for every crowd.",
    body: "Describe the campaign once. Slice designs posters and short video ads on an infinite canvas, one for each audience, and keeps every one on brand.",
    points: [
      "Images by Nano Banana Pro, video by Veo 3.1, music by Lyria 3",
      "A Why report on every creative, down to a taste map of the city",
      "For Knock on Lakers night: “Tip-off 7:30, hot chicken 7:58”",
    ],
    visual: <MediaVisual />,
  },
  {
    key: "pages",
    icon: <LayoutTemplate className="size-4" />,
    name: "Slice Pages",
    art: "/landing/art-coast.webp",
    title: "A page for every audience.",
    body: "Paste your site and Slice reads it into a brand kit. Pick an audience (a city, an age band, a CRM list, a single customer) and the agent builds a page in your style, then sends each visitor to theirs.",
    points: [
      "Tágide Festival: one lineup of 57 acts, six pages, each in its crowd's order",
      "Personal pages for single customers, read from what they buy",
      "Heat maps, funnels and lift against your default page",
    ],
    visual: <PagesVisual />,
  },
  {
    key: "email",
    icon: <Mail className="size-4" />,
    name: "Slice Email",
    art: "/landing/art-terrace.webp",
    title: "A letter to every reader.",
    body: "Import your contacts and Slice sorts them into taste groups, or keeps them one by one. Write one brief and the agent writes a version for each, with the picks and the reasons changed for that reader.",
    points: [
      "A visual email builder with the agent in the sidebar",
      "Sends from your own domain, with opens and clicks tracked",
      "Never thanks someone for a booking they didn't make",
    ],
    visual: <EmailVisual />,
  },
  {
    key: "concierge",
    icon: <MessagesSquare className="size-4" />,
    name: "Slice Concierge",
    art: "/landing/art-room.webp",
    title: "A guide for every shopper.",
    body: "Add one line of script and Slice meets each shopper with five quick questions drawn from their own city. From then on it ranks your catalog by their taste and explains every pick.",
    points: [
      "Connects to Shopify, WooCommerce, a CSV or a product feed",
      "Works from a first visit, with no history and no personal data",
      "Every card flips to show exactly why it was chosen",
    ],
    visual: <ConciergeVisual />,
  },
];

/* Slice for Mac */

function MacSection() {
  const features = [
    {
      icon: <Mic className="size-4" />,
      title: "Talk or type",
      body: "A quick voice keeps the conversation going while a worker does the real job in the background.",
    },
    {
      icon: <MousePointerClick className="size-4" />,
      title: "It does the thing",
      body: "Say “play the first one” and it plays. It books the table once you say yes.",
    },
    {
      icon: <ScanEye className="size-4" />,
      title: "Taste lens",
      body: "On Netflix, Airbnb or Amazon it dims the page and lights up the three best things for you.",
    },
    {
      icon: <UserStar className="size-4" />,
      title: "Learns as you go",
      body: "What you play, open and tap builds a taste graph you can see, edit or switch off.",
    },
  ];
  return (
    <section
      id="mac"
      className="relative overflow-hidden bg-[#0d0c0b] px-4 py-24 text-white sm:px-6 sm:py-32"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(ellipse_50%_60%_at_50%_0%,rgb(70_80_200/0.28),transparent)]" />
      <div className="relative mx-auto max-w-[1240px]">
        <div className="landing-reveal mx-auto flex max-w-[800px] flex-col items-center text-center">
          <Image
            src="/landing/glossy-mark.webp"
            alt=""
            width={400}
            height={333}
            className="h-auto w-16"
          />
          <p className="mt-6 text-sm font-medium text-white/60">Slice for Mac</p>
          <h2 className="landing-serif mt-3 text-5xl leading-[1.02] sm:text-7xl">
            A friend with great taste, right in your notch.
          </h2>
          <p className="mt-6 max-w-[600px] text-lg leading-relaxed text-white/65">
            Hover the notch to type, or hold two keys anywhere and talk. Slice
            knows what you love, plans around it, and uses your Mac to finish
            the job.
          </p>
          <Link
            href="#mac"
            className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-neutral-950 transition-all hover:-translate-y-px hover:bg-white/90"
          >
            <AppleLogo className="size-4 -translate-y-px" />
            Download for Mac
          </Link>
        </div>

        <div className="landing-reveal mx-auto mt-16 max-w-[1080px]">
          <LaptopFrame>
            <Image
              src="/landing/art-dusk.webp"
              alt=""
              fill
              sizes="1080px"
              className="object-cover"
            />
            <div className="absolute inset-x-0 top-0 flex h-[4.2%] items-center justify-between bg-black/25 px-[2%] text-[1.5cqw] font-medium text-white/90 backdrop-blur-sm">
              <span>Finder</span>
              <span>Tue 9:41 PM</span>
            </div>
            <div className="absolute top-0 left-1/2 w-[36%] -translate-x-1/2">
              <div className="overflow-hidden rounded-b-[3cqw] shadow-[0_30px_80px_-10px_rgb(0_0_20/0.7)]">
                <Image
                  src="/landing/island.webp"
                  alt="Slice for Mac recommending Frances Ha because you love Bon Iver and Mitski"
                  width={1000}
                  height={1125}
                  sizes="400px"
                  className="h-auto w-full"
                />
                <div className="flex items-center justify-between bg-[#1c1c1e] px-[7%] pt-[1%] pb-[6%] text-[1.1cqw] text-white/45">
                  <span>Ask Slice anything</span>
                  <span>Hold fn and control to talk</span>
                </div>
              </div>
            </div>
            <div className="absolute bottom-[6%] left-[3.5%] hidden flex-col gap-[1cqw] sm:flex">
              {[
                "Plan my week in Paris",
                "What should I watch tonight?",
                "Plan the weekend for my dad",
              ].map((q) => (
                <span
                  key={q}
                  className="w-fit rounded-full bg-black/40 px-[1.4cqw] py-[0.6cqw] text-[1.35cqw] text-white/90 ring-1 ring-white/15 backdrop-blur-md"
                >
                  “{q}”
                </span>
              ))}
            </div>
          </LaptopFrame>
        </div>

        <TalkKeys className="landing-reveal mt-8 sm:mt-12" />

        <div className="mt-20 grid gap-px overflow-hidden rounded-[24px] bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="landing-reveal bg-[#0d0c0b] p-7">
              <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-brand-yellow">
                {f.icon}
              </span>
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Closing */

function FinalCta() {
  const chips = [
    { text: "Fans from Berlin", pos: "left-[6%] top-[16%] -rotate-6" },
    { text: "Olivia in Notting Hill", pos: "right-[7%] top-[22%] rotate-3" },
    { text: "Metalheads", pos: "left-[11%] bottom-[18%] rotate-3" },
    { text: "A weekend hiker", pos: "right-[10%] bottom-[14%] -rotate-3" },
  ];
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28">
      <div className="landing-grow relative mx-auto max-w-[1280px] overflow-hidden rounded-[32px] sm:rounded-[44px]">
        <Image
          src="/landing/art-sky.webp"
          alt=""
          fill
          sizes="(min-width: 1280px) 1280px, 100vw"
          className="object-cover"
        />
        {chips.map((c) => (
          <div key={c.text} className={cn("absolute hidden lg:block", c.pos)}>
            <Tag className="landing-float">{c.text}</Tag>
          </div>
        ))}
        <div className="relative flex flex-col items-center px-6 py-24 text-center sm:py-40">
          <h2 className="landing-serif max-w-[900px] text-6xl leading-[0.95] sm:text-[112px]">
            Give every pick a reason.
          </h2>
          <p className="mt-7 max-w-[520px] text-lg text-neutral-800">
            Start with the agent your business needs most. Each one works on its
            own, with its own clients and data.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <PrimaryButton href="/sign-up">
              Start for free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </PrimaryButton>
            <SecondaryButton href="#mac">
              <AppleLogo className="size-4 -translate-y-px" />
              Download for Mac
            </SecondaryButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="overflow-hidden px-4 pt-6 sm:px-6">
      <div className="mx-auto grid max-w-[1240px] gap-10 border-t border-black/5 pt-14 sm:grid-cols-[1fr_auto_auto] sm:gap-20">
        <div>
          <Image
            src="/brand/slice_logo_blktext.svg"
            alt="Slice"
            width={96}
            height={22}
          />
          <p className="mt-4 max-w-[280px] text-sm leading-relaxed text-neutral-500">
            Five agents on one taste graph, built on Qloo.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Agents</p>
          <ul className="mt-4 space-y-2.5 text-sm text-neutral-500">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="hover:text-neutral-950">
                  {item.label === "Mac" ? "Slice for Mac" : `Slice ${item.label}`}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium">Slice</p>
          <ul className="mt-4 space-y-2.5 text-sm text-neutral-500">
            <li>
              <Link href="/sign-in" className="hover:text-neutral-950">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/sign-up" className="hover:text-neutral-950">
                Get started
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/AdithyaVardhanReddyM/Slice"
                className="hover:text-neutral-950"
              >
                Source on GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-14 flex max-w-[1240px] flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
        <span>© 2026 Slice AI</span>
        <span>Made with Qloo, Gemini and a lot of taste</span>
      </div>
      <p
        aria-hidden
        className="landing-serif mt-6 -mb-[0.18em] text-center text-[19vw] leading-[0.85] whitespace-nowrap text-transparent select-none"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #ffbf00 0%, #ff7900 55%, #fbf8f1 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
        }}
      >
        with taste.
      </p>
    </footer>
  );
}
