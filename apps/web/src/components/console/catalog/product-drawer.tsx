"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleMinus,
} from "lucide-react";
import { Badge, Kbd } from "@/components/console/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INFERRED_CLASS, ReadinessMeter, Thumb, ValueChip } from "./atoms";
import type { CatalogRow } from "./types";

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
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
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
  const isInferred = (field: string, value: string) =>
    enriched.has(`${field}:${value}`);
  const contextLabel = row.attrs.contextField === "room" ? "Room" : "Occasion";
  const words = row.description.trim().split(/\s+/).length;
  const passing = row.readiness.checks.filter((c) => c.ok).length;

  return (
    <>
      <div className="flex h-14 flex-none items-center gap-1 border-b pr-12 pl-4">
        <span className="text-sm text-muted-foreground">
          How Slice reads this product
        </span>
        <span className="ml-auto flex items-center gap-1">
          {position && (
            <span className="num mr-1 text-sm text-muted-foreground">
              {position.index + 1} of {position.total}
            </span>
          )}
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

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <SheetHeader className="flex-row gap-4 p-6 pb-4">
          <Thumb src={row.image} size={72} className="rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            {row.brand && (
              <div className="text-sm text-muted-foreground">{row.brand}</div>
            )}
            <SheetTitle className="text-lg font-semibold tracking-tight">
              {row.name}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {row.category} / {row.subcategory}
              </span>
              <span aria-hidden>·</span>
              <span className="num text-foreground">
                {fmt.money(row.price)}
                {row.compareAtPrice && (
                  <span className="ml-1.5 text-muted-foreground line-through">
                    {fmt.money(row.compareAtPrice)}
                  </span>
                )}
              </span>
              <span aria-hidden>·</span>
              <span>{row.id}</span>
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="mx-6 grid grid-cols-2 divide-x rounded-lg border sm:grid-cols-4">
          <MiniStat
            label="Recommended, 7d"
            value={fmt.int(row.stats.recommended)}
          />
          <MiniStat
            label="CTR"
            value={row.stats.recommended ? fmt.pct(row.stats.ctr, 0) : "—"}
          />
          <MiniStat label="Add to cart" value={fmt.int(row.stats.addToCart)} />
          <div className="space-y-1 px-3 py-2.5">
            <div className="text-xs text-muted-foreground">Readiness</div>
            <div className="num text-lg font-semibold">
              {row.readiness.score}
            </div>
          </div>
        </div>

        <Section
          title="What the concierge reads"
          aside={<span className="num">{words} words</span>}
        >
          <p className="leading-relaxed text-muted-foreground">
            {row.description}
          </p>
        </Section>

        <Section
          title="Attributes"
          aside={
            row.enriched.length > 0 ? (
              <Badge className={INFERRED_CLASS}>Enriched by Slice</Badge>
            ) : null
          }
        >
          <dl className="grid grid-cols-4 gap-x-4 gap-y-3">
            <AttrRow label="Style">
              {row.styles.map((s) => (
                <Badge key={s.id}>{s.label}</Badge>
              ))}
            </AttrRow>
            <AttrRow label="Material">
              {row.attrs.material.map((v) => (
                <ValueChip key={v} inferred={isInferred("material", v)}>
                  {v}
                </ValueChip>
              ))}
            </AttrRow>
            <AttrRow label="Colors">
              {row.attrs.colors.map((v) => (
                <ValueChip key={v}>{v}</ValueChip>
              ))}
              {row.attrs.colorFamily.map((v) => (
                <ValueChip
                  key={`f-${v}`}
                  inferred={isInferred("colorFamily", v)}
                >
                  Family: {v}
                </ValueChip>
              ))}
            </AttrRow>
            <AttrRow label="Use case">
              {row.attrs.useCase.map((v) => (
                <ValueChip key={v} inferred={isInferred("useCase", v)}>
                  {v}
                </ValueChip>
              ))}
            </AttrRow>
            <AttrRow label={contextLabel}>
              {row.attrs.context.map((v) => (
                <ValueChip
                  key={v}
                  inferred={isInferred(row.attrs.contextField, v)}
                >
                  {v}
                </ValueChip>
              ))}
            </AttrRow>
            {row.attrs.fit && (
              <AttrRow label="Fit">
                <ValueChip>{row.attrs.fit}</ValueChip>
              </AttrRow>
            )}
            {row.attrs.season.length > 0 && (
              <AttrRow label="Season">
                {row.attrs.season.map((v) => (
                  <ValueChip key={v}>{v}</ValueChip>
                ))}
              </AttrRow>
            )}
            <AttrRow label="Price tier">
              <ValueChip>{row.attrs.priceTier}</ValueChip>
            </AttrRow>
          </dl>
        </Section>

        <Section title="Taste tags it tends to match" aside="Qloo affinity">
          <p className="mb-3 text-muted-foreground">
            Shoppers whose taste profile carries these tags score this product
            higher. Derived from its style{row.styles.length > 1 ? "s" : ""}:{" "}
            {row.styles.map((s) => s.label).join(" and ")}.
          </p>
          <ul className="divide-y rounded-lg border">
            {row.tags.map((t) => (
              <li key={t.id} className="flex h-10 items-center gap-3 px-3">
                <span className="min-w-0 flex-1 truncate">
                  {t.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    urn:tag:keyword
                  </span>
                </span>
                <Progress
                  value={t.weight * 100}
                  className="w-24"
                  aria-label={`${t.name} affinity`}
                />
                <span className="num w-10 text-right">
                  {t.weight.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Readiness checks"
          aside={
            <span className="flex items-center gap-2">
              <span className="num">
                {passing} of {row.readiness.checks.length} pass
              </span>
              <ReadinessMeter
                score={row.readiness.score}
                tier={row.readiness.tier}
                showLabel
              />
            </span>
          }
        >
          <ul className="space-y-2">
            {row.readiness.checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2.5">
                {c.ok ? (
                  <CircleCheck className="size-4 flex-none text-emerald-600" />
                ) : (
                  <CircleMinus className="size-4 flex-none text-amber-600" />
                )}
                <span>{c.label}</span>
                <span className="ml-auto text-muted-foreground">
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Variants"
          aside={
            <span className="num">
              {row.inStock} of {row.variants.length} in stock
            </span>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {row.variants.map((v) => (
              <ValueChip
                key={v.label}
                className={cn(
                  !v.inStock && "text-muted-foreground line-through",
                )}
              >
                {v.label}
              </ValueChip>
            ))}
          </div>
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

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-6 pt-6">
      <Separator className="mb-6" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        {aside && (
          <span className="text-sm text-muted-foreground">{aside}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function AttrRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="pt-0.5 text-muted-foreground">{label}</dt>
      <dd className="col-span-3 flex flex-wrap gap-1.5">{children}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num text-lg font-semibold">{value}</div>
    </div>
  );
}
