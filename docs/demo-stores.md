# Demo stores

Two realistic storefronts that the Slice widget is tested on. They exist to exercise the
recommendation pipeline the way it will work for a real merchant:

```
shopper intent (chat)  +  taste profile (questionnaire → Qloo)  →  agent matches against the catalog
```

Rules that apply to both stores:

- **Brand is an optional signal, never the backbone.** Products carry descriptions and
  structured attributes; that is what the agent matches taste against. Some brands exist in
  Qloo, some don't, and the house-brand store has none.
- **Every style has products in every major category.** Taste should change *which* sofa
  or *which* jacket is recommended, not just which category. If a style only exists in one
  category, the catalog can't show that.
- **Descriptions are written like a merchant would write them**: 2–3 sentences, concrete
  adjectives (material, color, mood, use), no marketing fluff. The LLM searches this text.
- **Catalog = import format.** Each store's catalog is a JSON file in the schema below; the
  widget's merchant import will accept this same shape later.

---

## Shared catalog schema

```ts
type Product = {
  id: string;                 // "hh-0042"
  slug: string;
  name: string;
  brand?: string;             // omitted for house-brand stores
  department?: "women" | "men" | "unisex" | "kids";   // fashion only
  category: string;           // top level: "Living", "Outerwear"
  subcategory: string;        // "Sofas & armchairs", "Jackets"
  price: number;              // USD
  compareAtPrice?: number;    // on sale when present
  description: string;        // merchant copy, 2–3 sentences
  attributes: {
    style: string[];          // 1–2 from the store's style axis (below)
    material: string[];
    colorFamily: string[];    // neutral | warm | cool | earth | bold | pastel | black | white
    colors: string[];         // "terracotta", "sage"
    useCase: string[];        // "small apartment", "hosting", "commute", "rainy days"
    room?: string[];          // home store: "living room", "balcony"
    occasion?: string[];      // fashion: "everyday", "office", "festival", "hiking"
    fit?: string;             // fashion: "relaxed" | "regular" | "slim" | "oversized"
    season?: string[];        // fashion
    priceTier: "budget" | "mid" | "premium";
  };
  tags: string[];             // free-form merchant tags
  variants: { id: string; label: string; inStock: boolean }[];   // sizes / colors
  images: string[];
  rating?: number;            // 0–5
  reviewCount?: number;
  bestseller?: boolean;
  new?: boolean;
};
```

Plus a small `store.json` per store: name, tagline, logo, theme colors, nav structure,
currency, locale, and the merchant tags vocabulary.

---

## Store 1 — Marlow (home & living, house brand only)

Realistic reference: West Elm / Crate & Barrel / a good independent homewares shop.
Everything is own-brand, so there is **nothing for Qloo to match by name**. This store
tests pure taste-tag → description matching.

**Size:** ~160 SKUs, price range $8–$1,800.

### Categories

| Category | Subcategories | ~SKUs |
|---|---|---|
| Living | Sofas & armchairs, Coffee & side tables, Shelving, Rugs, Throws & cushions, Wall art & mirrors | 40 |
| Bedroom | Bedding, Bed frames, Nightstands, Bedroom lighting | 20 |
| Kitchen & dining | Cookware, Tableware & ceramics, Glassware, Utensils & boards, Table linens, Coffee & tea | 35 |
| Lighting | Floor lamps, Table lamps, Pendants | 15 |
| Decor | Candles & scent, Vases, Planters, Clocks, Baskets & storage | 25 |
| Workspace | Desks, Desk chairs, Organizers, Stationery | 15 |
| Outdoor & balcony | Seating, Planters, Lanterns | 10 |

### Style axis (each product gets 1–2)

`scandi-minimal` · `mid-century` · `japandi` · `boho-global` · `industrial` ·
`maximalist-eclectic` · `coastal` · `cottage-rustic` · `art-deco-glam` · `retro-70s`

Coverage rule: every style appears in Living, Kitchen & dining, Lighting and Decor; at least
six styles appear in each remaining category.

### What the taste profile should move

- "Wes Anderson, Fleetwood Mac, Mediterranean food" → warm palette, `retro-70s` /
  `maximalist-eclectic`, patterned textiles, brass.
- "Scandinavian crime dramas, Bon Iver, sushi" → `scandi-minimal` / `japandi`, oak,
  matte black, linen, muted tones.
- "Beyoncé, Bridgerton, cocktail bars" → `art-deco-glam`, velvet, gold, mirrors, bar cart.
- "Hiking, folk music, farmers markets" → `cottage-rustic` / `boho-global`, stoneware,
  wool, jute, planters.

---

## Store 2 — "Fold" (multi-brand fashion & lifestyle marketplace)

Realistic reference: END. / SSENSE / a regional multi-brand retailer. Carries real brands
*and* new labels, mixed on purpose:

- **~8 well-known brands** likely in Qloo: Nike, Adidas, New Balance, Levi's, Carhartt WIP,
  Patagonia, Dr. Martens, Birkenstock.
- **~8 real but niche brands**, may or may not be in Qloo: Norse Projects, Veja, Arket,
  Snow Peak, Salomon, Studio Nicholson, Pangaia, Kapital.
- **~8 fictional new labels**, definitely not in Qloo, each with a clear identity:
  Malha Lisboa (Lisbon knitwear), SEOM (Seoul streetwear), Burnside Canvas (Portland
  workwear), Hedda Vang (Oslo romantic womenswear), Asche (Berlin all-black), Cranmore
  (New England ivy), Sóller (Mallorca resort linen), Ferrant (Montreal fragrance).

The agent must give equally good recommendations across all three groups. If results
cluster on the well-known brands, the pipeline is leaning on brand and that is a bug.

**Size:** ~180 SKUs, price range $12–$650. Departments: women / men / unisex.

### Categories

| Category | Subcategories | ~SKUs |
|---|---|---|
| Tops | T-shirts, Shirts, Knitwear, Sweatshirts & hoodies | 35 |
| Bottoms | Jeans, Trousers, Shorts, Skirts | 25 |
| Outerwear | Jackets, Coats, Shells & fleece | 25 |
| Dresses & one-pieces | Dresses, Jumpsuits | 12 |
| Footwear | Sneakers, Boots, Sandals, Dress shoes | 30 |
| Bags | Totes, Backpacks, Crossbody | 12 |
| Accessories | Hats, Eyewear, Jewelry, Belts, Socks & scarves | 20 |
| Fragrance & grooming | Fragrance, Skincare, Hair | 12 |
| Lifestyle | Bottles & flasks, Notebooks, Small home goods | 9 |

### Style axis (each product gets 1–2)

`streetwear` · `gorpcore-outdoor` · `quiet-minimal` · `heritage-workwear` · `athletic` ·
`preppy-ivy` · `romantic-boho` · `y2k-retro` · `dark-gothic` · `coastal-resort`

Coverage rule: every style appears in Tops, Bottoms, Outerwear, Footwear and Accessories.

### What the taste profile should move

- "Kendrick Lamar, Euphoria, sneaker culture" → `streetwear` / `y2k-retro`, bold colors,
  oversized fit, sneakers; spread across Nike *and* the fictional Seoul label.
- "Bon Iver, The Bear, trail running" → `gorpcore-outdoor` / `heritage-workwear`, earth
  tones, technical fabric, Salomon *and* the fictional Portland label.
- "Phoebe Bridgers, Normal People, natural wine bars" → `quiet-minimal` / `romantic-boho`,
  linen, neutrals, relaxed fit.
- "Taylor Swift, Gilmore Girls, coffee shops" → `preppy-ivy` / `romantic-boho`, knitwear,
  pleated skirts, loafers.

---

## Build plan

1. **Catalog package** `packages/demo-catalogs` ✅ (Marlow): the `Product` type, one JSON
   file per category under `src/<store>/`, `store.json`, and `scripts/validate.ts` which
   checks the schema and the style-coverage rules. Catalog JSON is LLM-authored by
   category following `AUTHORING.md`, then validated.
2. **Storefront app** `apps/stores` ✅ (Marlow at `/marlow`): one Next.js app serving every
   store under its own path with its own layout and theme. Pages: home, category (with
   subcategory tabs and style/color/price filters), product, search, shop-by-style,
   client-side cart with drawer (no checkout). Each store loads `slice.js` exactly as a
   real merchant would.
3. **Images**: every product has an `imageQuery`; `scripts/fetch-images.ts` pulls one Pexels
   photo per product into `apps/stores/public/<store>/` and writes the path back into the
   catalog. Until then the store renders a color-composed placeholder from the product's own
   colors. AI generation (~$0.04/image) is the upgrade path for products stock photos miss.
4. **Taste personas** `packages/demo-catalogs/personas.json`: the eight profiles above
   (questionnaire answers + the styles/products they should land on). These become the
   regression set for tuning the widget's recommendation quality.
5. **Fold** (store 2) ✅: same package and app, under `/fold`. 180 products in
   `src/fold/`, brands and departments in `store.json`; the validator also checks brand
   vocabulary, departments, occasion/season, and that fictional labels are at least 30%
   of the catalog (they're 54%). Pages: home, department (`/fold/shop?dept=women`),
   category, product, labels A–Z and per-label pages, the ten style edits, search, bag.
