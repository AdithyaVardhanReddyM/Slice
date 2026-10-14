"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  ChevronDown,
  LayoutTemplate,
  MessagesSquare,
  Plus,
} from "lucide-react";
import type { ConciergeHome, HomeRange } from "@/lib/mock/home";
import { workspace } from "@/lib/mock/widgets";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FunnelCard,
  RecentConversations,
  RevenueCard,
  TopPicks,
} from "./concierge";
import { MediaBanner } from "./media";
import { PagesSection } from "./pages";
import { PillTabs, SectionHeader } from "./ui";

const noop = () => () => {};

/** The greeting and date come from the viewer's clock, so the server renders a neutral line. */
function Greeting() {
  const { user } = useUser();
  const hour = useSyncExternalStore(
    noop,
    () => new Date().getHours(),
    () => -1,
  );
  const today = useSyncExternalStore(
    noop,
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    () => "",
  );
  const part =
    hour < 0
      ? "Welcome back"
      : hour < 5
        ? "Good evening"
        : hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening";
  const name = user?.firstName || user?.username;
  return (
    <div className="min-w-0">
      <p className="h-5 text-sm font-medium text-muted-foreground">{today}</p>
      <h1 className="mt-2 text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-neutral-950 sm:text-[46px]">
        {part}
        {name ? `, ${name}` : ""}
      </h1>
    </div>
  );
}

function NewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button className="h-10 rounded-full px-4 text-sm" />}
      >
        <Plus data-icon="inline-start" />
        New
        <ChevronDown data-icon="inline-end" className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 rounded-xl p-1.5"
      >
        <DropdownMenuItem
          render={<Link href="/dashboard/concierge/new" />}
          className="gap-3 rounded-lg px-2.5 py-2"
        >
          <MessagesSquare />
          <span>
            <span className="block font-medium">Concierge widget</span>
            <span className="block text-xs text-muted-foreground">
              For one storefront
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href="/dashboard/pages/new" />}
          className="gap-3 rounded-lg px-2.5 py-2"
        >
          <LayoutTemplate />
          <span>
            <span className="block font-medium">Pages brand</span>
            <span className="block text-xs text-muted-foreground">
              From the brand&apos;s website
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The console home: how each service is doing, newest work first, with the way into each. */
export function HomeView({ concierge }: { concierge: ConciergeHome }) {
  const [range, setRange] = useState<HomeRange>(7);
  const data = concierge.ranges[range];
  const live = concierge.widgets.filter((w) => w.status === "live");
  const setup = concierge.widgets.filter((w) => w.status === "setup");

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-10 pb-20 sm:px-6 lg:px-10">
      <header className="home-rise flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <Greeting />
          <p className="mt-3 text-[15px] text-muted-foreground">
            How {workspace.name} did across Slice in the last {range} days.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PillTabs
            label="Date range"
            value={range}
            onChange={setRange}
            options={[
              { value: 7, label: "7 days" },
              { value: 14, label: "14 days" },
            ]}
          />
          <NewMenu />
        </div>
      </header>

      <section className="mt-12 space-y-5">
        <SectionHeader
          icon={MessagesSquare}
          title="Concierge"
          meta={`${live.length} live ${live.length === 1 ? "widget" : "widgets"} · ${data.totals.all.conversations.toLocaleString("en-US")} conversations`}
          href="/dashboard/concierge"
          linkLabel="Open Concierge"
          extra={setup.map((w) => (
            <Link
              key={w.id}
              href={`/dashboard/concierge/${w.id}/setup`}
              className="group inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200/70 transition-colors hover:bg-amber-100"
            >
              Finish setting up {w.name}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        />
        <div className="grid gap-5 lg:grid-cols-12">
          <FunnelCard
            data={data}
            widgets={concierge.widgets}
            range={range}
            delay={60}
            className="lg:col-span-8"
          />
          <RevenueCard
            data={data}
            widgets={concierge.widgets}
            range={range}
            delay={120}
            className="lg:col-span-4"
          />
          <RecentConversations
            recent={concierge.recent}
            delay={180}
            className="lg:col-span-8"
          />
          <TopPicks
            picks={concierge.picks}
            delay={240}
            className="lg:col-span-4"
          />
        </div>
      </section>

      <PagesSection days={range} className="mt-16" />

      <MediaBanner className="mt-16" delay={120} />
    </div>
  );
}
