"use client";

import {
  ArrowUp,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Gift,
  Globe,
  Heart,
  LayoutTemplate,
  Mail,
  MapPin,
  Megaphone,
  Music,
  PenLine,
  Percent,
  ShoppingCart,
  Star,
  Tag,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PlanRecap, Question, QuestionOption } from "@/lib/pages/stream";
import { GOALS, type Audience, type BrandItem } from "@/lib/pages/types";
import { Badge } from "@/components/ui/badge";
import { AudienceFace } from "./preview";

/** The planner's icon names (plan.py OPTION_ICONS). */
const OPTION_ICON: Record<string, LucideIcon> = {
  users: Users,
  globe: Globe,
  tag: Tag,
  ticket: Ticket,
  calendar: CalendarDays,
  mail: Mail,
  cart: ShoppingCart,
  gift: Gift,
  "map-pin": MapPin,
  music: Music,
  heart: Heart,
  percent: Percent,
  clock: Clock,
  star: Star,
  megaphone: Megaphone,
  pencil: PenLine,
  layout: LayoutTemplate,
};

export interface Answer {
  text: string;
  audienceId?: string;
  itemId?: string;
}

const tile = "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground";

function ItemThumb({ item, className }: { item: BrandItem; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!item.image || broken) return <Tag className="size-4" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.image} alt="" className={cn("size-full object-cover", className)} onError={() => setBroken(true)} />;
}

/** The option's picture: the audience's face, the item's photo, else its icon. */
function OptionIcon({ option, audiences, items }: { option: QuestionOption; audiences: Audience[]; items: BrandItem[] }) {
  const audience = option.audienceId ? audiences.find((a) => a._id === option.audienceId) : undefined;
  if (audience) return <AudienceFace audience={audience} className="size-8 rounded-lg ring-0 [&_svg]:size-4" />;
  const item = option.itemId ? items.find((i) => i.id === option.itemId) : undefined;
  if (item) {
    return (
      <span className={tile}>
        <ItemThumb item={item} />
      </span>
    );
  }
  const Icon = OPTION_ICON[option.icon ?? ""] ?? LayoutTemplate;
  return (
    <span className={tile}>
      <Icon className="size-4" />
    </span>
  );
}

function OptionRow({
  icon,
  label,
  detail,
  state,
  onClick,
  trailing,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  /** "picked" once answered with this one, "other" for the rest of an answered question. */
  state: "open" | "picked" | "other";
  onClick?: () => void;
  trailing?: ReactNode;
  tone?: "default" | "primary";
}) {
  const primary = tone === "primary" && state === "open";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state !== "open"}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-[background-color,opacity,box-shadow] disabled:cursor-default",
        primary ? "border-foreground bg-foreground text-background shadow-sm hover:bg-foreground/90" : "bg-background shadow-xs hover:bg-muted/60",
        state === "picked" && "border-foreground/15 bg-muted/60 shadow-none",
        state === "other" && "opacity-45 shadow-none",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {detail && <span className={cn("block truncate text-xs", primary ? "text-background/70" : "text-muted-foreground")}>{detail}</span>}
      </span>
      {state === "picked" ? <Check className="size-4 shrink-0 text-foreground" /> : (trailing ?? <ChevronRight className={cn("size-4 shrink-0 transition-transform group-hover:translate-x-0.5", primary ? "text-background/70" : "text-muted-foreground")} />)}
    </button>
  );
}

/** "Something else": opens into a one-line input. */
function OtherRow({
  label,
  detail,
  placeholder,
  state,
  answer,
  onSubmit,
}: {
  label: string;
  detail?: string;
  placeholder: string;
  state: "open" | "picked" | "other";
  answer?: string;
  onSubmit?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (state === "picked") {
    return <OptionRow icon={<span className={tile}><PenLine className="size-4" /></span>} label={answer || label} state="picked" />;
  }
  if (!open || state !== "open") {
    return <OptionRow icon={<span className={tile}><PenLine className="size-4" /></span>} label={label} detail={detail} state={state} onClick={() => setOpen(true)} />;
  }
  const send = () => {
    const t = text.trim();
    if (t) onSubmit?.(t);
  };
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border bg-background px-2.5 py-2 shadow-xs ring-2 ring-ring/15">
      <span className={tile}>
        <PenLine className="size-4" />
      </span>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            send();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim()}
        aria-label="Send"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
      >
        <ArrowUp className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * A question from the planner or the builder, with its options. Until it is
 * answered the options are buttons; after, the chosen one stays marked and
 * the rest fade.
 */
export function QuestionCard({
  question,
  answer,
  onAnswer,
  audiences,
  items,
}: {
  question: Question;
  /** The merchant's reply, once there is one. */
  answer?: string;
  /** Absent when the question can no longer be answered here. */
  onAnswer?: (a: Answer) => void;
  audiences: Audience[];
  items: BrandItem[];
}) {
  const answered = answer !== undefined;
  const picked = answered ? question.options.findIndex((o) => o.label.trim().toLowerCase() === answer.trim().toLowerCase()) : -1;
  const open = !answered && !!onAnswer;
  const stateOf = (i: number): "open" | "picked" | "other" => (i === picked ? "picked" : open ? "open" : "other");
  return (
    <div className="w-full">
      <p className="text-sm leading-6">{question.text}</p>
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {question.options.map((o, i) => (
          <OptionRow
            key={`${o.label}-${i}`}
            icon={<OptionIcon option={o} audiences={audiences} items={items} />}
            label={o.label}
            detail={o.detail}
            state={stateOf(i)}
            onClick={() => onAnswer?.({ text: o.label, audienceId: o.audienceId, itemId: o.itemId })}
          />
        ))}
        {question.other && (
          <OtherRow
            label="Something else"
            detail={question.other}
            placeholder={question.other}
            state={answered && picked < 0 ? "picked" : open ? "open" : "other"}
            answer={answer}
            onSubmit={(text) => onAnswer?.({ text })}
          />
        )}
      </div>
    </div>
  );
}

const hostPath = (href: string) => {
  try {
    const u = new URL(href);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}${u.hash}`;
  } catch {
    return href;
  }
};

/**
 * What the planner set up: the page, who it is for, the offer, the button and
 * the items it features. With `onConfirm`, it waits for the go-ahead.
 */
export function PlanCard({
  plan,
  audiences,
  items,
  onConfirm,
  onChange,
}: {
  plan: PlanRecap;
  audiences: Audience[];
  items: BrandItem[];
  onConfirm?: () => void;
  onChange?: (text: string) => void;
}) {
  const who = plan.audienceIds.map((id) => audiences.find((a) => a._id === id)).filter((a): a is Audience => !!a);
  const fresh = plan.newAudiences ?? [];
  const featured = plan.itemIds.map((id) => items.find((i) => i.id === id)).filter((i): i is BrandItem => !!i);
  const goal = GOALS.find((g) => g.value === plan.goal)?.label;
  const names = [...who.map((a) => a.name), ...fresh];
  return (
    <div className="w-full space-y-2">
      <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="flex items-center gap-2.5 border-b px-3.5 py-2.5">
          <LayoutTemplate className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{plan.title}</span>
          {goal && <Badge variant="secondary">{goal}</Badge>}
        </div>
        <dl className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-3.5 py-3 text-sm">
          <dt className="text-muted-foreground">For</dt>
          <dd className="flex min-w-0 items-center gap-2">
            {who.length > 0 ? (
              <span className="flex shrink-0 -space-x-1.5">
                {who.slice(0, 3).map((a) => (
                  <AudienceFace key={a._id} audience={a} />
                ))}
              </span>
            ) : (
              !fresh.length && <Globe className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{names.length ? names.join(" + ") : "Everyone"}</span>
            {fresh.length > 0 && <span className="shrink-0 text-xs text-muted-foreground">new</span>}
          </dd>
          {plan.offer && (
            <>
              <dt className="text-muted-foreground">Offer</dt>
              <dd className="truncate">{plan.offer}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Button</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium">{plan.cta.label}</span>
            <span className="truncate text-xs text-muted-foreground">{hostPath(plan.cta.href)}</span>
          </dd>
          {featured.length > 0 && (
            <>
              <dt className="text-muted-foreground">Features</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <span className="flex shrink-0 -space-x-1.5">
                  {featured.slice(0, 3).map((i) => (
                    <span key={i.id} className="flex size-5 items-center justify-center overflow-hidden rounded-[5px] bg-muted text-muted-foreground ring-2 ring-background [&_svg]:size-3">
                      <ItemThumb item={i} />
                    </span>
                  ))}
                </span>
                <span className="truncate">{featured.map((i) => i.name).join(", ")}</span>
              </dd>
            </>
          )}
        </dl>
      </div>
      {onConfirm && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <OptionRow
            tone="primary"
            icon={
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/15">
                <Check className="size-4" />
              </span>
            }
            label="Looks good, build it"
            detail="Write the page now"
            state="open"
            onClick={onConfirm}
          />
          <OtherRow label="I want to change something" detail="Tell me what to adjust" placeholder="What should change?" state="open" onSubmit={(t) => onChange?.(t)} />
        </div>
      )}
    </div>
  );
}
