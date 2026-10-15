// One way to turn a brand (stored, or a draft being edited) and its items
// into what the renderer needs, so every preview in the console draws the same
// email the recipients get.

import type { RenderContext } from "@slice/backend/convex/emailRender";
import { renderEmail } from "@slice/backend/convex/emailRender";
import { EMAIL_TEMPLATES } from "@slice/backend/convex/emailTemplates";
import { applyTheme, themeFromKit } from "@slice/backend/convex/emailThemes";
import type { EmailDoc, EmailItem, EmailKit, EmailTheme } from "@slice/backend/convex/emailTypes";
import { itemOf, type BrandLike, type EmailItemRow } from "./types";

type Items = (EmailItem | EmailItemRow)[] | Record<string, EmailItem> | null | undefined;

function itemMap(items: Items): Record<string, EmailItem> {
  if (!items) return {};
  if (!Array.isArray(items)) return items;
  const out: Record<string, EmailItem> = {};
  for (const it of items) {
    const item = "_id" in it ? itemOf(it) : it;
    out[item.id] = item;
  }
  return out;
}

/** The RenderContext for a brand: its items by id, logo, wordmark and footer, plus the reader's merge values. */
export function renderContextFor(
  brand: BrandLike,
  items: Items,
  merge?: RenderContext["merge"],
  mode: RenderContext["mode"] = "preview",
): RenderContext {
  return {
    items: itemMap(items),
    brand: {
      name: brand.name,
      logo: brand.kit?.logo,
      wordmark: brand.kit?.wordmark,
      footer: brand.footer ?? undefined,
    },
    merge: { brand: brand.name, ...merge },
    mode,
  };
}

/** The brand's own theme (theme id "brand"); a neutral one while setup has not written a kit. */
export function brandTheme(kit: EmailKit | null | undefined): EmailTheme {
  return themeFromKit(kit ?? undefined);
}

/**
 * Fills items blocks that point at nothing the brand has with its first
 * items, so a template preview shows the brand's own books or products rather
 * than an empty grid. Blocks the merchant filled are left alone.
 */
export function withSampleItems(doc: EmailDoc, items: EmailItem[]): EmailDoc {
  if (!items.length) return doc;
  const known = new Set(items.map((i) => i.id));
  let offset = 0;
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        blocks: column.blocks.map((block) => {
          if (block.type !== "items" || block.itemIds.some((id) => known.has(id))) return block;
          const take = Math.max(1, block.count || block.columns || 3);
          const picks = Array.from({ length: Math.min(take, items.length) }, (_, i) => items[(offset + i) % items.length].id);
          offset += picks.length;
          return { ...block, itemIds: picks };
        }),
      })),
    })),
  };
}

/** A template drawn in the brand's theme (or the given one) with its own items, ready to render. */
export function themedTemplate(templateId: string, kit: EmailKit | null | undefined, items: EmailItem[] = [], theme?: EmailTheme): EmailDoc | null {
  const template = EMAIL_TEMPLATES.find((t) => t.id === templateId) ?? EMAIL_TEMPLATES.find((t) => t.name.toLowerCase() === templateId.toLowerCase());
  if (!template) return null;
  return withSampleItems(applyTheme(template.doc, theme ?? brandTheme(kit)), items);
}

/** The id of the first template that has the given name or category, for previews that want "the welcome email". */
export function templateIdFor(nameOrCategory: string): string | undefined {
  const q = nameOrCategory.toLowerCase();
  return (
    EMAIL_TEMPLATES.find((t) => t.id === q || t.name.toLowerCase() === q) ??
    EMAIL_TEMPLATES.find((t) => t.name.toLowerCase().startsWith(q)) ??
    EMAIL_TEMPLATES.find((t) => t.category.toLowerCase() === q)
  )?.id;
}

/** Renders a template for the brand in one call: the brand-list, home and setup previews. A theme overrides the brand's. */
export function renderTemplateFor(
  brand: BrandLike,
  templateId: string | undefined,
  items: (EmailItem | EmailItemRow)[] = [],
  theme?: EmailTheme,
): string | null {
  if (!templateId) return null;
  const list = items.map((it) => ("_id" in it ? itemOf(it) : it));
  return renderDocFor(brand, themedTemplate(templateId, brand.kit, list, theme), list);
}

/** Renders a stored campaign doc for a thumbnail or preview. */
export function renderDocFor(brand: BrandLike, doc: EmailDoc | null | undefined, items: Items, merge?: RenderContext["merge"]): string | null {
  if (!doc || !Array.isArray(doc.sections)) return null;
  try {
    return renderEmail(doc, renderContextFor(brand, items, merge, "preview"));
  } catch (err) {
    // A doc the renderer cannot read should cost one thumbnail, not the screen.
    console.error("Could not render the email", err);
    return null;
  }
}
