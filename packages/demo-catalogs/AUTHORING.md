# Writing catalog products

Products are written by hand as JSON, one file per category under `src/<store>/`. The
agent recommends by matching a shopper's taste profile against **the description and
attributes**, so those fields are the product. Write them like a real merchant would.

## Schema

`src/types.ts` is the source of truth. Every product file is a JSON array of `Product`.

## Store: Marlow (`src/marlow/`)

Direct-to-consumer home & living brand (think Article, Burrow, Parachute, Schoolhouse).
Everything is house-brand, so **no `brand` field**. Read `src/marlow/store.json` for the
style axis, rooms, and the category/subcategory tree. Use those exact strings.

### Hard rules

- `id`: `mw-<cat>-<nn>` where `<cat>` is the category code you were given and `<nn>` is
  two digits starting at `01`. `slug`: kebab-case of the name, unique.
- `category` and `subcategory` must match `store.json` exactly.
- `attributes.style`: 1–2 ids from `store.json` `styles`. Across your file, **every one of
  the 10 styles must appear at least once** (for the smaller categories, at least 6).
  Spread them: the point of the catalog is that taste changes *which* lamp or sofa gets
  recommended, not just which category.
- `attributes.room`: 1–3 from `store.json` `rooms`.
- `attributes.colorFamily`: 1–2 from the `ColorFamily` union. `colors`: the specific
  colors as a merchant lists them ("terracotta", "sage", "walnut", "charcoal").
- `attributes.priceTier`: budget / mid / premium, consistent with the price. Mix tiers
  within each subcategory.
- `variants`: realistic options for the product (finish, size, color). 1–5 per product.
  Variant ids: `<product id>-<kebab label>`. Use `priceDelta` when a size costs more.
  Mark roughly one variant in ten as `inStock: false`.
- `compareAtPrice` on about 10–15% of products (a sale). `bestseller` on ~10%,
  `new` on ~10%. `rating` 3.9–4.9 with a plausible `reviewCount` (0–900, skewed low).
- `imageQuery`: a 3–6 word stock-photo search that would find a representative photo,
  e.g. "walnut mid century sideboard", "linen duvet cover bed", "terracotta plant pot".
  `images`: `[]`.
- `tags`: 3–6 free-form merchant tags, lowercase ("small space", "gift", "hand-glazed").

### Writing the copy

- **Names** like a real brand's naming system: a product line name + the thing.
  "Ansel Sofa", "Hollis Coffee Table", "Vela Pendant", "Ridge Stoneware Mug (Set of 4)".
  Vary the line names; don't reuse one line name across unrelated categories.
- **Description**: 2–3 sentences, present tense, concrete. Say what it is made of, how it
  looks (shape, color, finish), what it feels like to live with, and who/what it suits.
  Use the mood words a shopper would (warm, calm, playful, moody, airy, collected). No
  exclamation marks, no "elevate", no "perfect for any home".
- **Details**: 3–6 spec bullets. Dimensions with units, materials, weight capacity, care
  instructions, what's included, country of making. Keep them plausible for the price.
- **Prices**: realistic for a mid-market DTC brand in 2026. Sofas $900–1,800, armchairs
  $450–900, coffee tables $220–600, rugs $120–700 (size-dependent), lamps $70–350,
  pendants $120–400, bedding sets $90–260, ceramics $18–90, candles $24–48, planters
  $18–120, desks $350–800. Whole-dollar prices ending in 0, 5, 8 or 9.

### Style cues (so each style reads distinctly in the copy)

| style | materials & colors | shapes & words |
|---|---|---|
| scandi-minimal | ash, white oak, white, light grey, wool | clean, pale, soft, quiet |
| mid-century | walnut, brass, mustard, olive, teal | tapered legs, organic curves, low-slung |
| japandi | oak, black, stoneware, paper, linen | low, spare, wabi-sabi, calm |
| boho-global | rattan, jute, terracotta, woven cotton | collected, textured, layered, relaxed |
| industrial | blackened steel, reclaimed wood, concrete | exposed, raw, loft, utilitarian |
| maximalist-eclectic | velvet, saturated color, bold pattern, lacquer | playful, bold, more is more |
| coastal | whitewashed wood, linen, rope, soft blue, sand | airy, breezy, light-filled |
| cottage-rustic | pine, stoneware, gingham, wool, cream | cozy, farmhouse, homely |
| art-deco-glam | brass, gold, marble, velvet, jewel tones | fluted, geometric, polished |
| retro-70s | bouclé, chrome, smoked glass, burnt orange, brown | curved, chunky, groovy, warm |
