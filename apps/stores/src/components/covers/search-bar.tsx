"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Clock, MapPin, Search, Users } from "lucide-react";
import { cn } from "cn";
import { DEFAULT_PARTY, DEFAULT_TIME, PARTY_SIZES, SEARCH_TIMES, bookableDays, dayLabel, shortDate } from "@/lib/covers/booking";
import { COVERS_AREAS, href, type CoversAreaId, type CoversCollectionId } from "@/lib/covers/site";
import { useToday } from "./use-today";

export interface SearchValues {
  area?: CoversAreaId;
  date?: string;
  party?: number;
  time?: string;
}

/**
 * Where, when, how many: the booking search. Submits to the restaurants page
 * with the answers as query params (a plain GET form without JavaScript).
 */
export function SearchBar({ initial = {}, keep, variant = "hero", className }: { initial?: SearchValues; keep?: { collection?: CoversCollectionId; price?: number }; variant?: "hero" | "compact"; className?: string }) {
  const router = useRouter();
  const today = useToday();
  const [area, setArea] = useState<string>(initial.area ?? "");
  // "" is today, whatever day that turns out to be in the browser.
  const [date, setDate] = useState(initial.date ?? "");
  const [party, setParty] = useState(initial.party ?? DEFAULT_PARTY);
  const [time, setTime] = useState(initial.time ?? DEFAULT_TIME);

  const days = today ? bookableDays(today) : [];
  const times = SEARCH_TIMES.includes(time) ? SEARCH_TIMES : [...SEARCH_TIMES, time].sort();
  const hero = variant === "hero";

  return (
    <form
      action={href.restaurants}
      role="search"
      aria-label="Find a table"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(href.search({ area: (area || undefined) as CoversAreaId | undefined, ...keep, date: date && date !== today ? date : undefined, party, time }));
      }}
      className={cn(
        "grid grid-cols-2 gap-2 rounded-[20px] bg-white p-2 lg:grid-cols-[1.35fr_1.15fr_1fr_0.9fr_auto] lg:gap-0 lg:rounded-full",
        hero ? "shadow-[0_0_0_1px_rgb(27_26_24/0.06),0_16px_40px_-16px_rgb(27_26_24/0.35)]" : "shadow-[0_0_0_1px_var(--cv-line)]",
        className,
      )}
    >
      <Field icon={MapPin} label="Where" className="col-span-2 lg:col-span-1">
        <select name="area" value={area} onChange={(e) => setArea(e.target.value)} className="cv-select">
          <option value="">Anywhere in London</option>
          {COVERS_AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field icon={CalendarDays} label="Date" className="col-span-2 sm:col-span-1">
        <select name="date" value={date === today ? "" : date} onChange={(e) => setDate(e.target.value)} className="cv-select">
          <option value="">Today</option>
          {days.slice(1).map((d) => (
            <option key={d} value={d}>
              {dayLabel(d, today!)}
            </option>
          ))}
          {date && date !== today && !days.includes(date) && <option value={date}>{shortDate(date)}</option>}
        </select>
      </Field>
      <Field icon={Users} label="Guests">
        <select name="party" value={party} onChange={(e) => setParty(Number(e.target.value))} className="cv-select">
          {PARTY_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "person" : "people"}
            </option>
          ))}
        </select>
      </Field>
      <Field icon={Clock} label="Time">
        <select name="time" value={time} onChange={(e) => setTime(e.target.value)} className="cv-select tabular-nums">
          {times.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className={cn("cv-btn cv-btn-primary col-span-2 h-14 lg:col-span-1 lg:ml-2", hero ? "lg:px-8" : "lg:px-6")}>
        <Search className="size-[18px]" strokeWidth={2.25} />
        Find a table
      </button>
    </form>
  );
}

function Field({ icon: Icon, label, className, children }: { icon: typeof MapPin; label: string; className?: string; children: ReactNode }) {
  return (
    <label
      className={cn(
        "relative flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[14px] bg-(--cv-bg) px-3.5 py-2.5 sm:gap-3 sm:px-4 transition-colors hover:bg-(--cv-muted) lg:rounded-full lg:bg-transparent lg:px-5 lg:hover:bg-(--cv-bg)",
        "lg:[&+&]:before:absolute lg:[&+&]:before:inset-y-3 lg:[&+&]:before:left-0 lg:[&+&]:before:w-px lg:[&+&]:before:bg-(--cv-line) lg:[&+&]:before:content-['']",
        className,
      )}
    >
      <Icon className="size-[18px] shrink-0 text-(--cv-accent)" strokeWidth={2} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-medium leading-tight text-(--cv-mute)">{label}</span>
        {children}
      </span>
      <ChevronDown className="pointer-events-none hidden size-4 shrink-0 text-(--cv-mute) sm:block" strokeWidth={2} />
    </label>
  );
}
