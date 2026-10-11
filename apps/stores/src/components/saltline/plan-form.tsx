"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";

export interface PlanDefaults {
  hotel?: string;
  room?: string;
  interest?: string;
  offer?: string;
}

const hotelsList = [
  { value: "", label: "Not sure yet" },
  { value: "lisbon", label: "Saltline Lisbon" },
  { value: "copenhagen", label: "Saltline Copenhagen" },
  { value: "barcelona", label: "Saltline Barcelona" },
  { value: "marseille", label: "Saltline Marseille (spring 2027)" },
];

const interestsList = [
  "Food and wine",
  "Galleries and architecture",
  "Swimming, surf and sailing",
  "Design and making",
  "Markets and cooking",
  "Quiet, long stays",
  "Travelling with children",
  "A celebration",
];

const field =
  "w-full border-b border-sl-line bg-transparent py-3 text-[16px] text-sl-charcoal outline-none transition-colors placeholder:text-sl-mute focus:border-sl-charcoal";
const label = "block text-sm text-sl-mute";

export function PlanForm({ defaults }: { defaults: PlanDefaults }) {
  const [sent, setSent] = useState(false);
  const [interests, setInterests] = useState<string[]>(defaults.interest ? [defaults.interest] : []);
  const [hotel, setHotel] = useState(defaults.hotel ?? "");

  const toggle = (i: string) => setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  if (sent) {
    return (
      <div className="border border-sl-line p-8 sm:p-12">
        <Check className="size-6 text-sl-sea-deep" strokeWidth={1.5} />
        <h2 className="sl-serif mt-4 text-[36px]">Thank you. We will write back within a day.</h2>
        <p className="mt-3 max-w-md text-[16px] text-sl-charcoal-soft">
          One of the team at {hotelsList.find((h) => h.value === hotel)?.label ?? "the hotel you choose"} will reply with
          availability, a suggested room and a few days we think you would like. Nothing is booked until you say so.
        </p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={label}>Name</label>
          <input id="name" name="name" required autoComplete="name" className={field} placeholder="Your name" />
        </div>
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className={field} placeholder="you@example.com" />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="hotel" className={label}>Hotel</label>
          <select id="hotel" name="hotel" value={hotel} onChange={(e) => setHotel(e.target.value)} className={cn(field, "appearance-none")}>
            {hotelsList.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="room" className={label}>Room or offer, if you have one in mind</label>
          <input id="room" name="room" defaultValue={defaults.room ?? defaults.offer ?? ""} className={field} placeholder="Classic Room, Rooftop Room, an offer" />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <label htmlFor="arrive" className={label}>Arriving</label>
          <input id="arrive" name="arrive" type="date" className={field} />
        </div>
        <div>
          <label htmlFor="depart" className={label}>Leaving</label>
          <input id="depart" name="depart" type="date" className={field} />
        </div>
        <div>
          <label htmlFor="party" className={label}>Who is coming</label>
          <select id="party" name="party" defaultValue="2" className={cn(field, "appearance-none")}>
            <option value="1">Just me</option>
            <option value="2">Two of us</option>
            <option value="family">Family with children</option>
            <option value="group">A group of friends</option>
            <option value="event">A party or event</option>
          </select>
        </div>
      </div>

      <fieldset>
        <legend className={label}>What you love, so we can plan your days</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {interestsList.map((i) => {
            const on = interests.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={on}
                className={cn(
                  "border px-4 py-2 text-[15px] transition-colors",
                  on ? "border-sl-charcoal bg-sl-charcoal text-sl-paper" : "border-sl-line text-sl-charcoal-soft hover:border-sl-charcoal",
                )}
              >
                {i}
              </button>
            );
          })}
        </div>
        {defaults.interest && !interestsList.includes(defaults.interest) && (
          <p className="mt-3 text-sm text-sl-charcoal-soft">Also noted: {defaults.interest}</p>
        )}
        <input type="hidden" name="interests" value={interests.join(", ")} />
      </fieldset>

      <div>
        <label htmlFor="notes" className={label}>Anything else</label>
        <textarea id="notes" name="notes" rows={3} className={cn(field, "resize-none")} placeholder="An anniversary, a dietary need, a late flight, a question" />
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <button type="submit" className="bg-sl-charcoal px-8 py-3.5 text-[15px] font-medium text-sl-paper hover:bg-sl-sea-deep">
          Send enquiry
        </button>
        <p className="text-sm text-sl-mute">We reply within one working day. No booking is made until you confirm.</p>
      </div>
    </form>
  );
}
