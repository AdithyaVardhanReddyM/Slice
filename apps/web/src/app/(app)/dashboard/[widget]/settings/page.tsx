import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, PageSkeleton } from "@/components/console/primitives";
import {
  SettingsForm,
  type SettingsContext,
  type SettingsValues,
} from "@/components/console/settings/settings-form";
import { catalogs } from "@/lib/mock/catalog";
import { hash } from "@/lib/mock/random";
import { invites, members } from "@/lib/mock/team";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({
  params,
}: PageProps<"/dashboard/[widget]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

/** Stable fake secret that shares the publishable key's environment and prefix. */
function secretFor(publicKey: string) {
  const prefix = publicKey
    .replace(/^pk_/, "sk_")
    .split("_")
    .slice(0, 3)
    .join("_");
  const body = [1, 2, 3]
    .map((i) => hash(`${publicKey}:secret:${i}`).toString(36))
    .join("")
    .slice(0, 24);
  return `${prefix}_${body}`;
}

async function SettingsContent({
  params,
}: {
  params: PageProps<"/dashboard/[widget]/settings">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();

  const store = widget.storeKey ? catalogs[widget.storeKey].store : null;
  const fashion = widget.storeKey === "fold";

  const initial: SettingsValues = {
    name: widget.name,
    domain: widget.domain,
    live: widget.status === "live",
    timezone: "America/New_York",
    description: store?.description ?? "",
    vertical: widget.vertical,
    pricing: fashion ? "mid" : "premium",
    voice: fashion ? "playful" : "warm",
    voiceNotes: fashion
      ? "Name the brand on first mention. Sizes in US and EU."
      : "Say “sofa”, never “couch”. Give dimensions in inches.",
    conciergeName: `${widget.name} concierge`,
    greeting: `Hi! I'm the ${widget.name} concierge. A few quick picks so I know your taste, or skip them and just ask.`,
    persona: fashion ? "friend" : "curator",
    recsPerReply: "3",
    guardrails: {
      inStock: true,
      budget: true,
      salePrices: true,
      pairings: !fashion,
      handoff: true,
    },
    sources: { questionnaire: true, chat: true, city: true, page: false },
    retention: "90",
    roles: Object.fromEntries(members.map((m) => [m.id, m.role])),
  };

  const context: SettingsContext = {
    widgetId: widget.id,
    inSetup: widget.status === "setup",
    keys: {
      publicKey: widget.publicKey,
      secretKey: secretFor(widget.publicKey),
      createdAt: widget.createdAt,
      secretLastUsed: widget.catalog.lastSyncAt ?? widget.createdAt,
    },
    members,
    invites,
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Settings"
        description={`Widget, concierge and workspace settings for ${widget.name}.`}
      />
      <SettingsForm key={widget.id} initial={initial} context={context} />
    </div>
  );
}
