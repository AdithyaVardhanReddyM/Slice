"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, CircleCheck } from "lucide-react";
import { Kbd } from "@/components/console/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogRow } from "./types";

/** Readiness checks, phrased as what to add. */
const ADD: Record<string, string> = {
  "Description depth": "A longer description",
  "Style tagged": "A style",
  Material: "Another material",
  Colors: "Another color",
  "Use cases": "More use cases",
  Room: "A room",
  Occasion: "An occasion",
  Fit: "A fit",
};

export function ProductDrawer({
  row,
  open,
  onOpenChange,
  onStep,
  position,
}: {
  row: CatalogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStep: (dir: 1 | -1) => void;
  position: { index: number; total: number } | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onKeyDown={(e) => {
          if (e.key === "j" || e.key === "ArrowDown") {
            e.preventDefault();
            onStep(1);
          } else if (e.key === "k" || e.key === "ArrowUp") {
            e.preventDefault();
            onStep(-1);
          }
        }}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        {row && <DrawerBody row={row} onStep={onStep} position={position} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  row,
  onStep,
  position,
}: {
  row: CatalogRow;
  onStep: (dir: 1 | -1) => void;
  position: { index: number; total: number } | null;
}) {
  const enriched = new Set(row.enriched);
  const missing = row.readiness.checks.filter((c) => !c.ok);
  const opened = Math.round(row.stats.recommended * row.stats.ctr);
  const details: [string, string[], string][] = [
    ["Materials", row.attrs.material, "material"],
    ["Colors", row.attrs.colors, "colors"],
    ["Good for", row.attrs.useCase, "useCase"],
    [
      row.attrs.contextField === "room" ? "Room" : "Occasion",
      row.attrs.context,
      row.attrs.contextField,
    ],
    ["Fit", row.attrs.fit ? [row.attrs.fit] : [], "fit"],
    ["Season", row.attrs.season, "season"],
  ];

  return (
    <>
      <div className="flex h-14 flex-none items-center gap-1 border-b pr-12 pl-5">
        {position && (
          <span className="num text-sm text-muted-foreground">
            {position.index + 1} of {position.total}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous product"
            onClick={() => onStep(-1)}
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next product"
            onClick={() => onStep(1)}
          >
            <ChevronDown />
          </Button>
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        <div>
          <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/[0.04]">
            {row.image && (
              // Merchant-hosted images; next/image would need every merchant CDN allow-listed.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.image} alt="" className="size-full object-cover" />
            )}
          </div>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-lg leading-snug font-semibold tracking-tight">
                {row.name}
              </SheetTitle>
              <SheetDescription>
                {row.brand ? `${row.brand}, ` : `${row.category}, `}
                {row.subcategory}
              </SheetDescription>
            </div>
            <p className="num shrink-0 text-right text-lg font-semibold text-neutral-950">
              {fmt.money(row.price)}
              {row.compareAtPrice && (
                <span className="block text-sm font-normal text-muted-foreground line-through">
                  {fmt.money(row.compareAtPrice)}
                </span>
              )}
            </p>
          </div>
        </div>

        {missing.length > 0 ? (
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-900/[0.06]">
            <p className="text-sm font-medium text-amber-950">
              Add these to help the concierge match it
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {missing.map((c) => (
                <li key={c.label} className="flex justify-between gap-3">
                  <span>{ADD[c.label] ?? c.label}</span>
                  <span className="text-amber-800/80">{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
            <CircleCheck className="size-4 shrink-0" />
            Ready. The concierge has what it needs to match this product.
          </p>
        )}

        <dl className="grid grid-cols-3 divide-x divide-black/[0.06] rounded-2xl ring-1 ring-black/[0.06]">
          {(
            [
              ["Picked, 7d", row.stats.recommended],
              ["Opened", opened],
              ["Added to cart", row.stats.addToCart],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="num mt-0.5 text-lg font-semibold text-neutral-950">
                {fmt.int(value)}
              </dd>
            </div>
          ))}
        </dl>

        <Section title="What the concierge reads">
          <p className="text-sm leading-relaxed text-neutral-700">
            {row.description}
          </p>
        </Section>

        <Section title="Details">
          <dl className="space-y-2.5 text-sm">
            <Detail label="Style">
              <span className="flex flex-wrap gap-1.5">
                {row.styles.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800"
                  >
                    {s.label}
                  </span>
                ))}
              </span>
            </Detail>
            {details
              .filter(([, values]) => values.length > 0)
              .map(([label, values, field]) => (
                <Detail key={label} label={label}>
                  {values.map((v, i) => (
                    <span key={v}>
                      {i > 0 && ", "}
                      <span
                        className={cn(
                          enriched.has(`${field}:${v}`) &&
                            "font-medium text-orange-700",
                        )}
                      >
                        {v}
                      </span>
                    </span>
                  ))}
                </Detail>
              ))}
            <Detail label="Options">
              {row.variants.map((v, i) => (
                <span key={v.label}>
                  {i > 0 && ", "}
                  <span
                    className={cn(
                      !v.inStock && "text-muted-foreground line-through",
                    )}
                  >
                    {v.label}
                  </span>
                </span>
              ))}
            </Detail>
          </dl>
          {row.enriched.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="font-medium text-orange-700">Orange</span>{" "}
              details were filled in by Slice from the description.
            </p>
          )}
        </Section>
      </div>

      <SheetFooter className="flex-row items-center justify-between border-t">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          to step through
        </span>
        <a
          href={row.href}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          View on store
          <ArrowUpRight />
        </a>
      </SheetFooter>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-neutral-950">{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-neutral-900">{children}</dd>
    </div>
  );
}
