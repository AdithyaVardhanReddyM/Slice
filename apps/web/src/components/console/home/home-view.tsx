"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { isGuest } from "@/lib/guest";
import { serviceMeta, type ServiceId } from "@/lib/services";
import { RippleField, type RippleFieldHandle } from "./ripple-field";

/** Re-reads the clock every minute, so the greeting turns over while the page is open. */
const everyMinute = (tick: () => void) => {
  const id = window.setInterval(tick, 60_000);
  return () => window.clearInterval(id);
};

/** The greeting comes from the viewer's own clock and time zone, so the server renders a neutral one. */
function Greeting() {
  const { user } = useUser();
  const hour = useSyncExternalStore(
    everyMinute,
    () => new Date().getHours(),
    () => -1,
  );
  const part =
    hour < 0
      ? "Welcome back"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  const name = isGuest(user) ? null : user?.firstName || user?.username;
  return (
    <header className="home-rise mx-auto max-w-3xl self-end pb-10 text-center">
      <h1 className="text-[32px] leading-[1.05] font-medium tracking-[-0.035em] text-balance text-neutral-950 sm:text-[44px]">
        {part}
        {name ? `, ${name}` : ""}
      </h1>
    </header>
  );
}

const ART_SIZES = "(min-width: 1280px) 360px, (min-width: 640px) 50vw, 100vw";

/** A service's card artwork, as on that service's own client cards. */
function Art({ src }: { src: string }) {
  return (
    <div className="relative aspect-[522/336] overflow-hidden bg-muted">
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes={ART_SIZES}
        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </div>
  );
}

function ServiceCard({
  service,
  title,
  description,
  meta,
  art,
  delay,
  onWake,
}: {
  service: ServiceId;
  title: string;
  description: string;
  meta?: ReactNode;
  art: ReactNode;
  delay: number;
  onWake: (x: number, y: number) => void;
}) {
  const { icon: Icon, label, segment } = serviceMeta(service);
  const wake = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    onWake(r.left + r.width / 2, r.top + r.height / 2);
  };
  return (
    <Link
      href={`/dashboard/${segment}`}
      onPointerEnter={(e) => e.pointerType === "mouse" && wake(e.currentTarget)}
      onFocus={(e) => wake(e.currentTarget)}
      className="home-rise group relative flex flex-col rounded-[30px] bg-white/85 p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.06] backdrop-blur-md transition-shadow duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] outline-none hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_28px_56px_-20px_rgba(234,88,12,0.38)] hover:ring-[#ff7900]/25 focus-visible:ring-2 focus-visible:ring-[#ea580c]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative overflow-hidden rounded-[21px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[21px] after:ring-1 after:ring-black/[0.05] after:ring-inset">
        {art}
      </div>
      <div className="flex flex-1 flex-col px-3.5 pt-6 pb-3.5">
        <h2 className="text-[22px] font-medium tracking-[-0.02em] text-neutral-950">
          {title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          {description}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-500">
            <Icon className="size-3.5 shrink-0" />
            <span className="font-medium text-neutral-700">{label}</span>
            {meta && <span className="ml-1.5 truncate">{meta}</span>}
          </span>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition-colors duration-300 group-hover:bg-[#ea580c] group-hover:text-white">
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

const count = (rows: unknown[] | undefined, noun: string) =>
  !rows
    ? undefined
    : rows.length === 0
      ? `No ${noun}s yet`
      : `${rows.length} ${rows.length === 1 ? noun : `${noun}s`}`;

/** The console home: a way into each service, over a field of orange ripples. */
export function HomeView({ liveWidgets }: { liveWidgets: ReactNode }) {
  const field = useRef<RippleFieldHandle>(null);
  const cards = useRef<HTMLDivElement>(null);
  const wake = (x: number, y: number) => field.current?.ripple(x, y, 0.9);

  const { isAuthenticated } = useConvexAuth();
  const pages = useQuery(api.pagesBrands.list, isAuthenticated ? {} : "skip");
  const email = useQuery(api.emailBrands.list, isAuthenticated ? {} : "skip");
  const media = useQuery(api.media.list, isAuthenticated ? {} : "skip");

  // Every account gets its own copy of the demo brands; the home may be the first screen it opens.
  const provisionPages = useMutation(api.pagesDemo.provision);
  const provisionEmail = useMutation(api.emailDemo.provision);
  const provisionMedia = useMutation(api.mediaDemo.provision);
  useEffect(() => {
    if (!isAuthenticated) return;
    provisionPages({}).catch((err) => console.error("Could not add the demo brands", err));
    provisionEmail({}).catch((err) => console.error("Could not add the demo email brand", err));
    provisionMedia({}).catch((err) => console.error("Could not add the demo media brands", err));
  }, [isAuthenticated, provisionPages, provisionEmail, provisionMedia]);

  return (
    <div className="relative isolate flex flex-1 flex-col">
      <RippleField ref={field} anchor={cards} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(50%_55%_at_50%_55%,rgba(255,121,0,0.12),rgba(255,191,0,0.05)_45%,transparent_75%)]"
      />
      {/* Equal rows above and below keep the cards at the middle of the screen, the greeting sitting just over them. */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1480px] flex-1 grid-rows-[1fr_auto_1fr] px-4 py-10 sm:px-6 lg:px-10">
        <Greeting />
        <div ref={cards} className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <ServiceCard
            service="pages"
            title="Landing pages"
            description="Landing and sales pages that change with each visitor's taste."
            meta={count(pages, "brand")}
            art={<Art src="/illustrations/page-card.svg" />}
            delay={80}
            onWake={wake}
          />
          <ServiceCard
            service="concierge"
            title="Concierge widget"
            description="A shopping assistant that picks from your catalog by taste."
            meta={liveWidgets}
            art={<Art src="/illustrations/widget-card.svg" />}
            delay={140}
            onWake={wake}
          />
          <ServiceCard
            service="email"
            title="Email marketing"
            description="Campaigns written for each taste group, or for each person."
            meta={count(email, "brand")}
            art={<Art src="/illustrations/email-card.svg" />}
            delay={200}
            onWake={wake}
          />
          <ServiceCard
            service="media"
            title="Media generation"
            description="Posters and short video, with a version for every audience."
            meta={count(media, "campaign")}
            art={<Art src="/illustrations/media-card.svg" />}
            delay={260}
            onWake={wake}
          />
        </div>
      </div>
    </div>
  );
}
