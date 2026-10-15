"use client";

import { useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { Boxes, Check, UsersRound, type LucideIcon } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { AGE_LABEL } from "@/lib/pages/types";
import { profileOf } from "@/lib/email/types";
import { ProgressLine } from "@/components/console/pages/shared";
import { TasteCover, coverTiles } from "@/components/console/pages/taste-cover";

// Shapes and small pieces shared by the Contacts screen and the campaign's
// Recipients step: the brand's taste groups, its individual contacts, and
// the uploads they came from.

/** An audience as `emailAudiences.list` returns it: the row plus `unsubscribed` and `listName`. */
export type AudienceRow = FunctionReturnType<typeof api.emailAudiences.list>[number];
export type ListRow = FunctionReturnType<typeof api.emailLists.list>[number];
/** A contact as the list queries return it: without its profile (`hasProfile` says whether it has one). */
export type EmailContact = FunctionReturnType<typeof api.emailContacts.byAudience>[number];

export interface AudienceBrief {
  summary: string;
  speakTo: string;
  leadWith: string;
  hooks: { text: string; evidence: string }[];
}

/** Briefs may be stored loosely; this narrows one. */
export const briefOf = (a: { brief?: unknown } | null | undefined) => (a?.brief ?? null) as AudienceBrief | null;

export const KIND_ICON: Record<string, LucideIcon> = { group: Boxes, people: UsersRound };
export const KIND_LABEL: Record<string, string> = { group: "Taste group", people: "Individuals" };

const LIST_STATUS: Record<string, string> = {
  importing: "Importing",
  resolving: "Reading tastes",
  clustering: "Grouping by taste",
  profiling: "Building profiles",
  compiling: "Building the profile",
  ready: "Ready",
  failed: "Failed",
};
export const statusLabel = (s: string) => LIST_STATUS[s] ?? s;
export const isBusy = (s: string) => s !== "ready" && s !== "failed";

/** A person's face: the first picture from their taste, else nothing (initials stand in). */
export function faceOf(c: Pick<EmailContact, "entities"> & { profile?: unknown }) {
  return coverTiles(profileOf(c), 1, true)[0]?.image ?? c.entities.find((e) => e.image)?.image;
}

/** Kinds of item people book rather than buy. */
const BOOKED_KINDS = new Set(["restaurant", "table", "hotel", "stay", "room", "experience", "class", "tour", "appointment"]);

/** How a brand's customer history reads: books and products are bought, restaurants and stays booked. */
export function historyWords(items: { kind: string }[] | undefined) {
  const booked = !!items?.length && items.filter((i) => BOOKED_KINDS.has(i.kind)).length > items.length / 2;
  return booked
    ? { did: "booked", Did: "Booked", heading: "What they booked", none: "No bookings yet", hasnt: "hasn't booked yet", havent: "haven't booked yet" }
    : { did: "bought", Did: "Bought", heading: "What they bought", none: "No purchases yet", hasnt: "hasn't bought yet", havent: "haven't bought yet" };
}
export type HistoryWords = ReturnType<typeof historyWords>;

/** "25 to 29 · Brooklyn". */
export function aboutOf(c: Pick<EmailContact, "age" | "city" | "neighborhood">) {
  return [c.age ? (AGE_LABEL[c.age] ?? c.age) : null, c.neighborhood ?? c.city].filter(Boolean).join(" · ");
}

export const firstNameOf = (c: Pick<EmailContact, "name" | "firstName" | "email">) =>
  c.firstName || c.name.split(/\s+/)[0] || c.email.split("@")[0];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

// Warm, deep tones for initials so a row of people without pictures still reads as faces.
const AVATAR_TONES = ["bg-stone-700", "bg-amber-800", "bg-emerald-800", "bg-sky-800", "bg-rose-800", "bg-violet-800", "bg-neutral-800"];
const toneOf = (key: string) => AVATAR_TONES[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];

/** A round face: their taste picture, or initials on a steady colour. */
export function Avatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const show = !!image && !broken;
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[0.8em] font-semibold text-white",
        show ? "bg-neutral-200" : toneOf(name),
        className,
      )}
      title={name}
    >
      {show ? (
        // Qloo pictures live on many hosts; next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function ContactAvatar({ contact, className }: { contact: EmailContact; className?: string }) {
  return <Avatar name={contact.name || contact.email} image={faceOf(contact)} className={className} />;
}

/** "36 contacts" / "1 person". */
export const peopleCount = (n: number, noun: "contact" | "person" = "contact") =>
  noun === "person" ? (n === 1 ? "1 person" : `${fmt.int(n)} people`) : n === 1 ? "1 contact" : `${fmt.int(n)} contacts`;

/** A small neutral pill for card corners and rows: status as text, never a dot. */
export function Pill({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/90 px-2 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/[0.06] backdrop-blur",
        className,
      )}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

/**
 * An audience as a card: its taste cover, the agent's one-line read, size and
 * opt-outs. Used on Contacts (opens the drawer) and in the Recipients step
 * (selects it), so selection is optional.
 */
export function AudienceCard({
  audience,
  onClick,
  selected,
  corner,
  footer,
  className,
}: {
  audience: AudienceRow;
  onClick: () => void;
  selected?: boolean;
  corner?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const brief = briefOf(audience);
  const ready = audience.status === "ready";
  const unsubscribed = audience.unsubscribed ?? 0;
  const people = audience.kind === "people";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected === undefined ? undefined : selected}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_1px_2px_rgba(20,20,20,0.04)] ring-1 ring-black/[0.06] transition-[box-shadow,transform] duration-200 outline-none hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "ring-2 ring-neutral-900 hover:translate-y-0",
        className,
      )}
    >
      <TasteCover
        tiles={coverTiles(profileOf(audience), 5, true)}
        icon={KIND_ICON[audience.kind] ?? UsersRound}
        kindLabel={KIND_LABEL[audience.kind] ?? audience.kind}
        title={audience.name}
        subtitle={peopleCount(audience.size, people ? "person" : "contact")}
        corner={
          selected ? (
            <span className="flex size-7 items-center justify-center rounded-full bg-white text-neutral-950 shadow-md">
              <Check className="size-4" />
            </span>
          ) : (
            (corner ?? (!ready ? <Pill>{statusLabel(audience.status)}</Pill> : undefined))
          )
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        {!ready && <ProgressLine progress={audience.progress} status={audience.status} error={audience.error} />}
        {brief?.summary ? (
          <p className="line-clamp-2 text-sm text-neutral-800">{brief.summary}</p>
        ) : ready && audience.topEntities.length > 0 ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">Into {audience.topEntities.slice(0, 3).join(", ")}</p>
        ) : null}
        {unsubscribed > 0 && <div className="mt-auto text-xs text-muted-foreground">{fmt.int(unsubscribed)} unsubscribed, left out of sends</div>}
        {footer}
      </div>
    </button>
  );
}
