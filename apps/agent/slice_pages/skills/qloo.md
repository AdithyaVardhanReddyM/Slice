# Using Qloo

Qloo is the cultural taste graph: hundreds of millions of entities (artists, films, shows, books, podcasts, games, places, destinations, brands, people) connected by what the same people love, plus tags that describe them and demographic skews. Every call goes through our cache; nothing here hits Qloo directly. Reference: https://docs.qloo.com (Insights API, Search, Tags).

## The two tools

- `qloo_search(query)` is `/search`: a name to an entity id, with type, image and a note. Ambiguous names rank authors first ("Aesop" the fabulist, "Wes Anderson" as author): pick the result whose type fits (brand, artist, film) and whose name matches exactly, not the first one.
- `qloo_insights(entity_type, ...)` is `/v2/insights`: what people defined by some signals have an affinity for, of one type. Signals are entity ids (`signal_entity_ids`), a place (`location`), an age bucket and a gender. With no `signal_entity_ids` the audience's own taste signals are used, which is usually what you want.

## What to ask for

- Places near an audience: `entity_type "place"`, `location "<city or neighbourhood>"`, `tag_ids ["urn:tag:genre:place:restaurant"]` (or cafe, bar, bakery, hotel, museum, gallery, park tags: `qloo_places` already knows these), signals from the audience. Places and destinations filter by location (`filter.location.query`); every other type uses the location as a taste signal of the people who live there.
- Destinations an audience would travel to: `entity_type "destination"` with entity signals only. Never add a location to a destination query: it returns the towns next to that city.
- Culture for copy, quotes and a culture section: artists, movies, tv_show, books, podcasts from entity signals. The audience detail already carries lists of these; call Qloo only to fill a missing kind or to go deeper on one signal.
- Brands an audience trusts: `entity_type "brand"` from entity signals. Brand results carry their own style words (personal style, lifestyle, emotional tone, industries), useful for the page's tone. With a location signal alone, brand results skew to media and food brands.
- The vocabulary of an audience: `entity_type "tag"` with `tag_types`. Brand-side tags describe what people buy: `urn:tag:personal_style:qloo`, `urn:tag:aesthetic_property:qloo`, `urn:tag:lifestyle:qloo`, `urn:tag:emotional_tone:qloo`, `urn:tag:core_values:qloo`, `urn:tag:customer_identity:qloo`. Media-side tags describe what they watch and listen to: `urn:tag:style:qloo`, `urn:tag:audience:qloo`, `urn:tag:keyword:media`. Ask for one or two types at a time; asking for all at once returns mostly emotional tone and lifestyle words, and asking with no type returns noise (credit-card and amenity tags from places).
- Who an audience is: `entity_type "demographics"` with entity signals returns the age and gender skew of each signal, values from -1 to 1 per bucket (`24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, `55_and_older`; `male`, `female`). Positive means over-represented.

## How to read results

- Affinity values saturate near 1.0 across the top results. The order is the signal; the number is not. Say "ranked by affinity", never quote the decimal.
- Age and gender are reshaping signals, not signals on their own: with only `age` the results do not change. Pair them with entity signals or a location.
- Absence is sparse data, not dislike. If a city returns few results for an act or a brand, say nothing rather than drawing a conclusion.
- Popularity (`popularity`, 0 to 1) tells you whether a name will be recognised; prefer well-known names for hooks in copy and lesser-known ones for a "deep cut" moment, and say which is which.
- Images (`images.qloo.com`) exist for most artists, films and books, rarely for places and destinations; use the brand's own photos or a search for those.
- The same word lives under several tag types (`style:qloo:art_deco` on the media side, `personal_style:qloo:art_deco` on the brand side). Treat them as one idea.

## Limits

- The key rate-limits bursts. Do not fire more than two Qloo calls at once; sequential is safe.
- `bias.trends` and other biasing parameters are not available through these tools, and `filter.results.entities` takes at most 20 ids, so batch when ranking a long list.
- A brand used as a signal is excluded from its own results.

## Citing it

Every section's evidence names the Qloo signal and what it returned: "Qloo: fans of Fred again.. index high on Overmono and Bicep; the lineup leads with them" or "Qloo places in Lisbon ranked by the audience's 12 signals: Kais and the Rua Nova do Carvalho bars". Say "Qloo" or "the taste graph" in the reply to the merchant, at most once or twice.
