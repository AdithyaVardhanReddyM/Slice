"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TourAgent = {
  key: string;
  icon: ReactNode;
  name: string;
  art: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
};

/**
 * The four business agents. On large screens the panel pins to the viewport and scrolling
 * steps through the agents (Calendly style); on smaller screens they simply stack.
 */
export function AgentsTour({ agents }: { agents: TourAgent[] }) {
  return (
    <>
      <PinnedTour agents={agents} />
      <div className="flex flex-col gap-6 px-4 sm:px-6 lg:hidden">
        {agents.map((a) => (
          <div
            key={a.key}
            id={`${a.key}-m`}
            className="landing-reveal overflow-hidden rounded-[28px] bg-white ring-1 ring-black/5"
          >
            <div className="p-3">{a.visual}</div>
            <div className="px-5 pt-3 pb-7 sm:px-7">
              <AgentCopy agent={a} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PinnedTour({ agents }: { agents: TourAgent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, travel)));
      setProgress(p);
      setActive(Math.min(agents.length - 1, Math.floor(p * agents.length)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [agents.length]);

  const jump = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const travel = el.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: top + ((i + 0.5) / agents.length) * travel,
      behavior: "smooth",
    });
  };

  return (
    <div
      ref={ref}
      className="relative hidden lg:block"
      style={{ height: `${agents.length * 90 + 30}vh` }}
    >
      {/* Anchors so the header links land on each agent's stretch of the scroll. */}
      {agents.map((a, i) => (
        <span
          key={a.key}
          id={a.key}
          className="absolute left-0"
          style={{ top: `${(i / agents.length) * 100}%` }}
        />
      ))}
      <div className="sticky top-0 flex h-screen flex-col px-6 pt-20 pb-6">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[40px]">
          {agents.map((a, i) => (
            <Image
              key={a.key}
              src={a.art}
              alt=""
              fill
              sizes="100vw"
              className={cn(
                "object-cover transition-opacity duration-700",
                i === active ? "opacity-100" : "opacity-0",
              )}
            />
          ))}
          <div className="absolute inset-0 bg-black/10" />

          <div className="relative mb-5 flex items-center gap-2 rounded-full bg-white/80 p-1.5 shadow-lg backdrop-blur-md">
            {agents.map((a, i) => (
              <button
                key={a.key}
                onClick={() => jump(i)}
                aria-label={a.name}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all",
                  i === active
                    ? "bg-neutral-950 pr-4 text-white"
                    : "text-neutral-600 hover:bg-black/5",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full",
                    i === active ? "bg-brand-yellow text-neutral-950" : "",
                  )}
                >
                  {a.icon}
                </span>
                {i === active && a.name}
              </button>
            ))}
          </div>

          <div className="relative grid h-[min(620px,calc(100vh-230px))] w-[min(1180px,calc(100%-64px))] grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 rounded-[32px] bg-[#fbf8f1] p-4 shadow-[0_40px_100px_-30px_rgb(40_10_0/0.6)]">
            <div className="relative">
              {agents.map((a, i) => (
                <div
                  key={a.key}
                  aria-hidden={i !== active}
                  className={cn(
                    "absolute inset-0 flex flex-col justify-center pl-8 transition-all duration-500",
                    i === active
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-4 opacity-0",
                  )}
                >
                  <AgentCopy agent={a} />
                </div>
              ))}
            </div>
            <div className="relative flex items-center justify-center">
              {agents.map((a, i) => (
                <div
                  key={a.key}
                  aria-hidden={i !== active}
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-500",
                    i === active
                      ? "scale-100 opacity-100"
                      : "pointer-events-none scale-[0.97] opacity-0",
                  )}
                >
                  <div
                    className="aspect-[5/4]"
                    style={{
                      width:
                        "min(100%, calc((min(620px, 100vh - 230px) - 32px) * 1.25))",
                    }}
                  >
                    {a.visual}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-5 h-1 w-48 overflow-hidden rounded-full bg-white/40">
            <div
              className="h-full origin-left rounded-full bg-white"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentCopy({ agent }: { agent: TourAgent }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 text-sm font-medium">
        <span className="grid size-8 place-items-center rounded-xl bg-brand-yellow">
          {agent.icon}
        </span>
        {agent.name}
      </div>
      <h3 className="landing-serif mt-5 text-[44px] leading-[1] xl:text-[56px]">
        {agent.title}
      </h3>
      <p className="mt-4 text-[17px] leading-relaxed text-neutral-600">
        {agent.body}
      </p>
      <ul className="mt-6 space-y-2.5">
        {agent.points.map((p) => (
          <li key={p} className="flex gap-3 text-[15px] leading-relaxed">
            <Check
              className="mt-1 size-4 shrink-0 text-brand-orange"
              strokeWidth={2.5}
            />
            {p}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-up"
        className="group mt-7 inline-flex items-center gap-1.5 text-[15px] font-medium underline decoration-brand-orange decoration-2 underline-offset-[6px]"
      >
        Try {agent.name}
        <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </Link>
    </div>
  );
}
