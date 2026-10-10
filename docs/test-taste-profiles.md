# Test taste profiles

Hand-built shoppers to try the concierge with on the two demo stores. Each one
lists the questionnaire answers to pick (or type), what Qloo should read into
them, and which shelves the picks should land on. If a profile lands somewhere
else, that's a tuning bug, not a taste difference.

How to run one: open the store (`/fold` or `/marlow` on localhost:3002), hit the
launcher, **Tune to my taste**, pick the city, then choose the closest option on
each screen (or type the name in "Something else…"). Add the extras on the last
screen. Then let the opener run, and try the follow-up prompts.

The questionnaire options come from Qloo per city, so the exact cards differ;
typing the names works everywhere.

---

## Fold (fashion, 24 brands)

### 1. Quiet naturalist · New York City

- Music: **Bon Iver** · Screen: **The Bear** · Books: *Norwegian Wood* · Going out: a quiet wine bar (type "natural wine bar") · Extra: **Wes Anderson**
- Qloo should read: utilitarian / minimalist personal style, brand affinities for Huckberry, Filson, Allbirds; of Fold's brands: Patagonia, Carhartt WIP, Snow Peak, Norse Projects.
- Expect: `heritage-workwear` and `quiet-minimal` on top, a touch of `gorpcore-outdoor`. Picks spread across Burnside Canvas, Snow Peak, Carhartt WIP, Norse Projects, Studio Nicholson. Earth tones, waxed canvas, wool. Not SEOM graphics, not Hedda Vang florals.
- Follow-ups: "Something for a rainy commute" → Torrentshell / Norse shell, not a fleece. "I also love Kendrick Lamar" → brief shifts toward streetwear; the agent should say what changed.

### 2. Loud and online · Los Angeles

- Music: **Kendrick Lamar** · Screen: **Euphoria** · Books: anything YA or skip · Going out: a rooftop bar · Extra: **Virgil Abloh** (or "Off-White")
- Qloo should read: streetwear enthusiasts, skate culture, bold / energizing tone; brand affinities Nike, Adidas, New Balance.
- Expect: `streetwear` first, `y2k-retro` and `athletic` behind. Picks should mix Nike / Adidas with SEOM (the fictional Seoul label). If every pick is Nike, brand is carrying the recommendation and that's a bug.
- Follow-ups: "Under $100" → budget tier only. "Something my mum would like" → the agent should ask or pivot, not guess.

### 3. Trail to town · Berlin

- Music: **Fleet Foxes** · Screen: *Alone* or *Our Planet* (type) · Books: *The Overstory* · Travel: **Patagonia** (the place) · Extra: **Salomon**
- Qloo should read: outdoorsy, functional, adventurous; brand affinities Patagonia, Salomon, Arc'teryx-type brands.
- Expect: `gorpcore-outdoor` dominant, `heritage-workwear` second. Salomon XT-6, Patagonia shells and fleece, Snow Peak, Burnside Canvas field bag. Oranges and olives.
- Follow-ups: "Show me shoes" → trail runners first, Dr. Martens 1460 second at most. "What goes with the fleece?" → companions from other subcategories.

### 4. Campus classic · London

- Music: **Taylor Swift** · Screen: **Gilmore Girls** · Books: *Pride and Prejudice* · Going out: a bakery or tearoom · Extra: **Ralph Lauren**
- Qloo should read: classic, preppy, romantic, nostalgic; brand affinities J.Crew, Madewell, Anthropologie.
- Expect: `preppy-ivy` first, `romantic-boho` second. Cranmore oxfords and cable knits, Malha Lisboa knitwear, Hedda Vang poplin, penny loafers. Navy, cream, forest green.
- Follow-ups: "Women's only" → department filter sticks for later turns. "Something less sweet" → the agent should drop romantic-boho and say so.

### 5. All black · Berlin

- Music: **Nine Inch Nails** (or *Boy Harsher*) · Screen: **The Northman** or *Twin Peaks* · Books: *Frankenstein* · Going out: Berghain (type) · Extra: **Rick Owens**
- Qloo should read: dark, edgy, rebellious, alternative; brand affinities Dr. Martens, All Saints-type labels.
- Expect: `dark-gothic` dominant, `streetwear` or `quiet-minimal` second. Asche (the fictional Berlin label) should carry most picks, Dr. Martens for boots. Palette: black, charcoal, silver hardware. Nothing coastal, nothing preppy.

### 6. Linen and salt · Sydney (or Paris)

- Music: **Khruangbin** · Screen: *Call Me by Your Name* · Books: *The Talented Mr. Ripley* · Travel: **Mallorca** or Lisbon · Extra: **Aesop**
- Qloo should read: laid-back, coastal, sophisticated, Mediterranean; brand affinities Faherty, Birkenstock, Veja.
- Expect: `coastal-resort` first, `quiet-minimal` second. Sóller linen, Birkenstock Arizonas, raffia bag, Ferrant fragrance. Sand, white, faded blue.
- Follow-ups: "Men's, size M, for a wedding in June" → linen shirt + trousers, dress shoe or espadrille.

---

## Marlow (home & living, house brand only)

Marlow has no brands for Qloo to match, so these profiles test the pure path:
Qloo tags → style brief → descriptions.

### 7. Warm and collected · Paris

- Music: **Fleetwood Mac** · Screen: **The Grand Budapest Hotel** · Books: *A Moveable Feast* · Going out: a bistro · Extra: **Wes Anderson**
- Qloo should read: nostalgic, eclectic, warm, artistic; brand affinities Anthropologie, Le Creuset, West Elm.
- Expect: `retro-70s` and `maximalist-eclectic` on top, `art-deco-glam` third. Picks: patterned textiles, brass, burnt orange, bouclé, smoked glass. Not oak-and-white scandi.
- Follow-ups: "Living room, under $300" → room + budget filters hold. "Something for a dinner party" → tableware and glassware.

### 8. Scandi quiet · Tokyo (or Toronto)

- Music: **Bon Iver** · Screen: **The Bridge** (type) · Books: *Norwegian Wood* · Travel: **Kyoto** · Extra: **Muji**
- Qloo should read: minimalist, calm, nature, craftsmanship.
- Expect: `japandi` and `scandi-minimal` dominant. Oak, linen, stoneware, matte black. Picks across Living, Kitchen & dining, Lighting.
- Follow-ups: "A desk for a small apartment" → Workspace, `useCase` small apartment. "Any colour?" → palette from the brief (natural, clay, charcoal).

### 9. Hosting, loudly · Los Angeles

- Music: **Beyoncé** · Screen: **Bridgerton** · Books: *Crazy Rich Asians* · Going out: a cocktail bar · Extra: **Jonathan Adler**
- Qloo should read: glamorous, bold, luxurious, social.
- Expect: `art-deco-glam` first, `maximalist-eclectic` second. Velvet, brass, marble, mirrors, a bar cart if there is one, jewel tones.
- Follow-ups: "Make it more subtle" → the agent should shift weight to mid-century or scandi and say so.

### 10. Farmhouse weekend · Toronto

- Music: **The Lumineers** · Screen: *Little Women* (2019) · Books: *Braiding Sweetgrass* · Going out: a farmers market (type) · Extra: **Patagonia**
- Qloo should read: rustic, cozy, natural, outdoorsy, family-oriented.
- Expect: `cottage-rustic` first, `boho-global` second. Pine, stoneware, wool throws, gingham, planters.
- Follow-ups: "Kitchen things for a gift under $60" → budget tier in Kitchen & dining.

---

## What to check on every run

1. **"How I chose these" is real.** Qloo calls with cache status, the catalog ranking line, the brief step, the picks step. Nothing invented.
2. **Qloo is load-bearing.** The brief's "because" lines cite Qloo tags or brand affinities, not just the names you typed. Open **Your taste** and check the brand list: the starred brands (carried in store) should match the picks' brands more often than not.
3. **No popularity.** Picks should not cluster on `bestseller` or `new` items. (Compare with the store's own home page rails.)
4. **Spread across labels.** On Fold, at least one pick from a fictional label (Burnside Canvas, SEOM, Asche, Cranmore, Hedda Vang, Malha Lisboa, Sóller, Ferrant) in most runs.
5. **Product page context.** Open a product in the store with the widget open: the next opener should speak to that product (fit or not) and offer alternatives.
6. **New signal in chat.** "I also love X" must change the brief and the next picks, with one clause saying what changed.
