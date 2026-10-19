"use client";

import { useId, useState } from "react";
import { ImageOff, Plus, Trash2, X } from "lucide-react";
import type { EmailFont, EmailFooterInfo, EmailKit, EmailSender, SocialNetwork } from "@slice/backend/convex/emailTypes";
import { fontStack, isDark } from "@slice/backend/convex/emailThemes";
import { cn } from "@/lib/utils";
import { FONT_SUGGESTIONS, SANS_FALLBACK, SERIF_FALLBACK, cleanLocal, type BrandDraft } from "@/lib/email/kit";
import { SOCIAL_LABEL } from "@/lib/email/labels";
import { Input, Segmented, Select, Textarea } from "@/components/console/form";
import { AdornedInput, Notice, TokenInput } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EditorField, EditorRow, EditorSection } from "@/components/console/pages/editor-layout";
import { googleFontHref } from "@/components/console/pages/kit-editor";
import { UploadImage } from "./upload-image";

type DraftProps = { draft: BrandDraft; onChange: (draft: BrandDraft) => void };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const COLOR_ROLES: { key: keyof EmailKit["colors"]; label: string; hint: string }[] = [
  { key: "background", label: "Background", hint: "Behind the email" },
  { key: "surface", label: "Surface", hint: "The email body" },
  { key: "foreground", label: "Text", hint: "Headings and body" },
  { key: "primary", label: "Primary", hint: "Buttons and links" },
  { key: "primaryForeground", label: "On primary", hint: "Text on buttons" },
  { key: "accent", label: "Accent", hint: "Bands and coupons" },
  { key: "muted", label: "Muted", hint: "Quiet fills" },
];

function ColorSwatch({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Follow outside changes (a preset, a discard) while the field is not being typed in.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const valid = HEX.test(draft);
  return (
    <div className="flex items-center gap-3 rounded-xl border p-2 pr-3 transition-colors focus-within:border-ring">
      <label className="relative block size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-black/10 ring-inset" style={{ background: valid ? draft : value }}>
        <input
          type="color"
          aria-label={`${label} colour`}
          value={valid && draft.length === 7 ? draft : value.length === 7 ? value : "#000000"}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        </div>
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            if (HEX.test(v)) onChange(v);
          }}
          onBlur={() => !valid && setDraft(value)}
          aria-invalid={!valid}
          aria-label={`${label} hex value`}
          className={cn("num h-5 w-full bg-transparent text-sm text-muted-foreground uppercase outline-none focus:text-foreground", !valid && "text-destructive")}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function FontField({ role, font, sample, onChange }: { role: string; font: EmailFont; sample: string; onChange: (f: EmailFont) => void }) {
  const listId = useId();
  const href = font.google ? googleFontHref([font.family]) : null;
  const serif = font.fallback.includes("serif") && !font.fallback.includes("sans-serif");
  return (
    <div className="overflow-hidden rounded-xl border">
      {href && <link rel="stylesheet" href={href} />}
      <div className="border-b bg-neutral-50 px-4 py-5">
        <div className="text-xs text-muted-foreground">
          {role} ({font.family || "Unset"})
        </div>
        <p className="mt-1 truncate text-2xl leading-tight" style={{ fontFamily: fontStack(font) }}>
          {sample}
        </p>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <EditorField label="Family">
          <Input list={listId} value={font.family} onChange={(e) => onChange({ ...font, family: e.target.value })} />
          <datalist id={listId}>
            {FONT_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </EditorField>
        <EditorField label="Fallback">
          <Segmented
            value={serif ? "serif" : "sans"}
            onChange={(v) => onChange({ ...font, fallback: v === "serif" ? SERIF_FALLBACK : SANS_FALLBACK })}
            options={[
              { value: "sans", label: "Sans" },
              { value: "serif", label: "Serif" },
            ]}
          />
        </EditorField>
        <div className="sm:col-span-2">
          <EditorRow label="Load from Google Fonts" hint="Apple Mail and iPhone show it; Gmail and Outlook use the fallback.">
            <Switch checked={!!font.google} onCheckedChange={(v) => onChange({ ...font, google: v })} />
          </EditorRow>
        </div>
      </div>
    </div>
  );
}

function LogoPreview({ kit, name }: { kit: EmailKit; name: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = kit.logo?.src;
  const dark = !!kit.logo?.onDark;
  return (
    <div className="flex h-28 items-center justify-center rounded-xl px-8 ring-1 ring-black/10" style={{ background: dark ? kit.colors.foreground : kit.colors.surface }}>
      {src && broken !== src ? (
        // Merchant logos live on arbitrary hosts; next/image would need every one allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={kit.logo?.alt ?? name} className="max-h-14 max-w-full object-contain" onError={() => setBroken(src)} />
      ) : src ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageOff className="size-4" /> The logo did not load
        </span>
      ) : (
        <span className="truncate text-2xl font-semibold" style={{ color: dark ? kit.colors.background : kit.colors.foreground, fontFamily: fontStack(kit.fonts.heading) }}>
          {kit.wordmark || name}
        </span>
      )}
    </div>
  );
}

/** The light logo on the kit's text colour (when that is dark), as a dark section would show it. */
function LightLogoPreview({ src, background }: { src?: string; background: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span className="flex h-9 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg px-2 ring-1 ring-black/10" style={{ background }}>
      {src && broken !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="max-h-6 max-w-full object-contain" onError={() => setBroken(src)} />
      ) : (
        <ImageOff className="size-4 text-white/60" />
      )}
    </span>
  );
}

function IconPreview({ src }: { src?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-neutral-50">
      {src && broken !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-6 object-contain" onError={() => setBroken(src)} />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}

/** Name, logo, colours, type and shape. Controlled: the parent owns the draft and saves it. */
export function IdentityEditor({ draft, onChange }: DraftProps) {
  const { kit } = draft;
  const set = <K extends keyof EmailKit>(key: K, value: EmailKit[K]) => onChange({ ...draft, kit: { ...kit, [key]: value } });
  const setLogo = (src: string | undefined) => set("logo", src ? { ...kit.logo, src, alt: kit.logo?.alt || draft.name } : undefined);
  const setLight = (light: string | undefined) => kit.logo && set("logo", { ...kit.logo, light });
  return (
    <div>
      <EditorSection title="Name" description="How the brand signs its emails and appears in the console.">
        <Input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Stackhouse Books" />
      </EditorSection>

      <EditorSection title="Logo" description="Sits at the top of every email. Upload a PNG or SVG, or paste the address of one.">
        <LogoPreview kit={kit} name={draft.name} />
        <div className="flex flex-wrap items-start gap-2">
          <UploadImage label={kit.logo?.src ? "Replace logo" : "Upload logo"} onUploaded={setLogo} />
          {kit.logo?.src && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(undefined)}>
              <X data-icon="inline-start" /> Remove
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <EditorField label="Logo address" aside="Optional">
            <Input value={kit.logo?.src ?? ""} placeholder="https://…/logo.png" onChange={(e) => setLogo(e.target.value || undefined)} />
          </EditorField>
          <EditorField label="Wordmark" aside="Optional" hint="Set in the heading font when there is no logo image.">
            <Input value={kit.wordmark ?? ""} placeholder={draft.name} onChange={(e) => set("wordmark", e.target.value || undefined)} />
          </EditorField>
          {kit.logo && !kit.logo.onDark && (
            <EditorField
              label="Light version"
              aside="Optional"
              hint="A white or reversed logo for dark sections, such as a coloured header. Without one, a dark logo can disappear there."
              className="sm:col-span-2"
            >
              <div className="flex items-center gap-2">
                <LightLogoPreview src={kit.logo.light} background={isDark(kit.colors.foreground) ? kit.colors.foreground : "#171717"} />
                <Input value={kit.logo.light ?? ""} placeholder="https://…/logo-light.png" onChange={(e) => setLight(e.target.value || undefined)} />
                <UploadImage label="Upload" onUploaded={setLight} />
              </div>
            </EditorField>
          )}
          <EditorField label="Icon" aside="Optional" hint="A square mark for small tiles in Slice." className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <IconPreview src={kit.icon} />
              <Input value={kit.icon ?? ""} placeholder="https://…/icon.png" onChange={(e) => set("icon", e.target.value || undefined)} />
              <UploadImage label="Upload" onUploaded={(url) => set("icon", url)} />
            </div>
          </EditorField>
        </div>
        <EditorRow label="Light logo" hint="The mark is light and needs the text colour behind it.">
          <Switch checked={!!kit.logo?.onDark} onCheckedChange={(v) => kit.logo && set("logo", { ...kit.logo, onDark: v })} disabled={!kit.logo} />
        </EditorRow>
      </EditorSection>

      <EditorSection title="Colours" description="Seven roles every email draws from. Click a swatch or type a hex value.">
        <div className="grid gap-2 sm:grid-cols-2">
          {COLOR_ROLES.map((r) => (
            <ColorSwatch key={r.key} label={r.label} hint={r.hint} value={kit.colors[r.key]} onChange={(hex) => set("colors", { ...kit.colors, [r.key]: hex })} />
          ))}
        </div>
      </EditorSection>

      <EditorSection title="Typography" description="Headings and body text. Email clients without web fonts use the fallback.">
        <FontField role="Headings" font={kit.fonts.heading} sample={draft.name || "Your brand"} onChange={(f) => set("fonts", { ...kit.fonts, heading: f })} />
        <FontField role="Body" font={kit.fonts.body} sample="New this week, picked for you" onChange={(f) => set("fonts", { ...kit.fonts, body: f })} />
      </EditorSection>

      <EditorSection title="Shape" description="Buttons, corners and labels. The preview shows each change.">
        <div className="divide-y rounded-xl border">
          <div className="p-3">
            <EditorRow label="Buttons" hint="The shape of every call to action.">
              <Segmented
                value={kit.buttonStyle}
                onChange={(v) => set("buttonStyle", v)}
                options={[
                  { value: "pill", label: "Pill" },
                  { value: "rounded", label: "Rounded" },
                  { value: "square", label: "Square" },
                ]}
              />
            </EditorRow>
          </div>
          <div className="p-3">
            <EditorRow label="Corners" hint="Images and cards.">
              <Segmented
                value={kit.radius}
                onChange={(v) => set("radius", v)}
                options={[
                  { value: "none", label: "None" },
                  { value: "sm", label: "Small" },
                  { value: "md", label: "Medium" },
                  { value: "lg", label: "Large" },
                ]}
              />
            </EditorRow>
          </div>
          <div className="p-3">
            <EditorRow label="Capitalised buttons" hint="Button labels in capitals, as some brands set them.">
              <Switch checked={kit.uppercaseLabels} onCheckedChange={(v) => set("uppercaseLabels", v)} />
            </EditorRow>
          </div>
        </div>
      </EditorSection>
    </div>
  );
}

/** How the brand sounds. The builder writes every subject line and paragraph to this. */
export function VoiceEditor({ draft, onChange }: DraftProps) {
  const voice = draft.kit.voice;
  const set = (v: EmailKit["voice"]) => onChange({ ...draft, kit: { ...draft.kit, voice: v } });
  return (
    <div>
      <EditorSection title="Voice" description="A sentence or two the builder reads before it writes anything.">
        <Textarea rows={3} value={voice.summary} placeholder="Warm and bookish; a friend behind the counter who has read everything." onChange={(e) => set({ ...voice, summary: e.target.value })} />
      </EditorSection>
      <EditorSection title="Do" description="Habits worth keeping.">
        <TokenInput values={voice.do} onChange={(v) => set({ ...voice, do: v })} placeholder="Name the book, then say why" />
      </EditorSection>
      <EditorSection title="Avoid" description="What the brand never sounds like.">
        <TokenInput values={voice.avoid} onChange={(v) => set({ ...voice, avoid: v })} placeholder="Exclamation marks" />
      </EditorSection>
    </div>
  );
}

/** What the business does and for whom. */
export function AboutEditor({ draft, onChange }: DraftProps) {
  const about = draft.about;
  const set = (patch: Partial<typeof about>) => onChange({ ...draft, about: { ...about, ...patch } });
  return (
    <div>
      <EditorSection title="What you do" description="One paragraph: what the business is and sells.">
        <Textarea rows={4} value={about.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="An independent bookshop in Brooklyn with…" />
      </EditorSection>
      <EditorSection title="Who it's for" description="The people you sell to, in your own words.">
        <Textarea rows={2} value={about.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Neighbourhood readers, book clubs, gift buyers" />
      </EditorSection>
      <EditorSection title="Categories" description="What the catalog is made of. Picks and sections lean on these.">
        <TokenInput values={about.categories} onChange={(v) => set({ categories: v })} placeholder="Literary fiction" />
      </EditorSection>
      <EditorSection title="Location" description="City or area, when the business is local. Events and copy can mention it.">
        <Input value={about.location ?? ""} onChange={(e) => set({ location: e.target.value || undefined })} placeholder="Brooklyn, NY" />
      </EditorSection>
    </div>
  );
}

const NETWORKS = Object.keys(SOCIAL_LABEL) as SocialNetwork[];

/** The details every email's footer carries. */
export function FooterEditor({ draft, onChange }: DraftProps) {
  const footer = draft.footer;
  const set = (patch: Partial<EmailFooterInfo>) => onChange({ ...draft, footer: { ...footer, ...patch } });
  const setSocial = (i: number, patch: Partial<EmailFooterInfo["socials"][number]>) => set({ socials: footer.socials.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const unused = NETWORKS.find((n) => !footer.socials.some((s) => s.network === n)) ?? "website";
  return (
    <div>
      <EditorSection title="Postal address" description="Anti-spam law in most places asks for one in every marketing email.">
        <Textarea rows={2} value={footer.address} onChange={(e) => set({ address: e.target.value })} placeholder="214 Smith Street, Brooklyn, NY 11201" />
        {!footer.address.trim() && <Notice tone="warn">Campaigns can&apos;t be sent without an address in the footer.</Notice>}
      </EditorSection>
      <EditorSection title="Website" description="Linked from the footer and the logo.">
        <Input value={footer.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" inputMode="url" />
      </EditorSection>
      <EditorSection title="Social links" description="Shown as small icons in the footer and in social blocks.">
        {footer.socials.length > 0 && (
          <ul className="space-y-2">
            {footer.socials.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <Select className="w-36" value={s.network} onChange={(e) => setSocial(i, { network: e.target.value as SocialNetwork })} aria-label="Network">
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {SOCIAL_LABEL[n]}
                    </option>
                  ))}
                </Select>
                <Input value={s.url} onChange={(e) => setSocial(i, { url: e.target.value })} placeholder="https://" inputMode="url" aria-label={`${SOCIAL_LABEL[s.network]} link`} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove link" onClick={() => set({ socials: footer.socials.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => set({ socials: [...footer.socials, { network: unused, url: "" }] })}>
          <Plus data-icon="inline-start" /> Add a link
        </Button>
      </EditorSection>
    </div>
  );
}

/** From name, the address's local part and where replies go. Also used on the Sending screen. */
export function SenderFields({
  sender,
  domain,
  onChange,
  className,
}: {
  sender: EmailSender;
  domain: string;
  onChange: (sender: EmailSender) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-5", className)}>
      <EditorField label="From name" hint="What the inbox shows before the subject. Usually the brand, sometimes a person at it.">
        <Input value={sender.fromName} onChange={(e) => onChange({ ...sender, fromName: e.target.value })} placeholder="Stackhouse Books" />
      </EditorField>
      <EditorField label="From address" hint="Mail goes out from this address once the domain is verified.">
        <AdornedInput
          className="h-8"
          suffix={`@${domain}`}
          value={sender.fromLocal}
          onChange={(e) => onChange({ ...sender, fromLocal: cleanLocal(e.target.value) })}
          placeholder="hello"
          spellCheck={false}
        />
      </EditorField>
      <EditorField label="Reply-to" aside="Optional" hint="Your real inbox, where answers to a campaign should land.">
        <Input type="email" value={sender.replyTo ?? ""} onChange={(e) => onChange({ ...sender, replyTo: e.target.value || undefined })} placeholder="you@yourshop.com" />
      </EditorField>
    </div>
  );
}

export function SenderEditor({ draft, onChange, domain }: DraftProps & { domain: string }) {
  return (
    <div>
      <EditorSection title="Sender" description="Who your campaigns come from. You can connect your domain on the Sending screen once the brand is set up.">
        <SenderFields sender={draft.sender} domain={domain} onChange={(sender) => onChange({ ...draft, sender })} />
      </EditorSection>
    </div>
  );
}
