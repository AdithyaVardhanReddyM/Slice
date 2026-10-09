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

## Store: Fold (`src/fold/`)

Multi-brand fashion & lifestyle store (think END., SSENSE, Goodhood). Read
`src/fold/store.json` for the style axis, the 24 brands (with what each one makes) and the
category/subcategory tree. Use those exact strings, including `brand` names exactly as
written there ("Levi's", "Dr. Martens", "Sóller", "SEOM").

The point of this store: **the agent must recommend equally well across real and made-up
labels.** If a taste profile always lands on Nike and Patagonia, recommendations are
leaning on brand. So the fictional labels get just as much catalog weight and just as
rich copy as the famous ones.

| group | brands |
|---|---|
| well-known | Nike, Adidas, New Balance, Levi's, Carhartt WIP, Patagonia, Dr. Martens, Birkenstock |
| real, niche | Norse Projects, Veja, Arket, Snow Peak, Salomon, Studio Nicholson, Pangaia, Kapital |
| fictional | Malha Lisboa, SEOM, Burnside Canvas, Hedda Vang, Asche, Cranmore, Sóller, Ferrant |

The groups are for authoring only; never mention them in copy. Write fictional labels as
if they're real and established.

### Hard rules

- `id`: `fd-<cat>-<nn>` with category codes `top`, `bot`, `out`, `dre`, `ftw`, `bag`,
  `acc`, `grm`, `lif`. `slug`: kebab-case of brand + name ("seom-static-oversized-tee"),
  unique across the store.
- `brand`: required, one of the 24. Only give a brand products it would really make
  (Birkenstock: sandals, clogs, skin care; Ferrant: fragrance, grooming, candles; Kapital:
  denim, boro, bandanas; Snow Peak: camp gear and outdoor apparel). Within a file, all three
  groups appear, no single brand is more than ~25% of the file, and **fictional labels are
  at least a third of every apparel/footwear file.**
- `department`: `women`, `men` or `unisex`. Mix them: roughly 40% women, 35% men, 25%
  unisex across apparel; footwear, bags, accessories, grooming and lifestyle lean unisex.
- `attributes.style`: 1–2 ids from `store.json`. In **Tops, Bottoms, Outerwear, Footwear
  and Accessories every one of the 10 styles must appear**; in the smaller categories at
  least 5. Spread them: taste should change *which* jacket gets recommended, not just
  which category. A brand can cross styles (New Balance is athletic *and* quiet-minimal
  *and* preppy) — that's realistic and it's what stops brand from standing in for taste.
- No `room`. Instead: `fit` (`relaxed` | `regular` | `slim` | `oversized`) on everything
  worn; omit it on fragrance, lifestyle, bags. `occasion` (1–3: "everyday", "office",
  "weekend", "date night", "festival", "travel", "hiking", "running", "gym", "beach",
  "wedding guest", "campus", "night out", "commute", "camping") and `season` (1–4:
  "spring", "summer", "fall", "winter", or "all-season") on every product.
- `attributes.colorFamily`: 1–2 from the `ColorFamily` union. `colors`: specific names
  ("ecru", "washed black", "olive", "navy", "fog grey", "faded indigo", "cream").
- `attributes.priceTier`: budget < $75, mid $75–$250, premium > $250. Mix tiers.
- `variants`: sizes. Apparel `XS`–`XL` (womenswear) / `S`–`XXL` (menswear) / `XS`–`XL`
  (unisex); jeans and trousers waist sizes (`W26`…`W34` / `W28`…`W38`); shoes `EU 36`…`EU 46`
  (5–7 sizes); accessories and bags `One size` or a couple of colors; fragrance volumes
  (`50 ml`, `100 ml` with `priceDelta`). Variant ids `<product id>-<kebab label>`. About
  one variant in eight is `inStock: false`. A color choice goes in the product name or
  colors, not as variants alongside sizes.
- `compareAtPrice` on ~12%, `bestseller` on ~10%, `new` on ~12%. `rating` 3.8–4.9 with a
  plausible `reviewCount` (0–1,200, skewed low; famous models get more).
- `imageQuery`: 3–6 word stock-photo search for a representative photo of *the item*,
  ideally worn or on a plain background: "cream cable knit sweater woman", "black leather
  combat boots", "linen shirt man beach". For the real brands you may name the brand or
  model ("new balance grey suede sneakers", "birkenstock arizona sandals"); for fictional
  labels describe the garment only. `images`: `[]`.
- `tags`: 3–6 lowercase merchant tags ("heavyweight", "selvedge", "made in portugal",
  "gift", "recycled").

### Writing the copy

- **Names**: how the brand would really name it. Real brands use their real model names
  where one exists (Levi's 501 Original Jeans, Adidas Samba OG, Patagonia Retro-X Fleece
  Jacket, Carhartt WIP Detroit Jacket, Dr. Martens 1460 Boot, Salomon XT-6). Fictional
  labels get their own naming system (Malha Lisboa names pieces after Lisbon
  neighborhoods; SEOM uses short English words; Cranmore uses New England towns, etc.).
  The `name` field never includes the brand.
- **Description**: 2–3 sentences, present tense, concrete: fabric and weight, cut and
  fit, color and finish, how it wears and what it goes with or suits. Use the mood words
  a shopper would (relaxed, sharp, soft, moody, sporty, romantic, utilitarian). No
  exclamation marks, no "elevate", no "wardrobe staple", no "must-have".
- **Details**: 3–6 bullets: composition ("100% organic cotton, 280 gsm"), fit notes
  ("Boxy fit; size down for a closer cut", "Model is 5'10\" and wears M"), measurements
  for bags, closures, care, country of making.
- **Prices**: realistic 2026 retail. Tees $30–110, shirts $70–240, knitwear $90–420, hoodies
  $70–180, jeans $90–290, trousers $85–320, shorts $40–120, skirts $60–220, jackets
  $120–550, coats $280–650, shells/fleece $90–420, dresses $80–380, sneakers $95–220, boots
  $150–340, sandals $50–160, dress shoes $140–300, bags $35–420, hats $25–75, eyewear
  $90–260, jewelry $40–260, belts $40–140, socks/scarves $12–150, fragrance $60–210,
  skin/hair $18–65, lifestyle $14–120. Whole dollars ending in 0, 5 or 8.

### Style cues

| style | materials & colors | shapes & words |
|---|---|---|
| streetwear | heavyweight cotton, nylon, graphics, black, bold color | oversized, boxy, loud, cargo |
| gorpcore-outdoor | ripstop, fleece, Gore-Tex-type shells, olive, orange, earth | technical, packable, trail |
| quiet-minimal | wool, cotton poplin, cashmere, ecru, grey, navy, black | relaxed, clean, no logo, considered |
| heritage-workwear | duck canvas, selvedge denim, waxed cotton, leather, brown, indigo | rugged, chore, double-knee, breaks in |
| athletic | technical jersey, mesh, nylon, white, bright accents | sporty, breathable, track, court |
| preppy-ivy | oxford cloth, lambswool, cable knit, tweed, navy, cream, green | crisp, pleated, rugby stripe, loafer |
| romantic-boho | cotton voile, crochet, broderie, florals, cream, rose | puff sleeve, smocked, flowy, soft |
| y2k-retro | stretch, metallics, baby tees, low-rise, pastel, chrome | slim, cropped, shiny, early-2000s |
| dark-gothic | black leather, drape jersey, silver, washed black | long, layered, moody, heavy hardware |
| coastal-resort | linen, raffia, jute, stripes, white, sand, sky blue | loose, breezy, sun-faded, salt air |
