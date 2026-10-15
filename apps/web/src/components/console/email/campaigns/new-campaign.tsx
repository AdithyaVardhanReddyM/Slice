"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowUp, Check, ChevronDown, Eye, FilePlus2, UserStar, UsersRound } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { EMAIL_TEMPLATES } from "@slice/backend/convex/emailTemplates";
import type { EmailItem, EmailTemplate, TemplateCategory } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { errorText } from "@/lib/email/labels";
import { renderTemplateFor } from "@/lib/email/render-context";
import { kitOf, profileOf, type EmailBrand } from "@/lib/email/types";
import { PillTabs } from "@/components/console/home/ui";
import { ConsolePage } from "@/components/console/shell-ui";
import { Spinner } from "@/components/console/setup/atoms";
import { coverTiles } from "@/components/console/pages/taste-cover";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Avatar, KIND_LABEL, peopleCount, type AudienceRow } from "@/components/console/email/contacts/shared";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmailPreviewDialog } from "./email-preview-dialog";
import { EmailThumb, useBrandItems } from "./shared";

const IDEAS = [
  "This month's new arrivals, with a pick for each reader",
  "Invite everyone to our next event",
  "A thank-you to our regulars with 15% off",
  "Win back people we have not seen in a while",
];

const CATEGORY_ORDER: TemplateCategory[] = ["Welcome", "Newsletter", "Products", "Promotion", "Events", "Re-engage", "Announcement", "Letter"];

/**
 * "Create a campaign": say what to send (and, optionally, to whom) and the
 * builder writes it, or start from a template drawn in the brand's own look.
 */
export function NewCampaignScreen() {
  const brand = useEmailBrand();
  const router = useRouter();
  const create = useMutation(api.emailCampaigns.create);
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id });
  const items = useBrandItems(brand._id);
  const [prompt, setPrompt] = useState("");
  // Audiences ticked for "For": taste groups, and the individual contacts (everyone of them).
  const [picked, setPicked] = useState<Id<"emailAudiences">[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null);

  const ready = (audiences ?? []).filter((a) => a.status === "ready" && (a.kind === "group" || a.size > 0));
  const chosen = ready.filter((a) => picked.includes(a._id));
  const individuals = chosen.find((a) => a.kind === "people");
  const people = useQuery(api.emailContacts.byAudience, individuals ? { audienceId: individuals._id } : "skip");
  const categories = CATEGORY_ORDER.filter((c) => EMAIL_TEMPLATES.some((t) => t.category === c));
  const templates = EMAIL_TEMPLATES.filter((t) => category === "all" || t.category === category);
  const typed = prompt.trim();

  /** Creates the campaign and opens the editor; it generates only when there is a prompt to work from. */
  async function start(key: string, template?: EmailTemplate | "blank") {
    setBusy(key);
    setError(null);
    try {
      const id = await create({
        brandId: brand._id,
        ...(template && template !== "blank" ? { templateId: template.id, name: template.name } : {}),
        ...(typed ? { prompt: typed } : {}),
        ...(chosen.some((a) => a.kind === "group") ? { groupIds: chosen.filter((a) => a.kind === "group").map((a) => a._id) } : {}),
        ...(individuals && people?.length ? { contactIds: people.filter((c) => !c.unsubscribed).map((c) => c._id) } : {}),
      });
      router.push(`/dashboard/email/${brand.slug}/campaigns/${id}${typed ? "?generate=1" : ""}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  return (
    <ConsolePage className="space-y-12">
      <section
        className="relative overflow-hidden rounded-3xl bg-white px-6 py-10 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_12px_32px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05] sm:px-10 sm:py-14"
        style={{
          backgroundImage: kitOf(brand)
            ? `radial-gradient(70% 90% at 0% 0%, color-mix(in oklab, ${kitOf(brand)!.colors.primary} 14%, transparent), transparent 70%), radial-gradient(60% 80% at 100% 100%, color-mix(in oklab, ${kitOf(brand)!.colors.accent} 18%, transparent), transparent 70%)`
            : undefined,
        }}
      >
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <h1 className="text-[32px] leading-tight font-medium tracking-[-0.03em] text-neutral-950 sm:text-[40px]">What do you want to send?</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed) void start("prompt");
            }}
            className="rounded-2xl bg-white p-3 text-left shadow-[0_12px_32px_-16px_rgba(20,20,20,0.25)] ring-1 ring-black/[0.08] focus-within:ring-2 focus-within:ring-neutral-900/20"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey) && typed) {
                  e.preventDefault();
                  void start("prompt");
                }
              }}
              rows={3}
              placeholder={`Describe the email: what it is about, what to feature, the tone. The builder writes it in ${brand.name}'s voice.`}
              className="block w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
              aria-label="What do you want to send?"
            />
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <AudiencePicker
                audiences={ready}
                loading={audiences === undefined}
                value={chosen}
                onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
                onClear={() => setPicked([])}
              />
              <Button type="submit" disabled={!typed || !!busy} className="ml-auto h-9 rounded-full px-4">
                {busy === "prompt" ? <Spinner data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
                Create
              </Button>
            </div>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setPrompt(idea)}
                className="rounded-full bg-white/80 px-3 py-1.5 text-sm text-neutral-700 ring-1 ring-black/[0.08] transition-colors hover:bg-white hover:text-neutral-950"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">Or start from a template</h2>
            <p className="text-sm text-muted-foreground">
              Each one drawn in {brand.name}&apos;s colours and fonts, with its own items.
              {typed ? " Your description goes with it, and the builder adapts the template to it." : ""}
            </p>
          </div>
          <PillTabs
            label="Category"
            size="sm"
            value={category}
            onChange={setCategory}
            options={[{ value: "all" as const, label: "All" }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {category === "all" && (
            <button
              type="button"
              onClick={() => void start("blank", "blank")}
              disabled={!!busy}
              className="group flex flex-col overflow-hidden rounded-2xl border border-dashed border-black/15 text-left transition-colors hover:border-black/30 hover:bg-white/60 disabled:opacity-60"
            >
              <span className="flex aspect-[4/5] flex-col items-center justify-center gap-3 text-muted-foreground">
                <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-transform group-hover:scale-110">
                  {busy === "blank" ? <Spinner className="size-5" /> : <FilePlus2 className="size-5" />}
                </span>
                <span className="text-sm font-medium text-neutral-900">Blank</span>
              </span>
              <span className="border-t border-dashed border-black/10 p-4 text-sm text-muted-foreground">Your logo, an empty body and the footer. Build it up yourself or with the builder.</span>
            </button>
          )}
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} brand={brand} items={items} busy={busy === t.id} disabled={!!busy} onUse={() => void start(t.id, t)} onPreview={() => setPreviewing(t)} />
          ))}
        </div>
      </section>

      <TemplatePreview
        template={previewing}
        brand={brand}
        items={items ?? []}
        busy={!!previewing && busy === previewing.id}
        onClose={() => setPreviewing(null)}
        onUse={(t) => void start(t.id, t)}
      />
    </ConsolePage>
  );
}

/** Optional "For": any taste groups and the individual contacts, each shown by its face. */
function AudiencePicker({
  audiences,
  loading,
  value,
  onToggle,
  onClear,
}: {
  audiences: AudienceRow[];
  loading: boolean;
  value: AudienceRow[];
  onToggle: (id: Id<"emailAudiences">) => void;
  onClear: () => void;
}) {
  const first = value[0];
  const label = value.map((a) => (a.kind === "people" ? "individual contacts" : a.name)).join(", ").replace(/, ([^,]*)$/, " and $1");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 max-w-72 items-center gap-2 rounded-full bg-neutral-100 pr-3 pl-1.5 text-sm text-neutral-700 transition-colors outline-none hover:bg-neutral-200/70 focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-neutral-200/70"
          />
        }
      >
        {first ? (
          <Avatar name={first.name} image={coverTiles(profileOf(first), 1)[0]?.image} className="size-6" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-white text-neutral-500">
            <UsersRound className="size-3.5" />
          </span>
        )}
        <span className="truncate">
          <span className="text-muted-foreground">For </span>
          <span className="font-medium text-neutral-900">{value.length ? label : "choose later"}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <Spinner className="size-3.5" /> Loading audiences
          </div>
        ) : audiences.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">No audiences yet. Import contacts first, or choose them in the Recipients step.</div>
        ) : (
          audiences.map((a) => (
            <DropdownMenuItem key={a._id} closeOnClick={false} onClick={() => onToggle(a._id)} className="gap-2.5 py-1.5">
              <Avatar name={a.name} image={coverTiles(profileOf(a), 1)[0]?.image} className="size-8 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {KIND_LABEL[a.kind]} · {peopleCount(a.size, a.kind === "people" ? "person" : "contact")}
                </span>
              </span>
              {value.some((v) => v._id === a._id) && <Check className="size-4" />}
            </DropdownMenuItem>
          ))
        )}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>Choose later</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersonalBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full bg-neutral-900 px-2 text-xs font-medium text-white shadow-sm", className)}>
      <UserStar className="size-3" /> Personal
    </span>
  );
}

function TemplateCard({
  template,
  brand,
  items,
  busy,
  disabled,
  onUse,
  onPreview,
}: {
  template: EmailTemplate;
  brand: EmailBrand;
  items: EmailItem[] | undefined;
  busy: boolean;
  disabled: boolean;
  onUse: () => void;
  onPreview: () => void;
}) {
  const html = useMemo(() => (items ? renderTemplateFor(brand, template.id, items) : null), [brand, template.id, items]);
  return (
    <div className="group/email flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] ring-1 ring-black/[0.06] transition-shadow hover:shadow-lg hover:shadow-black/5">
      <div className="relative">
        <EmailThumb html={html} className="aspect-[4/5] border-b border-black/[0.05]" />
        {template.personal && <PersonalBadge className="absolute top-3 left-3" />}
        {/* Actions rise over the bottom of the render, so the email stays readable while it scrolls. */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-1 justify-center gap-2 bg-linear-to-t from-black/55 via-black/25 to-transparent px-3 pt-12 pb-4 opacity-0 transition-all duration-200 group-focus-within/email:translate-y-0 group-focus-within/email:opacity-100 group-hover/email:translate-y-0 group-hover/email:opacity-100">
          <Button onClick={onUse} disabled={disabled} className="h-9 rounded-full bg-white px-4 text-neutral-950 shadow-lg hover:bg-neutral-100">
            {busy && <Spinner data-icon="inline-start" />}
            Use template
          </Button>
          <Button onClick={onPreview} variant="outline" className="h-9 rounded-full border-white/40 bg-neutral-950/60 px-4 text-white backdrop-blur hover:bg-neutral-950/80 hover:text-white">
            <Eye data-icon="inline-start" /> Preview
          </Button>
        </div>
      </div>
      <div className="space-y-0.5 p-4">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-neutral-950">{template.name}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{template.category}</span>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{template.purpose}</p>
      </div>
    </div>
  );
}

function TemplatePreview({
  template,
  brand,
  items,
  busy,
  onClose,
  onUse,
}: {
  template: EmailTemplate | null;
  brand: EmailBrand;
  items: EmailItem[];
  busy: boolean;
  onClose: () => void;
  onUse: (t: EmailTemplate) => void;
}) {
  const html = useMemo(() => (template ? renderTemplateFor(brand, template.id, items) : null), [brand, template, items]);
  return (
    <EmailPreviewDialog
      open={!!template}
      onOpenChange={(o) => !o && onClose()}
      title={template?.name ?? ""}
      description={template?.purpose}
      html={html}
      subject={template?.doc.subject}
      preheader={template?.doc.preheader}
      from={brand.sender?.fromName ?? brand.name}
      aside={
        template?.personal ? (
          <div className="space-y-3 text-sm">
            <PersonalBadge />
            <p className="leading-relaxed text-muted-foreground">
              Built around taste slots. Sent to individual contacts, the marked blocks are rewritten for each person from their own Qloo profile; sent to a taste group, they are written for the group.
            </p>
          </div>
        ) : undefined
      }
      footer={
        template && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => onUse(template)} disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              Use template
            </Button>
          </>
        )
      }
    />
  );
}
