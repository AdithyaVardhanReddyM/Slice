// Renders every email template in three themes (a Stackhouse Books brand theme,
// Ink and Sunset), plus the section presets, single elements, layouts and
// items variants, to HTML files for visual checks.
//
//   cd packages/backend && npx tsx scripts/render-templates.ts <outDir> [--all-themes]
//
// Screenshot the output with any headless browser (the agent's Playwright
// works: apps/agent `uv run python`), at 640 px and 390 px wide.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EmailDoc, EmailItem, EmailKit, EmailSectionInput, EmailTheme, ItemsBlock } from "../convex/emailTypes";
import { applyTheme, THEME_PRESETS, themeFromKit, themePreset } from "../convex/emailThemes";
import { allBlocks, validateEmailDoc, withIds } from "../convex/emailDoc";
import { renderEmail, renderPlainText, type RenderContext } from "../convex/emailRender";
import { BLANK_TEMPLATE, EMAIL_TEMPLATES } from "../convex/emailTemplates";
import { BLOCK_PRESETS, LAYOUT_PRESETS, SECTION_PRESETS, col, heading, items as itemsBlock, pexels, section } from "../convex/emailPresets";

const out = resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "./email-renders");
mkdirSync(out, { recursive: true });

/* The demo brand ------------------------------------------------------------- */

const FOLIO_KIT: EmailKit = {
  wordmark: "Stackhouse Books",
  colors: {
    background: "#F6F1E7",
    foreground: "#1E2A22",
    primary: "#1F3D2B",
    primaryForeground: "#F6F1E7",
    accent: "#C8643B",
    muted: "#EDE5D6",
    surface: "#F6F1E7",
  },
  fonts: {
    heading: { family: "Fraunces", fallback: "Georgia, 'Times New Roman', serif", google: true, weights: [400, 600] },
    body: { family: "Inter", fallback: "Arial, Helvetica, sans-serif", google: true, weights: [400, 500, 600] },
  },
  buttonStyle: "rounded",
  radius: "md",
  uppercaseLabels: false,
  voice: { summary: "Warm, bookish, never stuffy.", do: ["Talk like a bookseller"], avoid: ["Hype"] },
};

const BRAND: RenderContext["brand"] = {
  name: "Stackhouse Books",
  wordmark: "Stackhouse Books",
  footer: {
    address: "214 Court Street, Brooklyn, NY 11201",
    website: "https://stackhousebooks.example",
    socials: [
      { network: "instagram", url: "https://instagram.com/stackhousebooks" },
      { network: "facebook", url: "https://facebook.com/stackhousebooks" },
      { network: "tiktok", url: "https://tiktok.com/@stackhousebooks" },
      { network: "website", url: "https://stackhousebooks.example" },
    ],
  },
};

const cover = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;
const book = (id: string, name: string, subtitle: string, coverId: number, price: string, description: string, tags: string[]): EmailItem => ({
  id,
  name,
  subtitle,
  kind: "book",
  description,
  price,
  image: cover(coverId),
  url: `https://stackhousebooks.example/books/${id}`,
  tags,
});

const ITEMS: Record<string, EmailItem> = Object.fromEntries(
  [
    book("piranesi", "Piranesi", "Susanna Clarke", 10226290, "$18.00", "A man lives alone in a house of endless halls and tides, and slowly works out who he is.", ["literary fantasy"]),
    book("klara", "Klara and the Sun", "Kazuo Ishiguro", 10648686, "$17.00", "An artificial friend watches a family from the corner of a sunlit room.", ["literary fiction"]),
    book("pachinko", "Pachinko", "Min Jin Lee", 8044605, "$18.99", "Four generations of a Korean family in Japan, told with enormous warmth.", ["historical fiction"]),
    book("sweetgrass", "Braiding Sweetgrass", "Robin Wall Kimmerer", 7281575, "$20.00", "A botanist on plants, gratitude and what the land asks of us.", ["nature writing"]),
    book("tomorrow", "Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", 12859975, "$28.00", "Two friends, thirty years and the video games they make together.", ["literary fiction"]),
    book("station", "Station Eleven", "Emily St. John Mandel", 7369961, "$17.00", "A travelling theatre troupe keeps art alive after the end of the world.", ["speculative fiction"]),
    {
      id: "tote",
      name: "Stackhouse Books tote",
      subtitle: "Heavy cotton canvas",
      kind: "product",
      description: "Holds six hardbacks and a baguette.",
      price: "$24.00",
      image: pexels(34800392, 600, 600),
      url: "https://stackhousebooks.example/shop/tote",
      tags: [],
    },
    {
      id: "giftcard",
      name: "Gift card",
      subtitle: "Any amount",
      kind: "product",
      description: "Delivered by email in minutes.",
      price: "From $10",
      image: pexels(264745, 600, 600),
      url: "https://stackhousebooks.example/gift-cards",
      tags: [],
    },
  ].map((it) => [it.id, it]),
);
const BOOK_IDS = ["piranesi", "klara", "pachinko", "sweetgrass", "tomorrow", "station"];

// A neutral product catalogue, so the templates are also checked with square product photos.
const product = (id: string, name: string, subtitle: string, photo: number, price: string): EmailItem => ({
  id,
  name,
  subtitle,
  kind: "product",
  description: "A short line about what makes it worth having.",
  price,
  image: pexels(photo, 600, 600),
  url: `https://example.com/shop/${id}`,
  tags: [],
});
for (const it of [
  product("candles", "Hand-poured candle", "Cedar and fig", 6755612, "$28.00"),
  product("mugs", "Stoneware mug", "Made in small batches", 32282974, "$22.00"),
  product("giftbox", "Gift box", "Wrapped and ready", 3873488, "$45.00"),
  product("flatlay", "The weekend set", "Three favourites", 25361524, "$64.00"),
  product("parcel", "Monthly box", "A surprise each month", 3298036, "From $24"),
  product("coffee", "House blend", "Whole bean, 250 g", 1058920, "$16.00"),
])
  ITEMS[it.id] = it;
const PRODUCT_IDS = ["candles", "mugs", "giftbox", "flatlay", "parcel", "coffee"];
const REASONS: Record<string, string> = {
  piranesi: "Because you loved The Night Circus",
  klara: "For fans of Never Let Me Go",
  pachinko: "Because you rated Homegoing five stars",
  sweetgrass: "You told us you love nature writing",
  tomorrow: "Because you loved Normal People",
  station: "For readers of Emily St. John Mandel's Sea of Tranquility",
};

const MERGE: RenderContext["merge"] = { first_name: "Maya", last_name: "Okafor", name: "Maya Okafor", email: "maya@example.com", city: "Brooklyn" };

const ctxFor = (mode: RenderContext["mode"]): RenderContext => ({
  items: ITEMS,
  brand: BRAND,
  merge: MERGE,
  mode,
  links: {
    unsubscribe: "https://stackhousebooks.example/u?s=demo",
    viewOnline: "https://stackhousebooks.example/v?s=demo",
    track: (href, blockId) => `https://track.example/c?b=${encodeURIComponent(blockId)}&u=${encodeURIComponent(href)}`,
  },
});

/** Stand in for the agent: fill empty items blocks with sample items (and reasons for taste picks). */
function fillItems(doc: EmailDoc, pool: string[] = BOOK_IDS): EmailDoc {
  const d = JSON.parse(JSON.stringify(doc)) as EmailDoc;
  let offset = 0;
  for (const { block } of allBlocks(d)) {
    if (block.type !== "items" || block.itemIds.length) continue;
    const b = block as ItemsBlock;
    const n = b.pick === "taste" ? b.count : b.layout === "list" ? 3 : b.columns === 1 ? 1 : b.columns === 2 ? 4 : 3;
    b.itemIds = Array.from({ length: n }, (_, i) => pool[(offset + i) % pool.length]);
    offset += 2;
    if (b.pick === "taste") b.reasons = Object.fromEntries(b.itemIds.map((id) => [id, REASONS[id] ?? "Because you loved the cedar candle"]));
  }
  return d;
}

// `--all-themes` adds every preset theme (templates only).
const ALL = process.argv.includes("--all-themes");
const THEMES: { key: string; theme: EmailTheme }[] = [
  { key: "brand", theme: themeFromKit(FOLIO_KIT) },
  { key: "ink", theme: themePreset("ink")! },
  { key: "sunset", theme: themePreset("sunset")! },
];
const EXTRA_THEMES = ALL ? THEME_PRESETS.filter((t) => t.id !== "ink" && t.id !== "sunset").map((theme) => ({ key: theme.id!, theme })) : [];

const files: string[] = [];
const write = (name: string, html: string) => {
  writeFileSync(join(out, name), html);
  files.push(name);
};

/** A doc from section inputs (presets), with a title section per group. */
function presetDoc(title: string, sections: { label: string; section: EmailSectionInput }[], theme: EmailTheme): EmailDoc {
  const parts: EmailSectionInput[] = [];
  for (const s of sections) {
    parts.push(section("Label", [col([heading(s.label, { level: 3, size: 12, uppercase: true, letterSpacing: 1, font: "body", color: "#8a8a8a", align: "left", padding: [0, 0, 0, 0] })])], { background: "#ffffff", padding: [14, 16, 6, 16] }));
    parts.push(s.section);
  }
  return validateEmailDoc({ kind: "email", version: 0, subject: title, preheader: "", theme, sections: withIds(parts) }).doc;
}

for (const { key, theme } of THEMES) {
  for (const t of [...EMAIL_TEMPLATES, BLANK_TEMPLATE]) {
    const doc = fillItems(applyTheme(t.doc, theme), key === "brand" ? BOOK_IDS : PRODUCT_IDS);
    write(`${t.id}--${key}.html`, renderEmail(doc, ctxFor("send")));
  }
  // Two pages: a doc holds at most MAX_SECTIONS sections and every preset gets a label row.
  const presets = SECTION_PRESETS.map((p) => ({ label: `${p.group}: ${p.label}`, section: p.section }));
  const half = Math.ceil(presets.length / 2);
  write(`presets-a--${key}.html`, renderEmail(fillItems(presetDoc("Section presets", presets.slice(0, half), theme)), ctxFor("send")));
  write(`presets-b--${key}.html`, renderEmail(fillItems(presetDoc("Section presets", presets.slice(half), theme)), ctxFor("send")));
  write(
    `blocks--${key}.html`,
    renderEmail(fillItems(presetDoc("Blocks", BLOCK_PRESETS.map((p) => ({ label: p.label, section: section(p.label, [col([p.block])], { padding: [16, 40, 24, 40] }) })), theme)), ctxFor("send")),
  );
  write(`layouts--${key}.html`, renderEmail(presetDoc("Layouts", LAYOUT_PRESETS.map((p) => ({ label: p.label, section: p.section })), theme), ctxFor("send")));
}

for (const { key, theme } of EXTRA_THEMES)
  for (const t of EMAIL_TEMPLATES) write(`${t.id}--${key}.html`, renderEmail(fillItems(applyTheme(t.doc, theme)), ctxFor("send")));

// Items variants: grid 1/2/3, list, products, and the edit-mode placeholders.
const brandTheme = THEMES[0].theme;
const variants = (ids: (n: number) => string[]) => [
  { label: "Grid, 3 columns", section: section("G3", [col([itemsBlock({ columns: 3, itemIds: ids(3) })])], { padding: [24, 40, 24, 40] }) },
  { label: "Grid, 2 columns with reasons", section: section("G2", [col([itemsBlock({ columns: 2, itemIds: ids(4), pick: "taste", count: 4, reasons: REASONS })])], { padding: [24, 40, 24, 40] }) },
  { label: "Grid, 1 column", section: section("G1", [col([itemsBlock({ columns: 1, itemIds: ids(1), show: { image: true, subtitle: true, description: true, price: true, button: true, reason: false } })])], { padding: [24, 40, 24, 40] }) },
  { label: "List", section: section("L", [col([itemsBlock({ layout: "list", columns: 1, itemIds: ids(3), reasons: REASONS, show: { image: true, subtitle: true, description: true, price: true, button: true, reason: true } })])], { padding: [24, 40, 24, 40] }) },
  { label: "Products", section: section("P", [col([itemsBlock({ columns: 2, itemIds: ids(1).length ? ["tote", "giftcard"] : [] })])], { padding: [24, 40, 24, 40] }) },
  { label: "On accent", section: section("A", [col([itemsBlock({ columns: 3, itemIds: ids(3) })])], { background: "accent", padding: [24, 40, 24, 40] }) },
];
write("items--brand.html", renderEmail(presetDoc("Items", variants((n) => BOOK_IDS.slice(0, n)), brandTheme), ctxFor("send")));
write("items-edit--brand.html", renderEmail(presetDoc("Items (edit, empty)", variants(() => []), brandTheme), ctxFor("edit")));
write("picked-for-you-edit--brand.html", renderEmail(applyTheme(EMAIL_TEMPLATES.find((t) => t.id === "picked-for-you")!.doc, brandTheme), ctxFor("edit")));

writeFileSync(join(out, "newsletter--brand.txt"), renderPlainText(fillItems(applyTheme(EMAIL_TEMPLATES[1].doc, brandTheme)), ctxFor("send")));
writeFileSync(join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Email renders</title><ul>${files.map((f) => `<li><a href="${f}">${f}</a></li>`).join("")}</ul>`);
console.log(`${files.length} files in ${out}`);
