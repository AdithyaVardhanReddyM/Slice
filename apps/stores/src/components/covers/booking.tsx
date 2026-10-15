"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarCheck, CircleCheck, Minus, Plus } from "lucide-react";
import { cn } from "cn";
import { DEFAULT_PARTY, PARTY_SIZES, addDays, bookableDays, bookingRef, dayOfMonth, longDate, parseBooking, sittings, stillBookable, weekday, type Bookable } from "@/lib/covers/booking";
import { useLondonMinutes, useToday } from "./use-today";

interface Booked {
  party: number;
  date: string;
  time: string;
}

/**
 * The booking panel on a restaurant page: guests, one of the next 14 days and a
 * free time, then an inline confirmation. Nothing leaves the browser; times come
 * from the same deterministic table as the rest of the site, and a time passed
 * in the URL (from a card or an email) is picked for you.
 */
export function BookingWidget({ r, name }: { r: Bookable; name: string }) {
  const today = useToday();
  const now = useLondonMinutes();
  const params = useSearchParams();
  const [party, setParty] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  if (!today) return <BookingSkeleton />;

  const fromUrl = parseBooking(Object.fromEntries(params.entries()), today);
  const guests = party ?? fromUrl.party ?? DEFAULT_PARTY;
  const tonight = stillBookable(sittings(r, today, guests), today, today, now);
  // Late in the evening, once today's tables have gone, start from tomorrow.
  const day = date ?? fromUrl.date ?? (tonight.lunch.length + tonight.dinner.length ? today : addDays(today, 1));
  const free = stillBookable(sittings(r, day, guests), day, today, now);
  const wanted = time ?? fromUrl.time ?? null;
  const chosen = wanted && (free.lunch.includes(wanted) || free.dinner.includes(wanted)) ? wanted : null;

  if (booked) {
    return (
      <Panel>
        <div role="status" aria-live="polite">
          <CircleCheck className="size-10 text-(--cv-accent)" strokeWidth={1.75} />
          <h2 className="cv-title mt-4 text-[24px]">You&apos;re booked</h2>
          <p className="mt-2 text-[18px] font-medium leading-snug">
            Table for {booked.party} at {name}, {longDate(booked.date)}, {booked.time}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-(--cv-line) pt-5 text-[14.5px]">
            <div>
              <dt className="text-(--cv-mute)">Reference</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{bookingRef(r.slug, booked.date, booked.time, booked.party)}</dd>
            </div>
            <div>
              <dt className="text-(--cv-mute)">Guests</dt>
              <dd className="mt-0.5 font-semibold">
                {booked.party} {booked.party === 1 ? "person" : "people"}
              </dd>
            </div>
          </dl>
          <p className="mt-5 rounded-[12px] bg-(--cv-bg) p-4 text-[14.5px] leading-relaxed text-(--cv-ink-soft)">
            It&apos;s in the Covers app under Upcoming. We&apos;ll send a reminder the day before; if plans change, cancel there and the table goes back on Covers.
          </p>
          <button type="button" onClick={() => setBooked(null)} className="cv-btn cv-btn-outline mt-5 w-full">
            Change booking
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2 className="cv-title text-[22px]">Book a table</h2>
      <p className="mt-1 text-[14.5px] text-(--cv-mute)">Free to book. Pick a day and a time.</p>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-[14px] bg-(--cv-bg) px-4 py-2.5">
        <span className="text-[15px] font-medium" id="cv-guests">
          Guests
        </span>
        <div className="flex items-center gap-3" role="group" aria-labelledby="cv-guests">
          <StepButton label="One fewer guest" disabled={guests <= PARTY_SIZES[0]} onClick={() => setParty(guests - 1)}>
            <Minus className="size-4" strokeWidth={2.25} />
          </StepButton>
          <span className="w-[74px] text-center text-[15.5px] font-semibold tabular-nums" aria-live="polite">
            {guests} {guests === 1 ? "person" : "people"}
          </span>
          <StepButton label="One more guest" disabled={guests >= PARTY_SIZES[PARTY_SIZES.length - 1]} onClick={() => setParty(guests + 1)}>
            <Plus className="size-4" strokeWidth={2.25} />
          </StepButton>
        </div>
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">Date</h3>
        <p className="text-[14px] text-(--cv-mute)">{longDate(day)}</p>
      </div>
      <div className="mt-2.5 grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Date">
        {bookableDays(today).map((d) => {
          const on = d === day;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={longDate(d)}
              onClick={() => setDate(d)}
              className={cn(
                "flex h-[54px] flex-col items-center justify-center rounded-[12px] transition-colors",
                on ? "bg-(--cv-primary) text-(--cv-on-primary)" : "bg-white shadow-[inset_0_0_0_1px_var(--cv-line)] hover:shadow-[inset_0_0_0_1px_var(--cv-ink)]",
              )}
            >
              <span className={cn("text-[11.5px] font-medium leading-none", on ? "text-(--cv-on-primary)/75" : "text-(--cv-mute)")}>{d === today ? "Today" : weekday(d)}</span>
              <span className="mt-1.5 text-[16px] font-semibold leading-none tabular-nums">{dayOfMonth(d)}</span>
            </button>
          );
        })}
      </div>

      <Times
        label="Lunch"
        times={free.lunch}
        chosen={chosen}
        onPick={setTime}
        empty={day === today ? "No more lunch tables today." : r.collections.includes("tasting-menus") ? "Lunch is Friday to Sunday only." : "No lunch tables left this day."}
      />
      <Times label="Dinner" times={free.dinner} chosen={chosen} onPick={setTime} empty={day === today ? "No more dinner tables today. Try tomorrow." : "No dinner tables left this day."} />

      <button type="button" disabled={!chosen} onClick={() => chosen && setBooked({ party: guests, date: day, time: chosen })} className="cv-btn cv-btn-primary mt-6 h-[52px] w-full text-[16px]">
        <CalendarCheck className="size-[18px]" strokeWidth={2} />
        {chosen ? `Book for ${chosen}` : "Choose a time"}
      </button>
      <p className="mt-3 text-center text-[13.5px] text-(--cv-mute)">No booking fee. Cancel in the app if plans change.</p>
    </Panel>
  );
}

function Times({ label, times, chosen, onPick, empty }: { label: string; times: string[]; chosen: string | null; onPick: (t: string) => void; empty: string }) {
  return (
    <div className="mt-6">
      <h3 className="text-[15px] font-semibold">{label}</h3>
      {times.length ? (
        <div className="mt-2.5 grid grid-cols-4 gap-2" role="radiogroup" aria-label={`${label} times`}>
          {times.map((t) => {
            const on = t === chosen;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(t)}
                className={cn(
                  "h-10 rounded-full text-[14.5px] font-semibold tabular-nums transition-colors",
                  on ? "bg-(--cv-primary) text-(--cv-on-primary)" : "bg-white text-(--cv-ink) shadow-[inset_0_0_0_1px_var(--cv-line)] hover:shadow-[inset_0_0_0_1.5px_var(--cv-primary)]",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[14.5px] text-(--cv-mute)">{empty}</p>
      )}
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-9 place-items-center rounded-full bg-white shadow-[inset_0_0_0_1px_var(--cv-line)] transition hover:shadow-[inset_0_0_0_1px_var(--cv-ink)] disabled:opacity-40 disabled:hover:shadow-[inset_0_0_0_1px_var(--cv-line)]">
      {children}
    </button>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section id="book" aria-label="Book a table" className="cv-card scroll-mt-24 p-5 sm:p-6">
      {children}
    </section>
  );
}

/** The panel's shape while the browser works out what day it is. */
export function BookingSkeleton() {
  return (
    <Panel>
      <h2 className="cv-title text-[22px]">Book a table</h2>
      <p className="mt-1 text-[14.5px] text-(--cv-mute)">Free to book. Pick a day and a time.</p>
      <div className="mt-5 h-[56px] rounded-[14px] bg-(--cv-bg)" />
      <div className="mt-6 h-5 w-24 rounded bg-(--cv-muted)" />
      <div className="mt-2.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="h-[54px] rounded-[12px] bg-(--cv-bg)" />
        ))}
      </div>
      <div className="mt-6 h-5 w-20 rounded bg-(--cv-muted)" />
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-10 rounded-full bg-(--cv-bg)" />
        ))}
      </div>
      <div className="mt-6 h-[52px] rounded-full bg-(--cv-muted)" />
    </Panel>
  );
}
