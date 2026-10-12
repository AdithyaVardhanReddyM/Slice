# Tágide: audiences and the expected page per audience

The baseline the Pages builder is judged against. One page, **"Tickets 2027"** (goal: ticket purchase; items: the 57 acts, the 3 passes, 3 day tickets, 4 travel packages), one variant per audience plus the default. Everything below says what each section should do for each audience **and why**, with the Qloo evidence that justifies it. Expectations marked ◆ are the ones a judge will notice in the video; a variant that misses them fails even if everything else is fine.

Evidence was taken on 2026-10-12 from the hackathon API: the 57 acts resolved to artist entities, then `filter.type=urn:entity:artist` with `signal.location.query=<city>` or `signal.interests.entities=<brand>`, and `filter.results.entities=<acts>` in batches of 12 (30+ ids return 400); `filter.type=urn:demographics` for the age skew per act. Full per-city and per-brand rankings are in the scratch output; the tables below keep the top ten.

## 1. The audiences

Six, two per source, chosen so that each pair differs on a different axis. Lisbon locals are the **default** variant (the promoter's own page), not an audience.

### Location: who flies in

| Audience | Acts with affinity | Top of the lineup for this city | What that says |
| --- | --- | --- | --- |
| **Berlin** | 45 / 57 | Peggy Gou, Ellen Allien, FKA twigs, Marcel Dettmann, Honey Dijon, Lana Del Rey, Four Tet, Jamie xx, Bicep, Floating Points, DJ Koze | The Armazém, in order. Berlin's top ten is almost exactly the warehouse lineup. Package exists (Thursday out, warm-up included). |
| **São Paulo** | 26 / 57 | Marisa Monte, Lana Del Rey, Ana Frango Elétrico, Marina Sena, Carminho, Peggy Gou, Honey Dijon, Kaytranada, Charli XCX | Brazilian and Portuguese-language acts first. Marisa Monte is second line of the Sunday Jardim on the poster and the number one act for this city. Package exists (six nights, instalments). |

Why these two: they disagree in every section (hero, stage, night, offer, travel, imagery), both have a travel package on the site, and São Paulo carries the "line two on the poster, number one for the city" moment.

### Demographics: who they are

| Audience | Acts that skew towards them (from `urn:demographics`) | What that says |
| --- | --- | --- |
| **Under 25** | Nia Archives, Chappell Roan, Rema, Tyler, the Creator, Asake, Doechii, Fred again.., Folamour, Hozier, Wet Leg | Pop, Afrobeats, jungle and the two youngest headliners. Camping crowd. |
| **35 and over** | Ellen Allien, Carminho, Marcel Dettmann, Honey Dijon, Chris Stapleton, Dino d'Santiago, Fontaines D.C., Four Tet | Two groups inside one audience: the older techno heads and the seated-stage crowd. Hotel and VIP crowd. |

### Brand-affinity audiences: who they shop with ◆

The creative one, and the one that shows what Qloo does that nothing else does. The festival has brand partners, or simply wants to reach people with a known brand affinity (ad interest audiences, a partner's own mailing list). The audience is defined by the brand alone; Qloo's taste graph turns that into a lineup, a stage and a mood.

| Audience | Signal given to Qloo | Top of the lineup for them | What that says |
| --- | --- | --- | --- |
| **Patagonia affinity** | the brand entity, nothing else | Hozier, Bon Iver, Jason Isbell, Chris Stapleton, Bonny Light Horseman, Kacey Musgraves, Big Thief, Waxahatchee, Khruangbin, Beach House | The Jardim stage, almost act for act. Sunset, grass, songwriters. |
| **Nike affinity** | the brand entity, nothing else | Tyler, the Creator, Burna Boy, Kaytranada, Little Simz, Tems, Doechii, Charli XCX, Rema, FKA twigs, Asake | The Ponte tent and Sunday's headliner. Hip-hop, Afrobeats, after dark. |

Neither input names a musician, a genre or a stage; Qloo still returns a coherent stage for each. Dr. Martens (IDLES, Fontaines D.C., Yves Tumor, Wet Leg, Mitski) and Converse (Charli XCX, Rosalía, Chappell Roan) were probed too and work as alternates; Patagonia and Nike give the cleanest split and are brands that already sponsor music. The line for the video: "we never told it a genre."

## 2. The page and what changes per section

Section types are the builder's own (`hero`, `split`, `grid`, `story`, `gallery`, `testimonials`, `stats`, `faq`, `offer`, `locations`, `culture`, `form`, `cta`, `custom`). The default variant is the promoter's page: poster order as printed, three-day pass first, generic travel.

### 2.1 Hero ◆

The act in the headline is the audience's highest-affinity act **that is tier 1 or 2 on the poster** (a 16:00 opener never headlines a page); the second line names the day and stage.

| Audience | Expected hero | Why |
| --- | --- | --- |
| Berlin | Peggy Gou, Friday, with the Armazém named in the subline | Peggy Gou and Ellen Allien lead; the city's taste is the warehouse. |
| São Paulo | Marisa Monte, Sunday, Jardim ◆ | #1 for the city, line two on the poster. The reveal. |
| Under 25 | Tyler, the Creator or Fred again.. | The two headliners that skew young; Chappell Roan and Nia Archives are too low on the bill to carry a hero. |
| 35 and over | Chris Stapleton, Sunday, Tejo (Carminho acceptable for the seated framing) | The only tier-2 act in the older skew with a main-stage slot. |
| Patagonia | Hozier, Sunday, Tejo, with Bon Iver at the Jardim in the subline | Top two for the brand; Hozier is tier 2 on the Tejo. |
| Nike | Tyler, the Creator, Sunday, with Burna Boy or Kaytranada in the subline | Top of the list and the Sunday headliner. |

Imagery: night and strobe for Berlin and Nike; golden hour and the river for 35+ and Patagonia; daylight crowd and confetti for Under 25 and São Paulo. The default keeps the site's own hero collage.

### 2.2 The poster (`custom` or `grid` of the acts) ◆

Same 57 names on every variant, tiered by this audience's affinity rank instead of the booking fee. Evaluation: the variant's top 10 contains at least 7 of Qloo's top 10 for that audience, and acts Qloo drops (no affinity) are never in the top tier.

| Audience | Must be in the top tier | Must not be in the top tier |
| --- | --- | --- |
| Berlin | Peggy Gou, Ellen Allien, Dettmann, Honey Dijon, Four Tet, Jamie xx | Portuguese pop, Kacey Musgraves, Chris Stapleton |
| São Paulo | Marisa Monte, Ana Frango Elétrico, Marina Sena, Carminho | IDLES, Fontaines D.C., Chris Stapleton |
| Under 25 | Nia Archives, Chappell Roan, Rema, Tyler, Asake, Doechii, Fred again.. | Carminho, Dettmann, Stapleton |
| 35 and over | Ellen Allien, Carminho, Dettmann, Honey Dijon, Stapleton, Dino | Chappell Roan, Nia Archives, Rema |
| Patagonia | Hozier, Bon Iver, Isbell, Stapleton, Bonny Light Horseman, Kacey Musgraves, Big Thief | Dettmann, Ellen Allien, Burna Boy, Rema |
| Nike | Tyler, Burna Boy, Kaytranada, Little Simz, Tems, Doechii, Rema | Carminho, Bonny Light Horseman, Jason Isbell |

Why: the poster order is the single most expensive decision a promoter makes and the one they have no data for.

### 2.3 "Your three nights" (`grid` or `culture` of 6–8 acts with day, stage and time)

The top 6–8 by affinity with their set times, grouped by night. Which stage dominates is the test.

- Berlin: six of eight from the Armazém; times after 00:00. Reads like a club listing.
- São Paulo: Jardim and Ponte, 16:00–21:00. Reads like an afternoon.
- Under 25: Ponte and Tejo, late. 35+: Jardim, the early Armazém, Stapleton and Hozier on the Sunday Tejo.
- Patagonia: the Jardim on all three nights (Bon Iver Friday, Khruangbin and Kacey Musgraves Saturday, Big Thief and Isbell Sunday) plus Hozier and Stapleton on the Tejo. Nothing after 23:00.
- Nike: the Ponte (Little Simz, Tems, Doechii, Asake) and the Tejo headliners (Burna Boy, Tyler). Nothing from the Jardim.

Why: proves the builder read the schedule, not just the names. A Berlin strip with afternoon slots is wrong even if the names are right.

### 2.4 "Your night" (`stats` or a line in the hero)

| Audience | Night | Why |
| --- | --- | --- |
| Berlin | Friday or Saturday; Sunday is the weak night | Dettmann Friday, Ellen Allien Saturday; Sunday's Armazém closes early. |
| São Paulo | Sunday (Marisa Monte), Saturday second (Marina Sena) | Both Brazilian acts on the weekend. |
| Under 25 | Sunday | Tyler, Rema, Asake, Hozier on one day. |
| 35 and over | Sunday (Stapleton, Hozier) or Saturday (Carminho, Ellen Allien) | Split; the builder should state its reason. |
| Patagonia | Three-day pass; if one night, Sunday (Hozier, Big Thief, Isbell) | Taste spread across the Jardim's three nights. |
| Nike | Sunday (Tyler, Rema, Asake) with Friday second (Burna Boy, Little Simz) | Two strong nights. |

Why: the day-ticket mix per market is a real revenue lever.

### 2.5 Offer (`offer`)

| Audience | Lead offer | Second | Why |
| --- | --- | --- | --- |
| Berlin | Travel package from Berlin €469 | Three-day pass | The package is built for this crowd: Thursday out, warm-up included. |
| São Paulo | Travel package from São Paulo €1,290, instalments mentioned | Three-day pass | Long-haul buyer; the site offers ten instalments. |
| Under 25 | Three-day pass + camping €245 | Day ticket Sunday | Camping is the young offer. |
| 35 and over | VIP three-day €420 | Three-day pass | River terrace, proper bathrooms, chef's dinner: written for this buyer. |
| Patagonia | Three-day pass €195 | Three-day pass + camping | The Jardim is spread over three nights. |
| Nike | Day ticket Sunday €85 | Three-day pass + camping | Sunday carries the Nike acts. |

Every lead offer exists on the site at that price. The builder must not invent tiers, bundles or discounts.

### 2.6 Getting here (`locations` or `story`)

- Berlin: 3h30 direct, Thursday out; the warm-up; metro red line to Oriente, shuttle.
- São Paulo: 10h overnight direct, land Thursday morning; six nights in the package; transit pass.
- Under 25 / 35+: keep the site's generic block; Under 25 adds the campsite, 35+ the partner hotels.
- Patagonia / Nike: generic block. No flights, no airline names.

All facts from the site's travel page; nothing invented.

### 2.7 Culture strip and social proof (`culture`, `testimonials`)

- Testimonials: lead with the quote from the audience's own world (Lena from Berlin; Rafael from São Paulo; Inês for Under 25, camping; Sophie for 35+, hotel; Camille, "we planned around the Jardim and the sunsets", for Patagonia; Tomás, "the Ponte tent on Saturday was the best crowd", for Nike).
- Culture: 3–4 artists **not on the bill** that the audience loves and that sit near the lineup in Qloo, as "if you like these, this is your festival". Optional for the demographic audiences.

### 2.8 Imagery and tone (every section)

From the audience's style tags (verified 2026-10-11: electronic/pop → *glamour, seductive, trend following*; country/folk → *rugged, western, workwear*; Khruangbin/Kaytranada → *craftsmanship, design focused, sustainability*).

- Berlin, Nike: nocturnal, strobe, haze; short sentences; no exclamation marks.
- São Paulo: daylight, colour, the Ponte tent; Portuguese-language acts named with their origin.
- Under 25: crowd, glitter, campsite at sunrise; playful copy.
- 35 and over: seated Jardim, VIP terrace, hotels; measured copy.
- Patagonia: grass, river, golden hour, the campsite in the morning; plain copy, sustainability facts from the site (free water points, cashless, shuttle) where they fit.

Why: the kit is fixed per brand, so mood can only come from photo choice and copy. Two variants with the same photos are a failure even if the acts differ.

### 2.9 FAQ, footer, contact

Facts never change. FAQ may reorder: camping first for Under 25, access and hotels first for 35+, "from the airport" first for Berlin and São Paulo.

## 3. Scoring a variant

Pass requires both ◆ checks and at least 7 of the others.

1. ◆ Hero act is one of the audience's top-3 tier 1–2 acts (2.1).
2. ◆ Poster top tier: ≥ 7 of Qloo's top 10 present; none of the "must not" acts present (2.2).
3. Night recommendation matches 2.4.
4. Lead offer matches 2.5 and exists on the site at that price.
5. Getting-here uses only facts from the travel page.
6. "Your three nights": ≥ 5 of 8 acts from the audience's top 10, with correct day, stage and time.
7. The right testimonial first (2.7).
8. Imagery differs from the default in the hero and at least one more section, in the direction of 2.8.
9. Copy voice matches 2.8; no invented facts (airlines, discounts, acts, partners).
10. Default variant is the promoter's own order and offers, untouched.
11. "Why this version" cites the Qloo evidence (ranked acts, demographics, the brand signal) for every changed section.
12. Nothing contradicts the site (dates, prices, set times, stage names).

## 4. Known soft spots in the evidence

- Lisbon (the default's city) returns no affinity for Fred again.., Rosalía or Burna Boy: data sparsity, not taste. "No affinity" means "don't promote", never "hide".
- `filter.results.entities` accepts 20 ids and 400s at 30, so the audience compiler batches the lineup and merges by affinity (values saturate near 1.0; merge by rank within batch when in doubt).
- Demographics for 57 signal entities truncates at the probe's 8 KB (35 of 57 came back); the compiler requests them in batches of ~20.
- Entities to re-check before seeding: Pongo, Rema and Bicep are common words; Nídia and Branko may be namesakes.
- Brand signals were given as a single entity each. A brand audience may combine the brand with one more signal (a show, a second brand); Euphoria pairs with Nike and The Bear with Patagonia, both verified to point the same way.
