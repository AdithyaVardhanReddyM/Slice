"use client";

// The campaign editor: full screen, a top bar with the three steps (Create,
// Recipients, Review & send), and under it either the email builder (rail,
// panel, canvas, inspector) or the Recipients / Review step. Sent campaigns
// open on their report.

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  Eye,
  Hand,
  Monitor,
  MousePointer2,
  Redo2,
  Send,
  Smartphone,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { findBlock, findSection } from "@slice/backend/convex/emailDoc";
import type { EmailItem, EmailTheme } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { usePagesModel } from "@/lib/pages/models";
import { CAMPAIGN_STATUS } from "@/lib/email/labels";
import { docOf, senderOf, type EmailAudience, type EmailBrand, type EmailCampaign } from "@/lib/email/types";
import { useAppSurface } from "@/components/console/pages/builder/editor-shell";
import { Badge } from "@/components/console/primitives";
import { ConsolePage } from "@/components/console/shell-ui";
import { Spinner } from "@/components/console/setup/atoms";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { useBrandItems } from "@/components/console/email/campaigns/shared";
import { RecipientsStep } from "@/components/console/email/campaign/recipients-step";
import { ReviewStep } from "@/components/console/email/campaign/review-step";
import { CampaignReport } from "@/components/console/email/campaign/report";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { duplicate, remove } from "./actions";
import { Canvas } from "./canvas";
import type { ChatComposerHandle } from "./chat-composer";
import { EditorProvider, useEditorEnv, type ChatMessage, type EditorEnv, type PanelId, type PreviewAs } from "./context";
import { EditorDnd } from "./dnd";
import { Inspector } from "./inspector";
import { blockLabel, blockText, isMac, sectionName, typingTarget, type Selection } from "./model";
import { PreviewDialog } from "./preview-dialog";
import { PanelHost, Rail } from "./rail";
import { TestEmailDialog } from "./test-email-dialog";
import { ThemeFonts } from "./theme-fonts";
import { useEmailAgent } from "./use-email-agent";
import { useEmailEditor, type EmailEditor } from "./use-email-editor";

type Step = "create" | "recipients" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "recipients", label: "Recipients" },
  { id: "review", label: "Review & send" },
];

/** /dashboard/email/[brand]/campaigns/[campaign]: keyed by the id so another campaign starts a fresh editor. */
export function CampaignEditor() {
  const { campaign } = useParams<{ campaign: string }>();
  return <CampaignShell key={campaign} campaignId={campaign as Id<"emailCampaigns">} />;
}

function CampaignShell({ campaignId }: { campaignId: Id<"emailCampaigns"> }) {
  useAppSurface();
  const brand = useEmailBrand();
  const campaign = useQuery(api.emailCampaigns.get, { id: campaignId }) as EmailCampaign | null | undefined;

  if (campaign === undefined) return <ShellSkeleton />;
  if (campaign === null) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-lg font-semibold">This campaign is gone</h1>
        <p className="max-w-sm text-sm text-muted-foreground">It may have been deleted, or the link is wrong.</p>
        <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/email/${brand.slug}/campaigns`} />}>
          All campaigns
        </Button>
      </div>
    );
  }
  if (campaign.status === "sent" || campaign.status === "sending") return <ReportView campaign={campaign} brand={brand} />;
  return <Workspace campaign={campaign} brand={brand} />;
}

/* Top bar ------------------------------------------------------------------------- */

function ExitButton({ brand }: { brand: EmailBrand }) {
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 text-neutral-600" nativeButton={false} render={<Link href={`/dashboard/email/${brand.slug}/campaigns`} />}>
      <ArrowLeft /> Exit
    </Button>
  );
}

/** The campaign's name, renamed in place. */
function NameField({ campaign }: { campaign: EmailCampaign }) {
  const rename = useMutation(api.emailCampaigns.rename);
  const [draft, setDraft] = useState(campaign.name);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(campaign.name);
  if (!focused && seen !== campaign.name) {
    setSeen(campaign.name);
    setDraft(campaign.name);
  }
  const commit = () => {
    const name = draft.trim();
    if (!name) setDraft(campaign.name);
    else if (name !== campaign.name) void rename({ id: campaign._id, name });
  };
  return (
    <input
      value={draft}
      aria-label="Campaign name"
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(campaign.name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      style={{ width: `${Math.min(28, Math.max(8, draft.length + 1))}ch` }}
      className="h-8 min-w-0 truncate rounded-lg bg-transparent px-2 text-sm font-medium text-neutral-900 outline-none transition-colors hover:bg-neutral-100 focus:bg-white focus:ring-2 focus:ring-neutral-900/15"
    />
  );
}

function Steps({ step, onGo }: { step: Step; onGo: (s: Step) => void }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <nav aria-label="Campaign steps" className="flex items-center gap-0.5">
      {STEPS.map((s, i) => {
        const current = i === at;
        const done = i < at;
        return (
          <div key={s.id} className="flex items-center gap-0.5">
            <button
              type="button"
              aria-current={current ? "step" : undefined}
              onClick={() => !current && onGo(s.id)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-full pr-3 pl-1.5 text-sm transition-colors",
                current ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  current ? "bg-white text-neutral-900" : done ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-600",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="hidden lg:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="size-4 text-neutral-300" />}
          </div>
        );
      })}
    </nav>
  );
}

function IconToggle<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: LucideIcon }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 items-center rounded-lg bg-neutral-100 p-0.5">
      {options.map((o) => (
        <Tooltip key={o.value}>
          <TooltipTrigger
            render={
              <button
                type="button"
                role="radio"
                aria-checked={value === o.value}
                aria-label={o.label}
                onClick={() => onChange(o.value)}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:text-neutral-900",
                  value === o.value && "bg-white text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
                )}
              />
            }
          >
            <o.icon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{o.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function IconButton({ label, shortcut, icon: Icon, onClick, disabled }: { label: string; shortcut?: string; icon: LucideIcon; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label} className="text-neutral-600" />}>
        <Icon />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-1.5 text-background/60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function SaveState({ editor, busy }: { editor: EmailEditor; busy: boolean }) {
  const s = editor.saveState;
  const [Icon, text]: [LucideIcon, string] = busy ? [CloudUpload, "Slice is writing"] : s === "saved" ? [CloudCheck, "Saved"] : s === "error" ? [CloudAlert, "Not saved"] : s === "saving" ? [CloudUpload, "Saving"] : [Cloud, "Saving"];
  return (
    <button
      type="button"
      onClick={() => s === "error" && void editor.save()}
      title={s === "error" ? "Could not save. Click to try again." : "Changes save as you go"}
      className={cn("hidden h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-neutral-500 xl:inline-flex", s === "error" ? "text-destructive hover:bg-destructive/5" : "cursor-default")}
    >
      <Icon className="size-4" />
      {text}
      {s === "error" && <span className="underline underline-offset-2">Retry</span>}
    </button>
  );
}

function TopBar({
  brand,
  campaign,
  step,
  onGo,
  editor,
  busy,
  onPreview,
  onTest,
}: {
  brand: EmailBrand;
  campaign: EmailCampaign;
  step: Step;
  onGo: (s: Step) => void;
  editor: EmailEditor;
  busy: boolean;
  onPreview: () => void;
  onTest: () => void;
}) {
  const mod = isMac() ? "⌘" : "Ctrl+";
  const next = step === "create" ? "recipients" : step === "recipients" ? "review" : null;
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 bg-white px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <ExitButton brand={brand} />
        <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
        <NameField campaign={campaign} />
        {campaign.status !== "draft" && <Badge tone={CAMPAIGN_STATUS[campaign.status].tone === "outline" ? "outline" : "neutral"}>{CAMPAIGN_STATUS[campaign.status].label}</Badge>}
      </div>
      <Steps step={step} onGo={onGo} />
      <div className="flex flex-1 items-center justify-end gap-1.5">
        {step === "create" && (
          <>
            <SaveState editor={editor} busy={busy} />
            <IconButton label="Undo" shortcut={`${mod}Z`} icon={Undo2} onClick={editor.undo} disabled={!editor.canUndo} />
            <IconButton label="Redo" shortcut={`⇧${mod}Z`} icon={Redo2} onClick={editor.redo} disabled={!editor.canRedo} />
            <Separator orientation="vertical" className="mx-1 hidden h-5 data-vertical:self-center 2xl:block" />
            <span className="hidden 2xl:inline-flex">
              <IconToggle
                label="Canvas tool"
                value={editor.tool}
                onChange={editor.setTool}
                options={[
                  { value: "select", label: "Select (V)", icon: MousePointer2 },
                  { value: "hand", label: "Move around (H)", icon: Hand },
                ]}
              />
            </span>
            <IconToggle
              label="Device"
              value={editor.device}
              onChange={editor.setDevice}
              options={[
                { value: "desktop", label: "Desktop", icon: Monitor },
                { value: "phone", label: "Phone", icon: Smartphone },
              ]}
            />
            <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
          </>
        )}
        <Button variant="ghost" size="sm" onClick={onPreview} className="text-neutral-700">
          <Eye data-icon="inline-start" /> <span className="hidden xl:inline">Preview</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onTest}>
          <Send data-icon="inline-start" /> Test email
        </Button>
        {next && (
          <Button size="sm" onClick={() => onGo(next)} className="bg-neutral-900 text-white hover:bg-neutral-800">
            Next <ArrowRight data-icon="inline-end" />
          </Button>
        )}
      </div>
    </header>
  );
}

/* Workspace ------------------------------------------------------------------------ */

/** The From name inboxes show. */
const senderName = (brand: EmailBrand) => senderOf(brand)?.fromName?.trim() || brand.name;

function normaliseMessages(raw: unknown): ChatMessage[] {
  const list = Array.isArray(raw) ? raw : (raw as { messages?: unknown[] } | null | undefined)?.messages;
  return (Array.isArray(list) ? list : []) as ChatMessage[];
}

function Workspace({ campaign, brand }: { campaign: EmailCampaign; brand: EmailBrand }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("step");
  const step: Step = raw === "recipients" || raw === "review" ? raw : "create";

  const chat = useQuery(api.emailCampaigns.messages, { id: campaign._id });
  const messages = useMemo(() => normaliseMessages(chat), [chat]);
  const items = useBrandItems(brand._id);
  const itemList = useMemo(() => items ?? [], [items]);
  const itemMap = useMemo(() => Object.fromEntries(itemList.map((i) => [i.id, i])) as Record<string, EmailItem>, [itemList]);
  const audience = useQuery(api.emailAudiences.get, campaign.audienceId ? { id: campaign.audienceId } : "skip") as EmailAudience | null | undefined;
  const [model] = usePagesModel();

  // The agent saves the merchant's edits first; the editor exists after it, so it is reached through a ref.
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const beforeTurn = useCallback(async () => {
    await flushRef.current();
  }, []);
  const history = useMemo(() => messages.map((m) => ({ role: m.role, text: m.text })), [messages]);
  const agent = useEmailAgent({ campaignId: campaign._id, history, model, beforeTurn });
  const serverDoc = docOf(campaign) ?? undefined;
  const editor = useEmailEditor({ campaignId: campaign._id, serverDoc, locked: agent.busy });
  useEffect(() => {
    flushRef.current = editor.flush;
  }, [editor.flush]);
  const beginTurn = editor.beginTurn;
  useEffect(() => {
    if (agent.busy) beginTurn();
  }, [agent.busy, beginTurn]);

  const [panel, setPanel] = useState<PanelId | null>("chat");
  const [previewAs, setPreviewAs] = useState<PreviewAs | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const composer = useRef<ChatComposerHandle>(null);

  const doc = editor.doc;
  const editWithAI = useCallback(
    (sel: Selection) => {
      const d = editor.doc;
      if (!d) return;
      setPanel("chat");
      if (sel.kind === "block") {
        const f = findBlock(d, sel.id);
        if (f) composer.current?.addBlock({ id: f.block.id, label: blockLabel(f.block, 28), type: f.block.type, text: blockText(f.block) });
      } else if (sel.kind === "section") {
        const f = findSection(d, sel.id);
        if (f) {
          const text = f.section.columns.flatMap((c) => c.blocks.map(blockText)).filter(Boolean).join(" · ");
          composer.current?.addBlock({ id: f.section.id, label: `Section · ${sectionName(f.section, f.index)}`, type: "section", text });
        }
      }
      // The panel mounts or shows first; focus once it is on screen.
      requestAnimationFrame(() => composer.current?.focus());
    },
    [editor.doc],
  );

  // Arriving with ?generate=1 (a new campaign from a prompt or a template): write it once, then drop the flag.
  const kicked = useRef(false);
  useEffect(() => {
    if (kicked.current || params.get("generate") !== "1" || !doc || chat === undefined) return;
    if (campaign.audienceId && audience === undefined) return;
    kicked.current = true;
    const rest = new URLSearchParams(params.toString());
    rest.delete("generate");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname);
    const prompt = campaign.prompt?.trim() || (campaign.templateId ? `Adapt this template to ${brand.name}${audience ? ` and ${audience.name}` : ""}.` : "");
    // A campaign that already has a conversation was generated before (a reload with the flag still on).
    if (!prompt || messages.length) return;
    // The chat panel is open by default, so the merchant watches the email being written.
    void agent.generate(prompt);
  }, [params, doc, chat, campaign, audience, brand.name, router, pathname, messages.length, agent]);

  const go = useCallback(
    (s: Step) => {
      void editor.flush();
      editor.select(null);
      router.push(s === "create" ? pathname : `${pathname}?step=${s}`);
    },
    [editor, router, pathname],
  );

  // Shortcuts on the create step. Typing in a field or in the email keeps its own keys.
  useEffect(() => {
    if (step !== "create") return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = typingTarget(e.target);
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (typing || editor.locked) return;
      const sel = editor.selection;
      const d = editor.doc;
      if (e.key === "Escape") {
        if (previewAs) setPreviewAs(null);
        else editor.select(null);
        return;
      }
      if (!mod && !e.altKey && e.key.toLowerCase() === "v") editor.setTool("select");
      if (!mod && !e.altKey && e.key.toLowerCase() === "h") editor.setTool("hand");
      if (!sel || !d || previewAs) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(editor, sel);
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(editor, d, sel);
        return;
      }
      if (e.key === "Enter" && sel.kind === "block") {
        const f = findBlock(d, sel.id);
        if (f && ["heading", "text", "button", "quote"].includes(f.block.type)) {
          e.preventDefault();
          editor.startEditing(sel.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, editor, previewAs]);

  const env: EditorEnv = {
    brand,
    campaign,
    editor,
    agent,
    theme: (doc ?? serverDoc)?.theme as EmailTheme,
    items: itemList,
    itemMap,
    audience: audience ?? null,
    messages,
    panel,
    setPanel,
    composer,
    editWithAI,
    previewAs,
    setPreviewAs,
  };

  const openPreview = () => {
    void editor.flush();
    setPreviewOpen(true);
  };
  const openTest = () => {
    void editor.flush();
    setTestOpen(true);
  };

  return (
    <EditorProvider value={env}>
      <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-white">
        <ThemeFonts theme={doc?.theme} />
        <TopBar brand={brand} campaign={campaign} step={step} onGo={go} editor={editor} busy={agent.busy} onPreview={openPreview} onTest={openTest} />
        {step === "create" ? (
          doc ? (
            <CreateStep />
          ) : (
            <div className="flex flex-1 items-center justify-center gap-2 bg-canvas text-sm text-muted-foreground">
              <Spinner className="size-4" /> Opening the email
            </div>
          )
        ) : (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas md:rounded-tl-[22px]">
            <ConsolePage className="pt-6">{step === "recipients" ? <RecipientsStep campaign={campaign} brand={brand} /> : <ReviewStep campaign={campaign} brand={brand} />}</ConsolePage>
          </div>
        )}
        <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} campaignId={campaign._id} audienceId={campaign.audienceId} from={senderName(brand)} />
        <TestEmailDialog open={testOpen} onOpenChange={setTestOpen} campaignId={campaign._id} audienceId={campaign.audienceId} beforeSend={editor.flush} />
      </div>
    </EditorProvider>
  );
}

function CreateStep() {
  const { editor } = useEditorEnv();
  return (
    <EditorDnd editor={editor}>
      <div className="flex min-h-0 flex-1">
        <Rail />
        <div className="flex min-h-0 min-w-0 flex-1 gap-2 bg-canvas p-2 md:rounded-tl-[22px]">
          <PanelHost />
          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl ring-1 ring-black/[0.06]">
            <Canvas />
            <Inspector />
          </section>
        </div>
      </div>
    </EditorDnd>
  );
}

/* Sent campaigns -------------------------------------------------------------------- */

function ReportView({ campaign, brand }: { campaign: EmailCampaign; brand: EmailBrand }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-white">
      <header className="flex h-14 shrink-0 items-center gap-3 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <ExitButton brand={brand} />
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <span className="truncate px-2 text-sm font-medium">{campaign.name}</span>
          <Badge tone={CAMPAIGN_STATUS[campaign.status].tone === "ok" ? "neutral" : "outline"}>{CAMPAIGN_STATUS[campaign.status].label}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Eye data-icon="inline-start" /> View email
        </Button>
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas md:rounded-tl-[22px]">
        <ConsolePage className="pt-6">
          <CampaignReport campaign={campaign} brand={brand} />
        </ConsolePage>
      </div>
      <PreviewDialog open={open} onOpenChange={setOpen} campaignId={campaign._id} audienceId={campaign.audienceId} from={senderName(brand)} />
    </div>
  );
}


function ShellSkeleton() {
  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <div className="flex h-14 items-center gap-3 px-3">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-44" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-80 rounded-full" />
        <div className="flex-1" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[76px]" />
        <div className="flex flex-1 gap-2 bg-canvas p-2 md:rounded-tl-[22px]">
          <Skeleton className="h-full w-[420px] rounded-2xl bg-white" />
          <div className="flex flex-1 justify-center rounded-2xl bg-black/[0.03] pt-16">
            <Skeleton className="h-[70%] w-[600px] max-w-full rounded-md bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Close affordance shared by panels. */
export function PanelClose({ onClick, label = "Close panel" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} className="text-neutral-500">
      <X />
    </Button>
  );
}
