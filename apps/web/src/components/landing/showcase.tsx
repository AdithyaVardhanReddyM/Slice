"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Clapperboard,
  Laptop,
  LayoutTemplate,
  Mail,
  MessagesSquare,
  UserStar,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  key: string;
  label: string;
  icon: typeof Mail;
  art: string;
  shot: { src: string; width: number; height: number };
  audience: string;
  read: { tags: string[]; line: string };
  caption: string;
};

const TABS: Tab[] = [
  {
    key: "media",
    label: "Media",
    icon: Clapperboard,
    art: "/landing/art-city.webp",
    shot: { src: "/landing/shot-media.webp", width: 1800, height: 1031 },
    audience: "NYC film lovers",
    read: {
      tags: ["Romantic", "Vintage", "Editorial"],
      line: "Love Cat Power, The Flaming Lips and Pixies",
    },
    caption: "Slice Media designing a Half Moon Coffee poster for NYC film lovers",
  },
  {
    key: "pages",
    label: "Pages",
    icon: LayoutTemplate,
    art: "/landing/art-coast.webp",
    shot: { src: "/landing/shot-pages.webp", width: 1800, height: 1031 },
    audience: "Fans from Berlin",
    read: {
      tags: ["Avant-garde", "Dramatic", "European"],
      line: "Peggy Gou, Ellen Allien and FKA twigs go first",
    },
    caption: "Slice Pages writing the Tágide Festival page in Berlin's order",
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    art: "/landing/art-terrace.webp",
    shot: { src: "/landing/shot-email.webp", width: 1800, height: 1031 },
    audience: "London diners",
    read: {
      tags: ["Tasting menus", "Natural wine", "Grand rooms"],
      line: "48 restaurants ranked for each reader",
    },
    caption: "Slice Email writing a Covers win-back campaign, one version per reader",
  },
  {
    key: "concierge",
    label: "Concierge",
    icon: MessagesSquare,
    art: "/landing/art-room.webp",
    shot: { src: "/landing/ui-fold.webp", width: 1440, height: 828 },
    audience: "A weekend hiker",
    read: {
      tags: ["Athletic", "Outdoors", "Sporty"],
      line: "The Trailblazer 20 pack is a 100% match",
    },
    caption: "Slice Concierge ranking Fold's catalog for one shopper",
  },
  {
    key: "mac",
    label: "Mac",
    icon: Laptop,
    art: "/landing/art-dusk.webp",
    shot: { src: "/landing/island.webp", width: 1000, height: 1125 },
    audience: "You",
    read: {
      tags: ["Indie folk", "Tender", "Restless"],
      line: "Because you love Bon Iver and Mitski",
    },
    caption: "Slice for Mac answering from the notch",
  },
];

const STEP_MS = 7000;

/** Hero product tour: each agent's real UI on its own painting, cycling on a timer. */
export function Showcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(
      () => setActive((i) => (i + 1) % TABS.length),
      STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [active, paused]);

  return (
    <div
      className="landing-grow relative mx-auto w-full max-w-[1280px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[5/6] overflow-hidden rounded-[28px] bg-brand-sand shadow-[0_40px_120px_-40px_rgb(120_50_0/0.45)] sm:aspect-[16/10] sm:rounded-[40px]">
        {TABS.map((tab, i) => (
          <div
            key={tab.key}
            aria-hidden={i !== active}
            className={cn(
              "absolute inset-0 transition-opacity duration-700",
              i === active ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <Image
              src={tab.art}
              alt=""
              fill
              priority={i === 0}
              sizes="(min-width: 1280px) 1280px, 100vw"
              className={cn(
                "object-cover transition-transform duration-[7000ms] ease-out",
                i === active ? "scale-105" : "scale-100",
              )}
            />
            {tab.key === "mac" ? (
              <MacStage tab={tab} />
            ) : (
              <WindowStage tab={tab} />
            )}
          </div>
        ))}

        <div className="absolute inset-x-0 bottom-4 flex justify-center px-3 sm:bottom-6">
          <div
            role="tablist"
            aria-label="Slice agents"
            className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-black/55 p-1 backdrop-blur-md scrollbar-none"
          >
            {TABS.map((tab, i) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-4 sm:text-sm",
                  i === active
                    ? "bg-white text-neutral-950"
                    : "text-white/80 hover:text-white",
                )}
              >
                <tab.icon className="hidden size-3.5 sm:block" />
                {tab.label}
                {i === active && !paused && (
                  <span
                    key={active}
                    className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-brand-orange"
                    style={{
                      animation: `landing-progress ${STEP_MS}ms linear forwards`,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-neutral-500">
        {TABS[active].caption}
      </p>
    </div>
  );
}

function AudienceTag({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white py-1.5 pr-3.5 pl-1.5 text-[13px] whitespace-nowrap shadow-[0_8px_30px_rgb(0_0_0/0.18)] sm:text-sm">
      <span className="grid size-6 place-items-center rounded-full bg-brand-yellow sm:size-7">
        <UserStar className="size-3.5 sm:size-4" />
      </span>
      <span className="text-neutral-500">Made for</span>
      <span className="font-medium text-neutral-950">{name}</span>
    </div>
  );
}

function TasteRead({ tab }: { tab: Tab }) {
  return (
    <div className="landing-float w-[230px] rounded-2xl bg-white/95 p-4 shadow-[0_24px_60px_-12px_rgb(40_10_0/0.45)] ring-1 ring-black/5 backdrop-blur">
      <p className="text-[11px] font-medium text-brand-orange">Qloo taste read</p>
      <p className="mt-1 text-sm font-semibold text-neutral-950">{tab.audience}</p>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {tab.read.tags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-[#fff4cc] px-2 py-0.5 text-[11px] text-neutral-800"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-xs leading-snug text-neutral-500">{tab.read.line}</p>
    </div>
  );
}

function WindowStage({ tab }: { tab: Tab }) {
  return (
    <div className="absolute inset-x-[4%] top-[47%] -translate-y-1/2 sm:inset-x-[9%] sm:top-[46%]">
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_30px_80px_-20px_rgb(60_20_0/0.6)] ring-1 ring-black/5 sm:rounded-2xl">
        <div className="flex h-6 items-center gap-1.5 border-b border-neutral-100 px-3 sm:h-8 sm:px-4">
          <span className="size-2 rounded-full bg-[#ff5f57] sm:size-2.5" />
          <span className="size-2 rounded-full bg-[#febc2e] sm:size-2.5" />
          <span className="size-2 rounded-full bg-[#28c840] sm:size-2.5" />
        </div>
        <Image
          src={tab.shot.src}
          alt={tab.caption}
          width={tab.shot.width}
          height={tab.shot.height}
          sizes="(min-width: 1280px) 1040px, 92vw"
          className="h-auto w-full"
        />
      </div>
      <div className="absolute -top-4 left-3 sm:-top-5 sm:-left-5">
        <AudienceTag name={tab.audience} />
      </div>
      <div className="absolute top-[18%] -right-6 hidden lg:block">
        <TasteRead tab={tab} />
      </div>
    </div>
  );
}

function MacStage({ tab }: { tab: Tab }) {
  return (
    <>
      <div className="absolute inset-x-0 top-0 flex h-6 items-center justify-between bg-black/25 px-4 text-[11px] font-medium text-white/90 backdrop-blur-sm sm:h-7 sm:text-xs">
        <span>Slice</span>
        <span>Tue 9:41 PM</span>
      </div>
      <div className="absolute top-0 left-1/2 w-[80%] max-w-[440px] -translate-x-1/2 sm:w-[34%]">
        <div className="overflow-hidden rounded-b-[26px] shadow-[0_30px_80px_-10px_rgb(0_0_20/0.6)]">
          <Image
            src={tab.shot.src}
            alt={tab.caption}
            width={tab.shot.width}
            height={tab.shot.height}
            sizes="440px"
            className="h-auto w-full"
          />
          <div className="flex items-center justify-between bg-[#1c1c1e] px-[7%] pt-1 pb-[6%] text-[11px] text-white/45 sm:text-xs">
            <span>Ask Slice anything</span>
            <span>Hold fn and control to talk</span>
          </div>
        </div>
      </div>
      <div className="absolute top-[24%] right-[6%] hidden lg:block">
        <TasteRead tab={tab} />
      </div>
    </>
  );
}
