"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  Download,
  Ellipsis,
  Flag,
  MousePointerClick,
  PackageSearch,
  ShoppingBag,
  UserStar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { Outcome } from "@/lib/mock/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SliceMark } from "../logo";
import { OutcomeBadge } from "../primitives";
import type { ConversationDetail, LineView, PickView } from "./data";

/** One conversation: who the shopper is, then the chat. Details open on demand. */
export function ConversationView({ detail: d }: { detail: ConversationDetail }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-start justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-neutral-950">
            {d.title}
          </h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            Shopper{d.city && ` in ${d.city}`}
            {d.device && ` on ${d.device}`}, {fmt.date(d.startedAt)} at{" "}
            {fmt.time(d.startedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {d.carted > 0 && (
            <span className="num text-sm font-semibold text-neutral-950">
              {fmt.money(d.carted)}
            </span>
          )}
          <OutcomeBadge outcome={d.outcome} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions"
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem>
                <Download /> Export transcript
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Flag /> Flag for review
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-8 px-6 py-6">
          <ShopperCard detail={d} />
          <ol className="space-y-6">
            {d.lines.map((line) => (
              <li key={line.id}>
                <Line line={line} outcome={d.outcome} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* Shopper ----------------------------------------------------------------- */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function ShopperCard({ detail: d }: { detail: ConversationDetail }) {
  const [open, setOpen] = useState(false);
  const t = d.taste;
  return (
    <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-neutral-950">
            {t.group}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.summary}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:text-neutral-950"
        >
          Visit details
          <ChevronDown
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        {t.loves.length > 0 && (
          <Row label="Loves">
            <span className="flex flex-wrap gap-1.5">
              {t.loves.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-orange-100/70 px-2 py-0.5 text-xs font-medium text-orange-800"
                >
                  {s}
                </span>
              ))}
            </span>
          </Row>
        )}
        {t.picked.length > 0 && (
          <Row label="Picked">
            <span className="flex flex-wrap gap-1.5">
              {t.picked.map((p) => (
                <span
                  key={p.choice}
                  title={p.question}
                  className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-800 ring-1 ring-black/[0.08]"
                >
                  {p.choice}
                </span>
              ))}
            </span>
          </Row>
        )}
        {t.mentioned.length > 0 && (
          <Row label="Mentioned">
            <span className="text-neutral-900">{t.mentioned.join(", ")}</span>
          </Row>
        )}
      </dl>

      {open && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-black/[0.06] pt-4 sm:grid-cols-4">
          {d.visit.map((v) => (
            <div key={v.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{v.label}</dt>
              <dd className="mt-0.5 truncate text-sm text-neutral-900">
                {v.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/* Chat -------------------------------------------------------------------- */

const END: Partial<
  Record<Outcome, { icon: typeof ShoppingBag; className: string }>
> = {
  added_to_cart: {
    icon: ShoppingBag,
    className: "bg-emerald-50 text-emerald-700",
  },
  clicked: { icon: MousePointerClick, className: "bg-neutral-100 text-neutral-700" },
  no_match: { icon: PackageSearch, className: "bg-amber-50 text-amber-800" },
};

const EVENT_ICON = {
  taste: UserStar,
  opened: MousePointerClick,
  carted: ShoppingBag,
} as const;

function Line({ line, outcome }: { line: LineView; outcome: Outcome }) {
  if (line.kind === "shopper")
    return (
      <div className="flex justify-end">
        <p
          title={fmt.time(line.at)}
          className="max-w-[75%] rounded-2xl rounded-br-md bg-neutral-900 px-4 py-2.5 text-sm text-white"
        >
          {line.text}
        </p>
      </div>
    );

  if (line.kind === "event") {
    const Icon = EVENT_ICON[line.event];
    return (
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            line.event === "carted"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-neutral-100 text-neutral-600",
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 pt-1">
          <p title={fmt.time(line.at)} className="text-sm text-neutral-700">
            {line.text}
          </p>
        </div>
      </div>
    );
  }

  if (line.kind === "end") {
    const end = END[outcome];
    const Icon = end?.icon;
    return (
      <div className="flex justify-center">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            end?.className ?? "bg-neutral-100 text-neutral-600",
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {line.text}
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.08]">
        <SliceMark className="h-2.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <p
          title={fmt.time(line.at)}
          className="rounded-2xl rounded-tl-md bg-neutral-100 px-4 py-2.5 text-sm text-neutral-900"
        >
          {line.text}
        </p>
        {line.picks.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {line.picks.map((p) => (
              <PickCard key={p.id} pick={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickCard({ pick: p }: { pick: PickView }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06]">
      {p.image ? (
        // Product photos live on the store's host; next/image would need it allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt="" className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="aspect-[4/3] w-full bg-neutral-100" />
      )}
      <div className="flex flex-1 flex-col p-3">
        <p className="truncate text-sm font-medium text-neutral-950" title={p.name}>
          {p.name}
        </p>
        <p className="num mt-0.5 truncate text-xs text-muted-foreground">
          {p.brand ? `${p.brand}, ` : ""}
          {fmt.money(p.price)}
        </p>
        <div className="mt-auto flex min-h-8 items-end justify-between gap-2 pt-3">
          {p.status === "carted" ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              In cart
            </span>
          ) : p.status === "opened" ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
              Opened
            </span>
          ) : (
            <span />
          )}
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="text-xs font-medium text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-950 hover:underline"
                />
              }
            >
              Why this pick
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 gap-3 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-neutral-950">
                  Why this pick
                </p>
                {p.match !== null && (
                  <span className="num text-xs text-muted-foreground">
                    {Math.round(p.match * 100)}% match
                  </span>
                )}
              </div>
              <dl className="space-y-2">
                {p.why.map((w) => (
                  <div key={w.label}>
                    <dt className="text-xs text-muted-foreground">{w.label}</dt>
                    <dd className="text-sm text-neutral-900">{w.value}</dd>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
