import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const variantValidator = v.object({
  id: v.string(),
  label: v.string(),
  inStock: v.boolean(),
  priceDelta: v.optional(v.number()),
});

export const attributesValidator = v.object({
  style: v.array(v.string()),
  material: v.array(v.string()),
  colorFamily: v.array(v.string()),
  colors: v.array(v.string()),
  useCase: v.array(v.string()),
  room: v.optional(v.array(v.string())),
  occasion: v.optional(v.array(v.string())),
  fit: v.optional(v.string()),
  season: v.optional(v.array(v.string())),
  priceTier: v.string(),
});

/** One product in a merchant's catalog, in the Slice shape (see docs/demo-stores.md). */
export const productFields = {
  storeKey: v.string(),
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  brand: v.optional(v.string()),
  department: v.optional(v.string()),
  category: v.string(),
  subcategory: v.string(),
  price: v.number(),
  compareAtPrice: v.optional(v.number()),
  description: v.string(),
  details: v.array(v.string()),
  attributes: attributesValidator,
  tags: v.array(v.string()),
  variants: v.array(variantValidator),
  /** Absolute URLs. */
  images: v.array(v.string()),
  /** Absolute product page URL on the merchant's site. */
  url: v.string(),
  rating: v.optional(v.number()),
  reviewCount: v.optional(v.number()),
  bestseller: v.optional(v.boolean()),
  new: v.optional(v.boolean()),
  /** Lower-cased searchable blob of the fields above. */
  text: v.string(),
};

export const storeFields = {
  /** The widget key merchants put in data-slice-key. */
  key: v.string(),
  name: v.string(),
  tagline: v.string(),
  description: v.string(),
  /** Absolute URL of a square mark, shown next to the store name in the concierge. */
  logo: v.optional(v.string()),
  currency: v.string(),
  /** "home" | "fashion" | ... free-form, for the agent's framing. */
  vertical: v.string(),
  siteUrl: v.string(),
  styles: v.array(
    v.object({ id: v.string(), label: v.string(), description: v.string() }),
  ),
  rooms: v.optional(v.array(v.string())),
  brands: v.optional(
    v.array(
      v.object({
        name: v.string(),
        slug: v.string(),
        origin: v.string(),
        description: v.string(),
      }),
    ),
  ),
  departments: v.optional(v.array(v.string())),
  nav: v.array(
    v.object({
      label: v.string(),
      category: v.string(),
      subcategories: v.array(v.string()),
    }),
  ),
  source: v.string(),
  productCount: v.number(),
  updatedAt: v.number(),
};

/** One Qloo call (or catalog/agent step) as the shopper and merchant see it in "why this?". */
export const spanValidator = v.object({
  kind: v.string(),
  name: v.string(),
  /** Wall-clock start (seconds); agent spans can run in parallel. */
  started: v.optional(v.number()),
  path: v.optional(v.string()),
  params: v.optional(v.record(v.string(), v.string())),
  cache: v.optional(v.string()),
  ms: v.number(),
  /** One-line summary of what came back. */
  result: v.string(),
});

export const entityRefValidator = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  image: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  lat: v.optional(v.number()),
  lon: v.optional(v.number()),
  /** "questionnaire" | "free_text" | "chat" */
  source: v.string(),
});

export const tasteTagValidator = v.object({
  id: v.string(),
  name: v.string(),
  /** Qloo subtype, e.g. "urn:tag:personal_style:qloo". */
  type: v.string(),
  affinity: v.number(),
});

export const tasteBrandValidator = v.object({
  id: v.string(),
  name: v.string(),
  affinity: v.number(),
  image: v.optional(v.string()),
  personalStyle: v.array(v.string()),
  lifestyle: v.array(v.string()),
  keywords: v.array(v.string()),
  emotionalTone: v.array(v.string()),
  industries: v.array(v.string()),
  /** Which input entities drove this brand (feature.explainability). */
  explain: v.array(v.object({ entityId: v.string(), score: v.number() })),
  /** True when the merchant carries this brand. */
  inStore: v.boolean(),
});

export const briefValidator = v.object({
  summary: v.string(),
  styles: v.array(
    v.object({ id: v.string(), weight: v.number(), because: v.string() }),
  ),
  palette: v.array(v.string()),
  materials: v.array(v.string()),
  avoid: v.array(v.string()),
});

// ---------------------------------------------------------------------------
// Pages: taste-personalized landing pages built from a merchant's website.

/** A brand kit read from the merchant's site: identity, look and voice. */
export const brandKitValidator = v.object({
  name: v.string(),
  tagline: v.string(),
  description: v.string(),
  vertical: v.string(),
  audience: v.string(),
  offer: v.string(),
  valueProps: v.array(v.string()),
  voice: v.object({ tone: v.array(v.string()), summary: v.string() }),
  /** Absolute http(s) URL or a data:image/svg+xml URI lifted from inline SVG. */
  logo: v.optional(v.string()),
  icon: v.optional(v.string()),
  images: v.array(v.string()),
  colors: v.object({
    primary: v.string(),
    accent: v.string(),
    background: v.string(),
    text: v.string(),
    /** Every brand colour found on the site, most used first. */
    palette: v.array(v.string()),
  }),
  fonts: v.object({ heading: v.optional(v.string()), body: v.optional(v.string()) }),
});

/** What Qloo knows about the brand's audience. */
export const brandTasteValidator = v.object({
  /** The brand's own Qloo entity, when Qloo knows it. */
  qlooBrand: v.optional(entityRefValidator),
  /** Qloo entities the audience is into (the brand, similar brands, cultural seeds). */
  entities: v.array(entityRefValidator),
  tags: v.array(tasteTagValidator),
  demographics: v.optional(v.any()),
});

export const pageSectionValidator = v.object({
  id: v.string(),
  /** "hero" | "benefits" | "story" | "products" | "fit" | "faq" | "cta" */
  kind: v.string(),
  eyebrow: v.optional(v.string()),
  heading: v.string(),
  body: v.optional(v.string()),
  image: v.optional(v.string()),
  cta: v.optional(v.object({ label: v.string(), href: v.string() })),
  secondaryCta: v.optional(v.object({ label: v.string(), href: v.string() })),
  items: v.optional(
    v.array(
      v.object({
        title: v.string(),
        body: v.optional(v.string()),
        image: v.optional(v.string()),
        href: v.optional(v.string()),
        price: v.optional(v.string()),
      }),
    ),
  ),
});

/** One audience variant of a page: a Qloo taste cluster and the copy written for it. */
export const pageSegmentValidator = v.object({
  id: v.string(),
  name: v.string(),
  /** Who these visitors are, in a sentence. */
  summary: v.string(),
  /** How their Qloo taste shaped this variant, for the merchant. */
  why: v.string(),
  isDefault: v.boolean(),
  /** The Qloo entities that define the segment. */
  anchors: v.array(entityRefValidator),
  tags: v.array(tasteTagValidator),
  demographics: v.optional(v.any()),
  /** utm_campaign / utm_term / utm_content words that route a visitor here. */
  utmKeywords: v.array(v.string()),
  accent: v.optional(v.string()),
  seo: v.object({ title: v.string(), description: v.string() }),
  sections: v.array(pageSectionValidator),
});

export const cityFitValidator = v.object({
  city: v.string(),
  segmentId: v.string(),
  score: v.number(),
  /** The city's Qloo tags that matched the segment. */
  matched: v.array(v.string()),
});

export default defineSchema({
  brands: defineTable({
    /** Clerk subject of the merchant. */
    ownerId: v.string(),
    url: v.string(),
    domain: v.string(),
    /** "extracting" | "ready" | "failed" */
    status: v.string(),
    progress: v.optional(v.string()),
    error: v.optional(v.string()),
    kit: v.optional(brandKitValidator),
    taste: v.optional(brandTasteValidator),
    trace: v.array(spanValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  pages: defineTable({
    ownerId: v.string(),
    brandId: v.id("brands"),
    slug: v.string(),
    name: v.string(),
    /** "leads" | "sales" | "signup" | "booking" */
    goal: v.string(),
    brief: v.object({
      offer: v.string(),
      audience: v.optional(v.string()),
      ctaLabel: v.string(),
      ctaUrl: v.string(),
      notes: v.optional(v.string()),
    }),
    /** A Slice store whose products fill each variant, ranked for its taste. */
    storeKey: v.optional(v.string()),
    segmentCount: v.number(),
    /** "generating" | "ready" | "failed" */
    status: v.string(),
    progress: v.optional(v.string()),
    error: v.optional(v.string()),
    published: v.boolean(),
    segments: v.array(pageSegmentValidator),
    /** Which variant each city's taste is closest to (pageRouting.ts). */
    cityMap: v.array(cityFitValidator),
    trace: v.array(spanValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"]),

  pageEvents: defineTable({
    pageId: v.id("pages"),
    segmentId: v.string(),
    /** "view" | "cta" | "quiz" */
    type: v.string(),
    visitorId: v.string(),
    /** Why the visitor got this variant: "quiz" | "profile" | "utm" | "geo" | "default" | "link". */
    source: v.string(),
    city: v.optional(v.string()),
    at: v.number(),
  }).index("by_page", ["pageId"]),

  // Private read-through cache of Qloo responses (see qloo.ts). The hackathon
  // key is rate limited and Qloo data must not be redistributed, so it lives
  // here and never in the repo.
  qlooCache: defineTable({
    /** SHA-256 of `request`; requests with many entity IDs get too long to index. */
    hash: v.string(),
    /** "/search?query=Bon+Iver&types=urn%3Aentity%3Aartist", for reading in the dashboard. */
    request: v.string(),
    /** Raw JSON. Stored as text because Qloo's keys aren't all valid Convex field names. */
    body: v.string(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_hash", ["hash"]),

  stores: defineTable(storeFields).index("by_key", ["key"]),

  products: defineTable(productFields)
    .index("by_store", ["storeKey"])
    .index("by_store_id", ["storeKey", "id"])
    .index("by_store_slug", ["storeKey", "slug"]),

  // Each product described in Qloo's own tag vocabulary (catalogTaste.ts), so
  // a shopper's Qloo tags can be matched to products by id rather than by
  // substring. Kept apart from `products` so a catalog re-import keeps it.
  productTaste: defineTable({
    storeKey: v.string(),
    productId: v.string(),
    tags: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        type: v.string(),
        weight: v.number(),
        /** "llm" (read from the product copy) or "brand" (inherited from the brand's Qloo entity). */
        source: v.string(),
      }),
    ),
    /** Hash of the product text the tags were derived from; a changed product is re-tagged. */
    fingerprint: v.string(),
    updatedAt: v.number(),
  })
    .index("by_store", ["storeKey"])
    .index("by_store_product", ["storeKey", "productId"]),

  // A shopper's taste profile: what they told us, what Qloo made of it, and
  // the agent's translation into the store's own vocabulary.
  tasteProfiles: defineTable({
    storeKey: v.string(),
    city: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    answers: v.array(
      v.object({
        domain: v.string(),
        question: v.string(),
        choice: v.string(),
        entityId: v.optional(v.string()),
      }),
    ),
    entities: v.array(entityRefValidator),
    tags: v.array(tasteTagValidator),
    brands: v.array(tasteBrandValidator),
    /** Qloo's age/gender skew for the signal set, -1..1 per bucket. */
    demographics: v.optional(v.any()),
    /** Deterministic first pass: Qloo terms matched against the store's style vocabulary. */
    hints: v.object({
      styles: v.array(
        v.object({
          id: v.string(),
          score: v.number(),
          from: v.array(v.string()),
        }),
      ),
      terms: v.array(
        v.object({ term: v.string(), weight: v.number(), from: v.string() }),
      ),
    }),
    /** The agent's reading of the profile in the store's language. */
    brief: v.optional(briefValidator),
    trace: v.array(spanValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_store", ["storeKey"]),

  conversations: defineTable({
    sessionId: v.string(),
    storeKey: v.string(),
    profileId: v.optional(v.id("tasteProfiles")),
    messages: v.array(
      v.object({
        id: v.string(),
        role: v.string(),
        at: v.number(),
        text: v.string(),
        page: v.optional(v.string()),
        picks: v.optional(v.any()),
        trace: v.optional(v.array(spanValidator)),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_store", ["storeKey"]),
});
