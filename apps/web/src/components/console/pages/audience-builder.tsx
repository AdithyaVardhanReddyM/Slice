"use client";

import { useAction, useMutation } from "convex/react";
import {
  ArrowUp,
  BookOpen,
  Cake,
  Clapperboard,
  Compass,
  Disc3,
  Gamepad2,
  MapPin,
  MessageSquareText,
  Music,
  Plus,
  Search,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { SEGMENT_FAMILIES, SEGMENTS } from "@slice/backend/convex/pagesSegments";
import { cn } from "@/lib/utils";
import {
  AGE_BANDS,
  ENTITY_CONDITIONS,
  agesPhrase,
  autoName,
  conditionOf,
  describe,
  emptyDefinition,
  entitiesIn,
  filled,
  fromAudience,
  kindFor,
  toSources,
  type ConditionKey,
  type Definition,
  type PickedEntity,
  type PickedSegment,
  type PickedTag,
} from "@/lib/pages/definition";
import { postJson } from "@/lib/pages/stream";
import { AGE_LABEL, AUDIENCE_KIND_LABEL, type Audience } from "@/lib/pages/types";
import { Chip, Segmented } from "@/components/console/form";
import { AdornedInput, Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrand } from "./brand-context";
import { CityAutocomplete, CityMap, searchCities, type City } from "./city-picker";
import { InterestPicker } from "./interest-picker";
import { EntityStrip } from "./shared";
import { KIND_ICON, TasteCover } from "./taste-cover";
import { useCompileAudience } from "./use-compile-audience";

/* Conditions ------------------------------------------------------------------- */

type ConditionMeta = {
  key: ConditionKey;
  icon: LucideIcon;
  add: string;
  title: string;
  /** One line on the empty state's tile. */
  blurb: string;
  placeholder?: string;
  hint?: string;
  showType?: boolean;
};

export const CONDITIONS: ConditionMeta[] = [
  { key: "location", icon: MapPin, add: "Place", title: "Live in", blurb: "Where they live", hint: "Qloo reads what people in this city listen to, watch and buy." },
  { key: "age", icon: Cake, add: "Age", title: "Are aged", blurb: "A band or a range", hint: "Pick one band, or several next to each other for a wider range." },
  { key: "gender", icon: Users, add: "Gender", title: "Are", blurb: "Women or men" },
  { key: "brand", icon: ShoppingBag, add: "Brands", title: "Love brands like", blurb: "What they buy", placeholder: "Search brands" },
  { key: "listen", icon: Music, add: "Music", title: "Listen to", blurb: "Artists, podcasts", placeholder: "Search artists and podcasts", showType: true },
  { key: "watch", icon: Clapperboard, add: "Films and TV", title: "Watch", blurb: "What they watch", placeholder: "Search films and shows", showType: true },
  { key: "read", icon: BookOpen, add: "Books", title: "Read", blurb: "What they read", placeholder: "Search books" },
  { key: "go", icon: UtensilsCrossed, add: "Places", title: "Go to", blurb: "Venues and trips", placeholder: "Search restaurants, venues, destinations", showType: true },
  { key: "play", icon: Gamepad2, add: "Games", title: "Play", blurb: "What they play", placeholder: "Search video games" },
  { key: "lifestyle", icon: Compass, add: "Lifestyle", title: "Are in the segments", blurb: "Hobbies, life stage", hint: "Qloo's lifestyle segments: hobbies, life stage, spending, causes and work." },
  { key: "genre", icon: Disc3, add: "Genres", title: "Like the genres", blurb: "Music and film", placeholder: "Search genres, like indie rock or film noir" },
];

export const CONDITION_BY_KEY = Object.fromEntries(CONDITIONS.map((c) => [c.key, c])) as Record<ConditionKey, ConditionMeta>;

/** Starting rows for the shortcuts in the source picker. */
export const PRESET_ROWS: Record<string, ConditionKey[]> = {
  custom: [],
  location: ["location"],
  demographic: ["age", "gender"],
  interests: ["brand", "listen"],
};

/** "2211 NE Alberta St, Portland, OR 97211" → "Portland"; "Lisbon, Portugal" → "Lisbon". */
function cityOf(location: string | undefined): string {
  if (!location) return "";
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  const pick = parts.length >= 3 ? parts[parts.length - 2] : (parts[0] ?? "");
  return /\d/.test(pick) ? "" : pick;
}

function ConditionCard({
  meta,
  onRemove,
  children,
  footer,
  reveal,
}: {
  meta: ConditionMeta;
  onRemove: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Just added: bring it into view, with room below for its suggestions. */
  reveal?: boolean;
}) {
  const Icon = meta.icon;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reveal) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [reveal]);
  return (
    <section ref={ref} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <header className="mb-3 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4" />
        </span>
        <h3 className="text-sm font-medium">{meta.title}</h3>
        <button
          type="button"
          aria-label={`Remove ${meta.add.toLowerCase()}`}
          onClick={onRemove}
          className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>
      {children}
      {(footer ?? meta.hint) && <div className="mt-2.5 text-xs text-muted-foreground">{footer ?? meta.hint}</div>}
    </section>
  );
}

/** The "and" between two conditions, on a line through the icons. */
function And() {
  return (
    <div className="relative flex h-8 w-[60px] items-center justify-center" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/15" />
      <span className="relative rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-xs ring-1 ring-foreground/10">and</span>
    </div>
  );
}

function LocationCondition({ def, set, autoFocus }: { def: Definition; set: (patch: Partial<Definition>) => void; autoFocus: boolean }) {
  const [picked, setPicked] = useState<City | null>(null);
  // A city that came prefilled (an edit, the brand's own city) gets its pin.
  const initial = useRef(def.city);
  useEffect(() => {
    if (!initial.current) return;
    const ctrl = new AbortController();
    searchCities(initial.current, ctrl.signal)
      .then(([first]) => {
        if (!first) return;
        setPicked(first);
        if (!def.country) set({ country: first.country });
      })
      .catch(() => undefined);
    return () => ctrl.abort();
    // Only for the city it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-3">
      <CityAutocomplete
        value={def.city}
        autoFocus={autoFocus}
        onChange={(text) => {
          set({ city: text, country: "" });
          setPicked(null);
        }}
        onSelect={(c) => {
          set({ city: c.name, country: c.country });
          setPicked(c);
        }}
      />
      {picked && <CityMap city={picked} className="aspect-[16/5]" />}
    </div>
  );
}

function SegmentCondition({ def, set }: { def: Definition; set: (patch: Partial<Definition>) => void }) {
  const [query, setQuery] = useState("");
  const chosen = new Set(def.segments.map((s) => s.id));
  const q = query.trim().toLowerCase();
  const toggle = (s: { id: string; name: string }) =>
    set({ segments: chosen.has(s.id) ? def.segments.filter((x) => x.id !== s.id) : [...def.segments, { id: s.id, name: s.name }] });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {def.segments.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1.5 pl-3 text-sm font-medium">
          {s.name}
          <button
            type="button"
            aria-label={`Remove ${s.name}`}
            onClick={() => toggle(s)}
            className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <Plus data-icon="inline-start" /> {def.segments.length ? "Add a segment" : "Choose segments"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] gap-0 p-0">
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search segments"
              autoFocus
              className="h-8 w-full rounded-md bg-transparent pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto p-3">
            {SEGMENT_FAMILIES.map((f) => {
              const items = SEGMENTS.filter((s) => s.family === f.key && (!q || s.name.toLowerCase().includes(q)));
              if (!items.length) return null;
              return (
                <div key={f.key} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((s) => (
                      <Chip key={s.id} selected={chosen.has(s.id)} onClick={() => toggle(s)} className="h-7 px-2.5 text-xs">
                        {s.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              );
            })}
            {q && !SEGMENTS.some((s) => s.name.toLowerCase().includes(q)) && <p className="px-1 py-2 text-sm text-muted-foreground">No segment matches “{query}”.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// The add-condition buttons, grouped the way a marketer describes people.
const CONDITION_GROUPS: { label: string; keys: ConditionKey[] }[] = [
  { label: "Who they are", keys: ["location", "age", "gender"] },
  { label: "What they love", keys: ["brand", "listen", "watch", "read", "go", "play"] },
  { label: "Lifestyle and taste", keys: ["lifestyle", "genre"] },
];

function AddConditions({ rows, onAdd }: { rows: ConditionKey[]; onAdd: (k: ConditionKey) => void }) {
  const groups = CONDITION_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => !rows.includes(k)) })).filter((g) => g.keys.length);
  if (!groups.length) return null;

  // Nothing added yet: every condition as a described tile, so the empty form explains itself.
  if (!rows.length)
    return (
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <p className="font-medium">Start with a condition</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Combine as many as you like. Each one narrows who this is.</p>
        <div className="mt-5 space-y-5">
          {groups.map((g) => (
            <section key={g.label} className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">{g.label}</h3>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {g.keys.map((key) => {
                  const c = CONDITION_BY_KEY[key];
                  const Icon = c.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onAdd(key)}
                      className="group flex items-center gap-3 rounded-lg border bg-background p-2.5 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-background">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{c.add}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    );

  return (
    <div className="rounded-xl border border-dashed p-4">
      <p className="text-sm font-medium">Add another condition</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Each one narrows who this is.</p>
      <div className="mt-4 space-y-3">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <span className="w-36 shrink-0 pt-1.5 text-xs text-muted-foreground">{g.label}</span>
            <div className="flex flex-wrap gap-2">
              {g.keys.map((key) => {
                const c = CONDITION_BY_KEY[key];
                const Icon = c.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onAdd(key)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium shadow-xs transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    {c.add}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** An audience's conditions as chips joined by "and": [Austin] and [Under 30] and [Nike, Tyler, the Creator]. */
export function DefinitionChips({ audience, className }: { audience: Audience; className?: string }) {
  const def = fromAudience(audience);
  const rows = filled(def);
  if (!rows.length) return null;
  const values = (key: ConditionKey): string => {
    if (key === "location") return def.city;
    if (key === "age") return agesPhrase(def.ages).replace(/^./, (c) => c.toUpperCase());
    if (key === "gender") return def.gender === "female" ? "Women" : "Men";
    if (key === "lifestyle") return def.segments.map((x) => x.name).join(", ");
    if (key === "genre") return def.tags.map((g) => g.name).join(", ");
    return entitiesIn(def, key).map((e) => e.name).join(", ");
  };
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-2", className)}>
      {rows.map((key, i) => {
        const meta = CONDITION_BY_KEY[key];
        const Icon = meta.icon;
        return (
          <li key={key} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-xs text-muted-foreground">and</span>}
            <span className="flex max-w-80 items-center gap-1.5 rounded-full bg-muted py-1 pr-3 pl-2 text-xs" title={`${meta.title} ${values(key)}`}>
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-muted-foreground">{meta.title}</span>
              <span className="truncate font-medium">{values(key)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** What the agent read from a description, every name already resolved in Qloo. */
type Parsed = {
  name: string;
  city: string;
  country: string;
  ages: string[];
  gender: "" | "female" | "male";
  entities: PickedEntity[];
  segments: PickedSegment[];
  tags: PickedTag[];
};
type ParseResponse = { ok: true; definition: Parsed; unresolved: string[] } | { ok: false; error: string };

/** "Describe them" in a sentence; the agent turns it into conditions the merchant can then adjust. */
function DescribeBar({ onParsed }: { onParsed: (p: Parsed) => void }) {
  const brand = useBrand();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await postJson<ParseResponse>("/api/pages/audience-parse", { brand_id: brand._id, text: text.trim() });
      if (!res.ok) {
        setNote("Could not read that. Try again, or add conditions below.");
        return;
      }
      onParsed(res.definition);
      setText("");
      if (res.unresolved.length) setNote(`Not found in Qloo: ${res.unresolved.join(", ")}. Check the spelling or search for them below.`);
    } catch {
      setNote("The agent is not reachable right now. Add conditions below instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6">
      <div className="flex items-center gap-2 rounded-xl bg-card py-1.5 pr-1.5 pl-3 ring-1 ring-foreground/10 transition-shadow focus-within:ring-3 focus-within:ring-ring/50">
        <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe them, like “under 25s in Lisbon who love Nike”"
          aria-label="Describe the audience"
          disabled={busy}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {busy ? <Spinner data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
          {busy ? "Reading" : "Fill in"}
        </Button>
      </div>
      {note ? (
        <p className="mt-1.5 px-1 text-xs text-muted-foreground">{note}</p>
      ) : (
        <p className="mt-1.5 px-1 text-xs text-muted-foreground">Slice finds each name in Qloo and adds the conditions below, where you can change them.</p>
      )}
    </form>
  );
}

/* Preview ---------------------------------------------------------------------- */

type PreviewEntity = { id: string; name: string; image?: string; subtitle?: string };
type PreviewData = { artists: PreviewEntity[]; brands: PreviewEntity[]; films: PreviewEntity[]; anchoredOn?: string; error?: string };

/** Qloo's read of the definition, debounced; `pending` while the shown read is for an older definition. */
function usePreview(brandId: Id<"pagesBrands">, sources: Audience["sources"]) {
  const run = useAction(api.pagesAudiences.preview);
  const key = JSON.stringify(sources);
  const [state, setState] = useState<{ key: string; data: PreviewData } | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (key === "{}") return;
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const data = await run({ brandId, sources: JSON.parse(key) });
        if (n === seq.current) setState({ key, data });
      } catch {
        if (n === seq.current) setState({ key, data: { artists: [], brands: [], films: [], error: "Qloo did not answer. Try again in a moment." } });
      }
    }, 650);
    return () => window.clearTimeout(t);
  }, [key, brandId, run]);
  if (key === "{}") return { data: null, pending: false };
  return { data: state?.data ?? null, pending: state?.key !== key };
}

const GHOST_TILES = [0, 1, 2, 3, 4].map((i) => ({ key: `ghost-${i}`, name: "" }));

/** Artists, brands and films round-robin, pictures first, for the cover. */
function previewTiles(d: PreviewData | null) {
  if (!d) return [];
  const lists = [d.artists, d.brands, d.films];
  const out: { key: string; name: string; image?: string }[] = [];
  for (let i = 0; i < 6; i++) for (const l of lists) if (l[i]) out.push({ key: l[i].id, name: l[i].name, image: l[i].image });
  return [...out.filter((t) => t.image), ...out.filter((t) => !t.image)].slice(0, 5);
}

function PreviewList({ title, items }: { title: string; items: PreviewEntity[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <EntityStrip items={items} max={6} size="size-6" />
    </div>
  );
}

function Preview({ def, name }: { def: Definition; name: string }) {
  const brand = useBrand();
  const sources = useMemo(() => toSources(def), [def]);
  const { data, pending } = usePreview(brand._id, sources);
  const count = filled(def).length;
  const kind = kindFor(def);
  const tiles = previewTiles(data);
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <TasteCover
        tiles={count && tiles.length ? tiles : GHOST_TILES}
        icon={KIND_ICON[count ? kind : "custom"]}
        kindLabel={count ? (AUDIENCE_KIND_LABEL[kind] ?? kind) : "New audience"}
        title={name.trim() || autoName(def) || <span className="text-white/60">Who is this for?</span>}
        subtitle={count ? `${count} condition${count === 1 ? "" : "s"}` : "Add a condition to see who this is"}
        corner={
          pending ? (
            <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Spinner className="size-3" /> Reading Qloo
            </span>
          ) : undefined
        }
        className={cn("transition-opacity", pending && tiles.length > 0 && "[&_img]:opacity-70")}
      />
      <div className="space-y-4 p-4">
        {count ? (
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {describe(def).map((p, i) =>
              p.strong ? (
                <span key={i} className="font-medium text-foreground">
                  {p.text}
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Conditions are read together, so each one reshapes the whole profile: a city changes the artists, an age band changes the brands, a lifestyle segment changes
            both.
          </p>
        )}
        {data?.anchoredOn && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Age, gender and lifestyle need a place, an interest or a genre to read against, so this preview reads them among {data.anchoredOn}. Add one for a sharper read.
          </p>
        )}
        {data?.error && <p className="text-xs text-destructive">{data.error}</p>}
        {count > 0 && data && !data.error && (
          <div className={cn("space-y-3 transition-opacity", pending && "opacity-50")}>
            <p className="text-sm font-medium">What Qloo sees for them</p>
            <PreviewList title="Artists they listen to" items={data.artists} />
            <PreviewList title="Brands they trust" items={data.brands} />
            <PreviewList title="Films and shows they watch" items={data.films} />
          </div>
        )}
        {count > 0 && !data && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded-full bg-muted" style={{ width: `${80 - i * 15}%` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Builder ---------------------------------------------------------------------- */

/**
 * Conditions combined with "and" on the left, Qloo's live read of the
 * combination on the right. Creates an audience, or saves new conditions for
 * `audience` and recompiles it.
 */
export function AudienceBuilder({
  audience,
  initialRows = [],
  onDone,
  onCancel,
}: {
  audience?: Audience | null;
  initialRows?: ConditionKey[];
  onDone: (id: Id<"pagesAudiences">) => void;
  onCancel?: () => void;
}) {
  const brand = useBrand();
  const create = useMutation(api.pagesAudiences.create);
  const update = useMutation(api.pagesAudiences.update);
  const run = useCompileAudience();
  const [def, setDef] = useState<Definition>(() => {
    if (audience) return fromAudience(audience);
    const d = emptyDefinition(initialRows);
    if (initialRows.includes("location")) d.city = cityOf(brand.brief?.locations?.[0]);
    return d;
  });
  const [name, setName] = useState(audience?.name ?? "");
  const [justAdded, setJustAdded] = useState<ConditionKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Definition>) => setDef((d) => ({ ...d, ...patch }));
  const count = filled(def).length;
  const fallbackName = autoName(def);

  function add(key: ConditionKey) {
    setDef((d) => ({ ...d, rows: [...d.rows, key] }));
    setJustAdded(key);
  }

  function remove(key: ConditionKey) {
    setDef((d) => ({
      ...d,
      rows: d.rows.filter((r) => r !== key),
      ...(key === "location" ? { city: "", country: "" } : {}),
      ...(key === "age" ? { ages: [] } : {}),
      ...(key === "gender" ? { gender: "" as const } : {}),
      ...(key === "lifestyle" ? { segments: [] } : {}),
      ...(key === "genre" ? { tags: [] } : {}),
      entities: ENTITY_CONDITIONS[key] ? d.entities.filter((e) => conditionOf(e.type) !== key) : d.entities,
    }));
  }

  const setEntities = (key: ConditionKey, list: PickedEntity[]) => setDef((d) => ({ ...d, entities: [...d.entities.filter((e) => conditionOf(e.type) !== key), ...list] }));

  // Bumped when a description sets the city, so the place card re-reads its pin.
  const [placeKey, setPlaceKey] = useState(0);

  /** A description adds to the definition: its place, ages and gender win, its picks join the existing ones. */
  function applyParsed(p: Parsed) {
    setDef((d) => {
      const rows = [...d.rows];
      const addRow = (k: ConditionKey) => {
        if (!rows.includes(k)) rows.push(k);
      };
      const next: Definition = { ...d };
      if (p.city) {
        next.city = p.city;
        next.country = p.country;
        addRow("location");
      }
      if (p.ages.length) {
        next.ages = p.ages;
        addRow("age");
      }
      if (p.gender) {
        next.gender = p.gender;
        addRow("gender");
      }
      next.entities = [...d.entities, ...p.entities.filter((e) => !d.entities.some((x) => x.id === e.id))];
      for (const e of p.entities) addRow(conditionOf(e.type));
      next.segments = [...d.segments, ...p.segments.filter((x) => !d.segments.some((y) => y.id === x.id))];
      if (p.segments.length) addRow("lifestyle");
      next.tags = [...d.tags, ...p.tags.filter((g) => !d.tags.some((y) => y.id === g.id))];
      if (p.tags.length) addRow("genre");
      next.rows = rows;
      return next;
    });
    if (p.city) setPlaceKey((k) => k + 1);
    if (!name.trim() && p.name) setName(p.name);
    setJustAdded(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const sources = toSources(def);
      const kind = kindFor(def);
      const finalName = name.trim() || fallbackName || "New audience";
      let id: Id<"pagesAudiences">;
      if (audience) {
        id = audience._id;
        await update({ id, name: finalName, kind, sources });
      } else {
        ({ id } = await create({ brandId: brand._id, name: finalName, kind, sources }));
      }
      onDone(id);
      void run(id);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  function body(key: ConditionKey) {
    const meta = CONDITION_BY_KEY[key];
    const focus = justAdded === key;
    if (key === "location") return <LocationCondition key={placeKey} def={def} set={set} autoFocus={focus} />;
    if (key === "age")
      return (
        <div className="flex flex-wrap gap-1.5">
          {AGE_BANDS.map((a) => (
            <Chip key={a} selected={def.ages.includes(a)} onClick={() => set({ ages: def.ages.includes(a) ? def.ages.filter((x) => x !== a) : [...def.ages, a] })}>
              {AGE_LABEL[a]}
            </Chip>
          ))}
        </div>
      );
    if (key === "gender")
      return (
        <Segmented
          value={def.gender}
          onChange={(g) => set({ gender: g })}
          options={[
            { value: "", label: "Anyone" },
            { value: "female", label: "Women" },
            { value: "male", label: "Men" },
          ]}
        />
      );
    if (key === "lifestyle") return <SegmentCondition def={def} set={set} />;
    if (key === "genre") return <InterestPicker mode="tag" value={def.tags} onChange={(tags) => set({ tags })} placeholder={meta.placeholder} autoFocus={focus} showType={false} />;
    return (
      <InterestPicker
        value={entitiesIn(def, key)}
        onChange={(list) => setEntities(key, list)}
        types={ENTITY_CONDITIONS[key]}
        placeholder={meta.placeholder}
        autoFocus={focus}
        showType={!!meta.showType}
      />
    );
  }

  function footer(key: ConditionKey) {
    if (key === "age" && def.ages.length > 1) return "Several bands read as one wider group.";
    const n = key === "lifestyle" ? def.segments.length : key === "genre" ? def.tags.length : ENTITY_CONDITIONS[key] ? entitiesIn(def, key).length : 0;
    if (n > 1) return "Qloo blends these into one taste signal; more picks give a broader read.";
    return undefined;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <DescribeBar onParsed={applyParsed} />
          {def.rows.length > 0 && <p className="mb-3 text-sm font-medium">People who</p>}
          {def.rows.map((key, i) => (
            <div key={key}>
              {i > 0 && <And />}
              <ConditionCard meta={CONDITION_BY_KEY[key]} onRemove={() => remove(key)} footer={footer(key)} reveal={justAdded === key}>
                {body(key)}
              </ConditionCard>
            </div>
          ))}
          {def.rows.length > 0 && <div className="h-4" />}
          <AddConditions rows={def.rows} onAdd={add} />
        </div>
        <div className="lg:sticky lg:top-[5.5rem]">
          <Preview def={def} name={name} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex flex-wrap items-center gap-3 border-t bg-popover px-6 py-3">
        <AdornedInput
          prefix="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={fallbackName || "Name this audience"}
          aria-label="Audience name"
          className="h-9 max-w-md min-w-56 flex-1"
        />
        <p className="min-w-40 flex-1 text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : audience ? (
            "Saving recompiles the profile. Pages already built for it keep what they say."
          ) : count === 0 ? (
            "Add at least one condition."
          ) : (
            "Takes about 30 seconds. The card fills in as Qloo answers."
          )}
        </p>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button onClick={save} disabled={busy || count === 0}>
            {busy && <Spinner data-icon="inline-start" />}
            {audience ? "Save and recompile" : "Create audience"}
          </Button>
        </div>
      </div>
    </div>
  );
}
