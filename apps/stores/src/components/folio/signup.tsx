"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";

/** The Fern Letter signup. A demo: it thanks you and keeps nothing. */
export function NewsletterForm({ tone = "dark", id = "ff-newsletter" }: { tone?: "dark" | "light"; id?: string }) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <p className={cn("flex items-center gap-2 text-[16px] font-semibold", tone === "dark" ? "text-(--ff-paper)" : "text-(--ff-green)")}>
        <Check className="size-5" strokeWidth={2.25} /> You&apos;re on the list. The next Fern Letter goes out Friday.
      </p>
    );
  }
  return (
    <form
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Email address
      </label>
      <input id={id} type="email" required placeholder="Your email address" autoComplete="email" className="ff-input flex-1" />
      <button type="submit" className={cn("ff-btn", tone === "dark" ? "ff-btn-accent" : "ff-btn-primary")}>
        Subscribe
      </button>
    </form>
  );
}

/** Save a seat at an event. A demo: it confirms and keeps nothing. */
export function RsvpForm({ slug, title }: { slug: string; title: string }) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-(--ff-green-tint) px-4 py-3 text-[15.5px] font-semibold text-(--ff-green)">
        <Check className="size-5" strokeWidth={2.25} /> You&apos;re on the list for {title}. See you there.
      </p>
    );
  }
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
    >
      <label htmlFor={`${slug}-name`} className="sr-only">
        Name
      </label>
      <input id={`${slug}-name`} required placeholder="Your name" autoComplete="name" className="ff-input" />
      <label htmlFor={`${slug}-email`} className="sr-only">
        Email address
      </label>
      <input id={`${slug}-email`} type="email" required placeholder="Email address" autoComplete="email" className="ff-input" />
      <button type="submit" className="ff-btn ff-btn-primary">
        Save a seat
      </button>
    </form>
  );
}
