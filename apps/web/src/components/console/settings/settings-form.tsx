"use client";

import { useState, type ReactNode } from "react";
import { Check, Download, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/console/primitives";
import { Card } from "@/components/ui/card";
import {
  Field,
  Input,
  Segmented,
  SettingRow,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
} from "@/components/console/form";
import type { Invite, Member, Role } from "@/lib/mock/team";
import { cn } from "@/lib/utils";
import { ApiKeys, type KeyInfo } from "./api-keys";
import { ConfirmDialog } from "./confirm-dialog";
import { OptionSelect } from "./option-select";
import { SectionBody, SectionRows, SettingsSection } from "./section";
import { Invites, TeamTable } from "./team";

export interface SettingsValues {
  name: string;
  domain: string;
  live: boolean;
  timezone: string;
  description: string;
  vertical: string;
  pricing: "value" | "mid" | "premium" | "luxury";
  voice: string;
  voiceNotes: string;
  conciergeName: string;
  greeting: string;
  persona: string;
  recsPerReply: "2" | "3" | "4" | "5";
  guardrails: {
    inStock: boolean;
    budget: boolean;
    salePrices: boolean;
    pairings: boolean;
    handoff: boolean;
  };
  sources: {
    questionnaire: boolean;
    chat: boolean;
    city: boolean;
    page: boolean;
  };
  retention: "30" | "90" | "365";
  roles: Record<string, Role>;
}

export interface SettingsContext {
  widgetId: string;
  inSetup: boolean;
  keys: KeyInfo;
  members: Member[];
  invites: Invite[];
}

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Berlin",
  "Asia/Seoul",
  "Asia/Tokyo",
  "UTC",
];

const VERTICALS = [
  "Home & living",
  "Fashion & lifestyle",
  "Food & drink",
  "Beauty & wellness",
  "Books & media",
  "Outdoor & sport",
  "Other",
];

const TABS = [
  ["general", "General"],
  ["store", "Store profile"],
  ["concierge", "Concierge"],
  ["data", "Data & privacy"],
  ["keys", "API keys"],
  ["team", "Team"],
  ["danger", "Danger zone"],
] as const;

/** Like Field, but a div: a <label> around a radiogroup would click its first option. */
function FieldGroup({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("space-y-2", className)}>
      <div className="text-sm font-medium">{label}</div>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function changedCount(a: SettingsValues, b: SettingsValues) {
  return (Object.keys(a) as (keyof SettingsValues)[]).filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  ).length;
}

export function SettingsForm({
  initial,
  context,
}: {
  initial: SettingsValues;
  context: SettingsContext;
}) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [justSaved, setJustSaved] = useState(false);
  const [exported, setExported] = useState(false);
  const changes = changedCount(form, saved);

  const set = <K extends keyof SettingsValues>(
    key: K,
    value: SettingsValues[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  const setGuard = (key: keyof SettingsValues["guardrails"], value: boolean) =>
    setForm((f) => ({ ...f, guardrails: { ...f.guardrails, [key]: value } }));
  const setSource = (key: keyof SettingsValues["sources"], value: boolean) =>
    setForm((f) => ({ ...f, sources: { ...f.sources, [key]: value } }));

  const save = () => {
    setSaved(form);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  };

  return (
    <>
      <Tabs defaultValue="general">
        <TabList className="overflow-x-auto">
          {TABS.map(([value, label]) => (
            <Tab
              key={value}
              value={value}
              className={cn(
                value === "danger" &&
                  "text-destructive/80 hover:text-destructive data-active:text-destructive",
              )}
            >
              {label}
            </Tab>
          ))}
        </TabList>

        {/* General ------------------------------------------------------- */}
        <TabPanel value="general">
          <SettingsSection
            title="Widget"
            description="How this widget appears in the console and where it's allowed to load."
          >
            <SectionBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Widget name">
                  <Input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field
                  label="Domain"
                  hint="The embed only loads on this domain and its subdomains."
                >
                  <div className="flex">
                    <span className="flex h-8 items-center rounded-l-lg border border-r-0 border-input bg-muted px-2.5 text-sm text-muted-foreground">
                      https://
                    </span>
                    <Input
                      value={form.domain}
                      onChange={(e) => set("domain", e.target.value)}
                      className="rounded-l-none"
                    />
                  </div>
                </Field>
              </div>
              <Field
                label="Widget ID"
                hint="Used in the embed snippet and API calls."
              >
                <Input
                  value={context.widgetId}
                  readOnly
                  className="bg-muted/50 text-muted-foreground"
                />
              </Field>
            </SectionBody>
          </SettingsSection>

          <SettingsSection
            title="Status"
            description="Pausing hides the concierge on your store immediately. Conversations and settings are kept."
          >
            <SectionRows>
              <SettingRow
                title={
                  <span className="flex items-center gap-2">
                    Concierge is{" "}
                    {form.live
                      ? "live"
                      : context.inSetup
                        ? "in setup"
                        : "paused"}
                    <Badge
                      tone={
                        form.live ? "ok" : context.inSetup ? "neutral" : "warn"
                      }
                    >
                      {form.live
                        ? "Live"
                        : context.inSetup
                          ? "Setup"
                          : "Paused"}
                    </Badge>
                  </span>
                }
                description={
                  context.inSetup
                    ? "Finish setup to take the concierge live."
                    : form.live
                      ? "Shoppers on your store can open the concierge."
                      : "The launcher is hidden. Existing links to the concierge show a closed state."
                }
              >
                <Switch
                  checked={form.live}
                  disabled={context.inSetup}
                  onCheckedChange={(v) => set("live", v)}
                  aria-label="Concierge live"
                />
              </SettingRow>
            </SectionRows>
          </SettingsSection>

          <SettingsSection
            title="Time zone"
            description="Daily metrics and the signal log roll over at midnight in this zone."
          >
            <SectionBody>
              <FieldGroup label="Reporting time zone" className="max-w-xs">
                <OptionSelect
                  aria-label="Reporting time zone"
                  value={form.timezone}
                  onChange={(v) => set("timezone", v)}
                  options={TIMEZONES.map((tz) => ({
                    value: tz,
                    label: tz.replace("_", " "),
                  }))}
                />
              </FieldGroup>
            </SectionBody>
          </SettingsSection>
        </TabPanel>

        {/* Store profile -------------------------------------------------- */}
        <TabPanel value="store">
          <SettingsSection
            title="About the store"
            description="The concierge reads this before every conversation. Write it the way you'd brief a new shop assistant."
          >
            <SectionBody>
              <Field
                label="Store description"
                hint={
                  <span className="num">
                    {form.description.length} / 600 characters
                  </span>
                }
              >
                <Textarea
                  value={form.description}
                  maxLength={600}
                  onChange={(e) => set("description", e.target.value)}
                  className="min-h-28"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup label="Vertical">
                  <OptionSelect
                    aria-label="Vertical"
                    value={form.vertical}
                    onChange={(v) => set("vertical", v)}
                    options={VERTICALS.map((v) => ({ value: v, label: v }))}
                  />
                </FieldGroup>
                <FieldGroup label="Price positioning">
                  <Segmented
                    size="md"
                    className="flex w-full [&>button]:flex-1"
                    value={form.pricing}
                    onChange={(v) => set("pricing", v)}
                    options={[
                      { value: "value", label: "Value" },
                      { value: "mid", label: "Mid" },
                      { value: "premium", label: "Premium" },
                      { value: "luxury", label: "Luxury" },
                    ]}
                  />
                </FieldGroup>
              </div>
            </SectionBody>
          </SettingsSection>

          <SettingsSection
            title="Voice"
            description="Sets the tone of every reply. The concierge never claims anything your catalog doesn't say."
          >
            <SectionBody>
              <FieldGroup label="Brand voice" className="max-w-sm">
                <OptionSelect
                  aria-label="Brand voice"
                  value={form.voice}
                  onChange={(v) => set("voice", v)}
                  options={[
                    { value: "warm", label: "Warm and editorial" },
                    { value: "expert", label: "Crisp and expert" },
                    { value: "playful", label: "Playful and casual" },
                    { value: "minimal", label: "Minimal and direct" },
                  ]}
                />
              </FieldGroup>
              <Field
                label="Voice notes"
                optional
                hint="Words to use or avoid, house spellings, things you never say."
              >
                <Textarea
                  value={form.voiceNotes}
                  onChange={(e) => set("voiceNotes", e.target.value)}
                  placeholder="Say “sofa”, never “couch”. No exclamation marks."
                  className="min-h-20"
                />
              </Field>
            </SectionBody>
          </SettingsSection>
        </TabPanel>

        {/* Concierge ------------------------------------------------------ */}
        <TabPanel value="concierge">
          <SettingsSection
            title="Identity"
            description="What shoppers see when they open the concierge."
          >
            <SectionBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Concierge name">
                  <Input
                    value={form.conciergeName}
                    onChange={(e) => set("conciergeName", e.target.value)}
                  />
                </Field>
                <FieldGroup label="Persona">
                  <OptionSelect
                    aria-label="Persona"
                    value={form.persona}
                    onChange={(v) => set("persona", v)}
                    options={[
                      { value: "friend", label: "Well-read friend" },
                      { value: "curator", label: "Expert curator" },
                      { value: "helper", label: "Concise helper" },
                    ]}
                  />
                </FieldGroup>
              </div>
              <Field
                label="Greeting"
                hint="First message, shown above the taste questionnaire."
              >
                <Textarea
                  value={form.greeting}
                  onChange={(e) => set("greeting", e.target.value)}
                  className="min-h-20"
                />
              </Field>
              <FieldGroup
                label="Recommendations per reply"
                hint="More picks give shoppers range; fewer keep replies short on mobile."
              >
                <Segmented
                  size="md"
                  value={form.recsPerReply}
                  onChange={(v) => set("recsPerReply", v)}
                  options={["2", "3", "4", "5"].map((n) => ({
                    value: n as SettingsValues["recsPerReply"],
                    label: <span className="num px-1">{n}</span>,
                  }))}
                />
              </FieldGroup>
            </SectionBody>
          </SettingsSection>

          <SettingsSection
            title="Guardrails"
            description="Checked on every reply before it reaches the shopper. Failures show up in the signal log."
          >
            <SectionRows>
              <SettingRow
                title="Only recommend in-stock products"
                description="Hides products with no variant in stock."
              >
                <Switch
                  checked={form.guardrails.inStock}
                  onCheckedChange={(v) => setGuard("inStock", v)}
                />
              </SettingRow>
              <SettingRow
                title="Respect a stated budget"
                description="If a shopper names a budget, nothing over it is recommended."
              >
                <Switch
                  checked={form.guardrails.budget}
                  onCheckedChange={(v) => setGuard("budget", v)}
                />
              </SettingRow>
              <SettingRow
                title={
                  <span className="flex items-center gap-1.5">
                    Ground every claim in the catalog
                    <Lock className="size-4 text-muted-foreground" />
                  </span>
                }
                description="Materials, dimensions and care come from your product data only. Always on."
              >
                <Switch checked disabled aria-label="Always on" />
              </SettingRow>
              <SettingRow
                title="Mention sale prices"
                description="Point out when a pick is marked down."
              >
                <Switch
                  checked={form.guardrails.salePrices}
                  onCheckedChange={(v) => setGuard("salePrices", v)}
                />
              </SettingRow>
              <SettingRow
                title="Suggest pairings across categories"
                description="Allow one pick outside the category the shopper asked for."
              >
                <Switch
                  checked={form.guardrails.pairings}
                  onCheckedChange={(v) => setGuard("pairings", v)}
                />
              </SettingRow>
              <SettingRow
                title="Hand off to support on request"
                description="Shows your support link when a shopper asks for a person, an order or a return."
              >
                <Switch
                  checked={form.guardrails.handoff}
                  onCheckedChange={(v) => setGuard("handoff", v)}
                />
              </SettingRow>
            </SectionRows>
          </SettingsSection>
        </TabPanel>

        {/* Data & privacy ------------------------------------------------- */}
        <TabPanel value="data">
          <SettingsSection
            title="Signal sources"
            description="What the concierge may use to build a shopper's taste profile. Turning a source off applies to new conversations."
          >
            <SectionRows>
              <SettingRow
                title="Taste questionnaire"
                description="Artists, shows, films and places the shopper picks before chatting."
              >
                <Switch
                  checked={form.sources.questionnaire}
                  onCheckedChange={(v) => setSource("questionnaire", v)}
                />
              </SettingRow>
              <SettingRow
                title="Chat mentions"
                description="Names the shopper mentions in conversation, resolved through Qloo."
              >
                <Switch
                  checked={form.sources.chat}
                  onCheckedChange={(v) => setSource("chat", v)}
                />
              </SettingRow>
              <SettingRow
                title="Approximate city"
                description="City-level location from the request, used to localize questionnaire options. Never stored as an IP."
              >
                <Switch
                  checked={form.sources.city}
                  onCheckedChange={(v) => setSource("city", v)}
                />
              </SettingRow>
              <SettingRow
                title="Page context"
                description="The page the concierge was opened on and the referring site."
              >
                <Switch
                  checked={form.sources.page}
                  onCheckedChange={(v) => setSource("page", v)}
                />
              </SettingRow>
            </SectionRows>
          </SettingsSection>

          <SettingsSection
            title="Retention"
            description="Conversations and taste profiles older than this are deleted. Aggregates on Taste insights are kept."
          >
            <SectionBody>
              <div className="flex gap-3 rounded-lg border bg-muted/50 p-3">
                <ShieldCheck className="mt-0.5 size-4 flex-none text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    No PII stored.
                  </span>{" "}
                  Slice keeps an anonymous shopper ID, a city and the taste
                  signals above. No names, emails, IP addresses or payment
                  details.
                </p>
              </div>
              <FieldGroup label="Keep conversations for" className="max-w-xs">
                <OptionSelect<SettingsValues["retention"]>
                  aria-label="Keep conversations for"
                  value={form.retention}
                  onChange={(v) => set("retention", v)}
                  options={[
                    { value: "30", label: "30 days" },
                    { value: "90", label: "90 days" },
                    { value: "365", label: "365 days" },
                  ]}
                />
              </FieldGroup>
            </SectionBody>
          </SettingsSection>

          <SettingsSection
            title="Export"
            description="Download every conversation with its taste profile and outcome."
          >
            <SectionRows>
              <SettingRow
                title="Conversations"
                description={
                  exported
                    ? "Export queued. It will appear here when ready, usually within a minute."
                    : "CSV with one row per conversation: shopper city, taste tags, styles, picks and outcome."
                }
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exported}
                  onClick={() => setExported(true)}
                >
                  <Download />
                  {exported ? "Queued" : "Export CSV"}
                </Button>
              </SettingRow>
            </SectionRows>
          </SettingsSection>
        </TabPanel>

        {/* API keys ------------------------------------------------------- */}
        <TabPanel value="keys">
          <SettingsSection
            title="API keys"
            description="Keys for this widget. Rotating takes effect immediately and doesn't need saving."
          >
            <ApiKeys keys={context.keys} />
          </SettingsSection>
        </TabPanel>

        {/* Team ----------------------------------------------------------- */}
        <TabPanel value="team">
          <SettingsSection
            title="Members"
            description="Everyone in the workspace can see every widget. Roles decide what they can change."
          >
            <TeamTable
              members={context.members}
              roles={form.roles}
              onRoleChange={(id, role) =>
                setForm((f) => ({ ...f, roles: { ...f.roles, [id]: role } }))
              }
            />
          </SettingsSection>
          <SettingsSection
            title="Invite"
            description="Invites expire after 7 days."
          >
            <Invites initial={context.invites} />
          </SettingsSection>
        </TabPanel>

        {/* Danger zone ---------------------------------------------------- */}
        <TabPanel value="danger">
          <SettingsSection
            title="Danger zone"
            description="Actions that change what shoppers see or remove data for good."
            cardClassName="ring-destructive/30"
          >
            <div className="divide-y">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="max-w-lg space-y-0.5">
                  <div className="text-sm font-medium">
                    {form.live ? "Pause this widget" : "Resume this widget"}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {form.live
                      ? "Hides the concierge on your store right away. Settings, catalog and history stay."
                      : "Shows the concierge on your store again."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={context.inSetup}
                  onClick={() => set("live", !form.live)}
                >
                  {form.live ? "Pause widget" : "Resume widget"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="max-w-lg space-y-0.5">
                  <div className="text-sm font-medium">Delete this widget</div>
                  <p className="text-sm text-muted-foreground">
                    Permanently removes the widget, its conversations, taste
                    profiles and keys. The embed stops loading. This can&rsquo;t
                    be undone.
                  </p>
                </div>
                <ConfirmDialog
                  trigger={<Button variant="destructive">Delete widget</Button>}
                  title={`Delete ${saved.name}?`}
                  description="Every conversation, taste profile and API key for this widget is deleted, and the embed stops loading on your store. This can't be undone."
                  actionLabel="Delete permanently"
                  confirmText={context.widgetId}
                  onConfirm={() => {}}
                />
              </div>
            </div>
          </SettingsSection>
        </TabPanel>
      </Tabs>

      {(changes > 0 || justSaved) && (
        <div className="pointer-events-none sticky bottom-6 z-20 mt-6 flex justify-center">
          <Card
            role="status"
            size="sm"
            className="pointer-events-auto flex-row items-center gap-3 px-3 shadow-sm"
          >
            {changes > 0 ? (
              <>
                <span className="pl-1 text-sm">
                  {changes === 1
                    ? "1 unsaved change"
                    : `${changes} unsaved changes`}
                </span>
                <Button variant="ghost" onClick={() => setForm(saved)}>
                  Discard
                </Button>
                <Button onClick={save}>Save changes</Button>
              </>
            ) : (
              <span className="flex items-center gap-2 px-1 text-sm">
                <Check className="size-4 text-emerald-600" />
                Changes saved
              </span>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
