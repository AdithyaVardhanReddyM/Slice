// Qloo's audience segments (`/v2/audiences`), the "lifestyle" condition of a
// custom audience. Ids are the `urn:audience:…` URNs Qloo takes as
// `signal.demographics.audiences` (the UUID `entity_id` is silently ignored).
// Listed from the live API on 2026-10-14; names are rewritten in sentence case.
//
// Left out on purpose: the communities family (ethnicity, sexuality), political
// preferences, religions and identity-linked causes. Targeting pages by those
// is not something a merchant should be able to do.

export interface SegmentFamily {
  key: string;
  label: string;
}

export interface Segment {
  id: string;
  name: string;
  family: string;
}

export const SEGMENT_FAMILIES: SegmentFamily[] = [
  { key: "hobbies_and_interests", label: "Hobbies" },
  { key: "leisure", label: "Leisure" },
  { key: "life_stage", label: "Life stage" },
  { key: "spending_habits", label: "Spending" },
  { key: "lifestyle_preferences_beliefs", label: "Lifestyle" },
  { key: "global_issues", label: "Causes" },
  { key: "professional_area", label: "Work" },
  { key: "investing_interests", label: "Investing" },
];

const seg = (family: string, slug: string, name: string): Segment => ({ id: `urn:audience:${family}:${slug}`, name, family });

export const SEGMENTS: Segment[] = [
  ...(
    [
      ["sneakerheads", "Sneakerheads"],
      ["street_fashion", "Street fashion"],
      ["high_fashion", "High fashion"],
      ["video_gamer", "Video gamers"],
      ["musician", "Musicians"],
      ["photography", "Photography"],
      ["travel", "Travel"],
      ["adventuring", "Adventuring"],
      ["outdoors", "Outdoors"],
      ["hiking", "Hiking"],
      ["running", "Running"],
      ["yoga", "Yoga"],
      ["meditation", "Meditation"],
      ["health_and_beauty", "Health and beauty"],
      ["perfume", "Perfume"],
      ["jewellery", "Jewellery"],
      ["watches", "Watches"],
      ["tattoos", "Tattoos"],
      ["home_decor", "Home decor"],
      ["home_organization", "Home organisation"],
      ["architecture", "Architecture"],
      ["arts_crafts", "Arts and crafts"],
      ["wine_enthusiast", "Wine enthusiasts"],
      ["dance", "Dance"],
      ["basketball", "Basketball"],
      ["soccer", "Soccer"],
      ["american_football", "American football"],
      ["baseball", "Baseball"],
      ["hockey", "Hockey"],
      ["tennis", "Tennis"],
      ["golf", "Golf"],
      ["swimming", "Swimming"],
      ["martial_arts", "Martial arts"],
      ["wrestling", "Wrestling"],
      ["fishing", "Fishing"],
      ["automotive", "Cars"],
      ["motorcycles", "Motorcycles"],
      ["racing", "Racing"],
      ["adrenaline_rushers", "Adrenaline rushers"],
      ["casual_escapists", "Casual escapists"],
      ["secret_unravelers", "Mystery lovers"],
      ["spy_enthusiast", "Spy fans"],
    ] as const
  ).map(([slug, name]) => seg("hobbies_and_interests", slug, name)),
  ...(
    [
      ["foodie", "Foodies"],
      ["cooking", "Cooking"],
      ["coffee", "Coffee"],
      ["music_festivals", "Music festivals"],
      ["cinephile", "Cinephiles"],
      ["arts_culture", "Arts and culture"],
      ["museums", "Museums"],
      ["avid_reader", "Avid readers"],
      ["exercising", "Exercise"],
      ["news_junkie", "News junkies"],
    ] as const
  ).map(([slug, name]) => seg("leisure", slug, name)),
  ...(
    [
      ["single", "Single"],
      ["engaged", "Engaged"],
      ["parents_with_young_children", "Parents with young children"],
      ["retirement", "Retired"],
    ] as const
  ).map(([slug, name]) => seg("life_stage", slug, name)),
  ...(
    [
      ["gourmand_fine_dining", "Fine dining"],
      ["boutique_hotels", "Boutique hotels"],
      ["vintage_apparel", "Vintage clothing"],
      ["watch_collecting", "Watch collecting"],
      ["technology_enthusiast", "Tech enthusiasts"],
      ["discount_shoppers", "Bargain hunters"],
    ] as const
  ).map(([slug, name]) => seg("spending_habits", slug, name)),
  ...(
    [
      ["healthy_eating", "Healthy eating"],
      ["organic_ingredients", "Organic food"],
      ["veganism", "Vegan"],
      ["spirituality", "Spirituality"],
      ["astrology", "Astrology"],
    ] as const
  ).map(([slug, name]) => seg("lifestyle_preferences_beliefs", slug, name)),
  ...(
    [
      ["sustainability", "Sustainability"],
      ["climate_activism", "Climate action"],
      ["ocean_health", "Ocean health"],
      ["animal_issues", "Animal welfare"],
      ["mental_health", "Mental health"],
      ["education_issues", "Education"],
      ["fair_wages", "Fair wages"],
    ] as const
  ).map(([slug, name]) => seg("global_issues", slug, name)),
  ...(
    [
      ["advertising_design", "Design and advertising"],
      ["technology_professional", "Tech"],
      ["marketing_professional", "Marketing"],
      ["business_professional", "Business"],
      ["finance_professional", "Finance"],
      ["sales_professional", "Sales"],
      ["retail_professional", "Retail"],
      ["hospitality_professional", "Hospitality"],
      ["medical_professional", "Medicine"],
    ] as const
  ).map(([slug, name]) => seg("professional_area", slug, name)),
  ...(
    [
      ["stocks_bonds", "Stocks and bonds"],
      ["real_estate", "Real estate"],
      ["art_collectibles", "Art and collectibles"],
      ["angel_start_up_investing", "Startup investing"],
      ["cryptocurrency_enthusiasts", "Crypto"],
      ["nft_collectors", "NFT collectors"],
    ] as const
  ).map(([slug, name]) => seg("investing_interests", slug, name)),
];

export const SEGMENT_BY_ID = new Map(SEGMENTS.map((s) => [s.id, s]));
