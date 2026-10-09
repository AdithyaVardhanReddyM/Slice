import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusText } from "@/components/console/sidebar";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmt } from "@/lib/format";
import { SETUP_STEPS } from "@/lib/mock/setup";
import type { Widget } from "@/lib/mock/types";

/** One storefront. Live widgets open the dashboard; drafts continue setup. */
export function WidgetCard({ widget }: { widget: Widget }) {
  const live = widget.status === "live";
  const href = live
    ? `/dashboard/${widget.id}`
    : `/dashboard/${widget.id}/setup`;
  const done = widget.completedSteps.length;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[477/305] overflow-hidden border-b bg-muted">
        <Image
          src="/illustrations/widget-card.svg"
          alt=""
          fill
          sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{widget.name}</h3>
            <p className="truncate text-sm text-muted-foreground">
              {widget.domain} · {widget.vertical}
            </p>
          </div>
          <StatusText status={widget.status} />
        </div>

        {live ? (
          <dl className="grid grid-cols-3 gap-3 border-t pt-4">
            {(
              [
                ["Conversations", fmt.int(widget.stats7d.conversations)],
                ["Click-through", fmt.pct(widget.stats7d.recCtr)],
                ["Revenue", fmt.money(widget.stats7d.influencedRevenue)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-xs text-muted-foreground">
                  {label}
                </dt>
                <dd className="num mt-0.5 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Setup progress</span>
              <span className="num font-medium">
                {done} of {SETUP_STEPS.length}
              </span>
            </div>
            <Progress value={(done / SETUP_STEPS.length) * 100} />
          </div>
        )}

        <div className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {live
              ? `${fmt.int(widget.catalog.products)} products · last 7 days`
              : "Continue where you left off"}
          </span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

/** Shown when the workspace has no widgets yet. */
export function NoWidgets() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="relative mb-8 aspect-[635/303] w-full overflow-hidden rounded-xl shadow-xl ring-1 ring-foreground/10">
        <Image
          src="/illustrations/no-widget-card.svg"
          alt=""
          fill
          priority
          sizes="512px"
          className="object-cover"
        />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">No widgets yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Create a widget for your storefront. Connect your catalog, choose the
        taste questions, and put a concierge on your site in about ten minutes.
      </p>
      <Link
        href="/dashboard/new"
        className={buttonVariants({ className: "mt-6" })}
      >
        Create your first widget
      </Link>
    </div>
  );
}
