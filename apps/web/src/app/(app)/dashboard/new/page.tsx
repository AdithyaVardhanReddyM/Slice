import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { PageHeader } from "@/components/console/primitives";
import { NewWidgetForm } from "@/components/console/widgets/new-widget-form";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SETUP_STEPS } from "@/lib/mock/setup";

export const metadata: Metadata = { title: "New widget" };

const NEXT_STEPS: Record<string, string> = {
  store: "We draft a profile from your site. You edit it.",
  catalog: "Upload a file or connect Shopify, WooCommerce or a feed.",
  taste: "Choose what the questionnaire asks: music, film, travel and more.",
  concierge: "Name it, give it a voice, set guardrails.",
  appearance: "Match the launcher and panel to your brand.",
  install: "Add one script tag. We confirm when it's live.",
};

export default function NewWidgetPage() {
  return (
    <StandaloneShell
      actions={
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "ghost" })}
        >
          <X data-icon="inline-start" /> Cancel
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <PageHeader
          title="New widget"
          description="A widget is one store: its catalog, its taste questionnaire and its concierge. Start with the basics. Setup takes about ten minutes after this."
        />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <NewWidgetForm />

          <Card>
            <CardHeader>
              <CardTitle>What happens next</CardTitle>
              <CardDescription>
                Six short steps after you create it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {SETUP_STEPS.map((s, i) => (
                  <li key={s.id} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.estimate}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {NEXT_STEPS[s.id]}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
            <CardFooter>
              <p className="text-xs text-muted-foreground">
                Progress saves as you go. Leave halfway and pick up from the
                widget list.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </StandaloneShell>
  );
}
