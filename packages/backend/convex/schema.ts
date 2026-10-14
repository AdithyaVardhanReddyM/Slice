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

export default defineSchema({
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

  /* Pages service ----------------------------------------------------------
     Independent of the concierge tables: a Pages client is a brand, not a
     store. Section documents, kits and profiles use the shapes in
     pagesTypes.ts and are stored as v.any(). */

  pagesBrands: defineTable({
    /** URL-safe, unique; also the subdomain: {slug}.pages.<host>. */
    slug: v.string(),
    name: v.string(),
    /** The name is a placeholder guessed from the URL; the intake replaces it with the one read from the site. */
    nameFromSite: v.optional(v.boolean()),
    url: v.string(),
    /** "extracting" | "review" | "ready" | "failed" */
    status: v.string(),
    /** 0..1 while extracting, with a short label for the current step. */
    progress: v.optional(v.object({ value: v.number(), label: v.string() })),
    /** BrandKit */
    kit: v.optional(v.any()),
    /** BrandBrief */
    brief: v.optional(v.any()),
    /** What Qloo knows about the brand (or about the brands it resembles). */
    qloo: v.optional(
      v.object({
        entityId: v.optional(v.string()),
        entityName: v.optional(v.string()),
        matched: v.boolean(),
        /** Brands used as proxies when the brand itself is not a Qloo entity. */
        proxies: v.array(v.object({ id: v.string(), name: v.string(), image: v.optional(v.string()) })),
        tags: v.array(v.any()),
        similarBrands: v.array(v.object({ id: v.string(), name: v.string(), image: v.optional(v.string()) })),
        demographics: v.optional(v.any()),
      }),
    ),
    screenshot: v.optional(v.string()),
    /** The homepage as captured for the builder: a permanent screenshot, the markup, its images and a written read of its look. */
    site: v.optional(
      v.object({
        /** Full-page screenshot in Convex storage. */
        screenshot: v.optional(v.string()),
        /** Above-the-fold screenshot (1440x900) in Convex storage. */
        fold: v.optional(v.string()),
        /** Cleaned homepage markup, in Convex storage. */
        htmlUrl: v.optional(v.string()),
        /** Photos on the homepage the builder may reuse. */
        images: v.array(v.object({ src: v.string(), alt: v.string() })),
        /** How the site looks and is built, written by a vision pass. */
        anatomy: v.optional(v.string()),
        capturedAt: v.number(),
        error: v.optional(v.string()),
      }),
    ),
    /** URLs the intake read. */
    crawled: v.array(v.string()),
    trace: v.array(spanValidator),
    error: v.optional(v.string()),
    /** Clerk subject of the merchant whose console lists it. Unset on brands made by scripts, which no console shows. */
    owner: v.optional(v.string()),
    /**
     * A demo brand: badged in the console and never deleted. A demo without
     * `demoOf` is a master; every other account gets a copy of it (pagesDemo.ts).
     */
    demo: v.optional(v.boolean()),
    /** The master this copy was made from. */
    demoOf: v.optional(v.id("pagesBrands")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["owner"])
    .index("by_demo", ["demo", "demoOf"]),

  pagesAudiences: defineTable({
    brandId: v.id("pagesBrands"),
    name: v.string(),
    slug: v.string(),
    /** "default" | "location" | "demographic" | "interests" | "custom" | "csv" | "lead" | "people" */
    kind: v.string(),
    /** How it was defined; the compiler reads this. A custom audience combines any of these. */
    sources: v.object({
      location: v.optional(v.object({ city: v.string(), country: v.optional(v.string()) })),
      /** One age band in `age`, or several in `ages`. */
      demographics: v.optional(v.object({ age: v.optional(v.string()), ages: v.optional(v.array(v.string())), gender: v.optional(v.string()) })),
      /** Free text or names the merchant typed. */
      interests: v.optional(v.array(v.string())),
      /** Qloo entities the merchant picked from suggestions; compiled as-is, no name search. */
      interestEntities: v.optional(v.array(v.object({ id: v.string(), name: v.string(), type: v.string(), image: v.optional(v.string()) }))),
      /** Qloo audience segments (`urn:audience:…`): lifestyle, life stage, hobbies. See pagesSegments.ts. */
      segments: v.optional(v.array(v.object({ id: v.string(), name: v.string() }))),
      /** Qloo genre tags (`urn:tag:genre:…`). */
      tags: v.optional(v.array(v.object({ id: v.string(), name: v.string(), type: v.optional(v.string()) }))),
      uploadId: v.optional(v.id("pagesUploads")),
      cluster: v.optional(v.number()),
      memberId: v.optional(v.id("pagesMembers")),
    }),
    /** "compiling" | "ready" | "failed" */
    status: v.string(),
    progress: v.optional(v.object({ value: v.number(), label: v.string() })),
    /** AudienceProfile */
    profile: v.optional(v.any()),
    /** AudienceBrief, written by the agent. */
    brief: v.optional(v.any()),
    /** Members for CSV clusters and customer lists; 1 for a lead; estimated reach otherwise. */
    size: v.number(),
    trace: v.array(spanValidator),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_slug", ["brandId", "slug"]),

  pagesUploads: defineTable({
    brandId: v.id("pagesBrands"),
    filename: v.string(),
    columns: v.array(v.string()),
    rowCount: v.number(),
    /** "resolving" | "clustering" | "ready" | "failed" */
    status: v.string(),
    progress: v.optional(v.object({ value: v.number(), label: v.string() })),
    /**
     * "clusters" (the default): k-means into `csv` audiences. "people": one `people`
     * audience for the list and a `lead` audience per row, for personal pages.
     */
    mode: v.optional(v.string()),
    /** The list's `people` audience, in people mode. */
    audienceId: v.optional(v.id("pagesAudiences")),
    /**
     * Rows pulled from a CRM through Composio instead of a file: which CRM and
     * which list (HubSpot list, Salesforce campaign, or "all"). Each row then
     * carries the contact's id in `crm_id`, for the builder's crm_record tool
     * and for writing a page's link back on the contact.
     */
    source: v.optional(v.object({ crm: v.string(), listId: v.string(), listName: v.string() })),
    /** Which columns carry taste, geo, demographics. */
    mapping: v.object({
      taste: v.array(v.string()),
      city: v.optional(v.string()),
      country: v.optional(v.string()),
      age: v.optional(v.string()),
      gender: v.optional(v.string()),
      id: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
    clusters: v.array(
      v.object({
        index: v.number(),
        name: v.string(),
        size: v.number(),
        audienceId: v.optional(v.id("pagesAudiences")),
        /** Entities most over-represented in the cluster. */
        topEntities: v.array(v.string()),
      }),
    ),
    trace: v.array(spanValidator),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brand", ["brandId"]),

  pagesMembers: defineTable({
    brandId: v.id("pagesBrands"),
    uploadId: v.id("pagesUploads"),
    /** The CSV row, as strings. */
    row: v.record(v.string(), v.string()),
    /** Resolved Qloo entities from the taste columns. */
    entities: v.array(v.object({ id: v.string(), name: v.string(), type: v.string(), image: v.optional(v.string()) })),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    cluster: v.optional(v.number()),
    /** Set when a one-member audience exists for personal links. */
    leadAudienceId: v.optional(v.id("pagesAudiences")),
  })
    .index("by_upload", ["uploadId"])
    .index("by_brand", ["brandId"]),

  pages: defineTable({
    brandId: v.id("pagesBrands"),
    slug: v.string(),
    title: v.string(),
    brief: v.object({
      /** "launch" | "sale" | "subscription" | "waitlist" | "booking" | "other" */
      goal: v.string(),
      /** What the page is about, in the merchant's words. */
      prompt: v.string(),
      offer: v.optional(v.string()),
      cta: v.object({ label: v.string(), href: v.string() }),
      /** Brand item ids to feature. */
      itemIds: v.array(v.string()),
      /** Legacy brief fields from the old form; the builder now takes these from the chat. */
      facts: v.optional(v.array(v.string())),
      /** Reference sites. */
      references: v.optional(v.array(v.string())),
      /** Inspiration image URLs. */
      inspiration: v.optional(v.array(v.string())),
      /** "pexels" | "nano-banana-2" | "nano-banana-pro" */
      imageMode: v.string(),
    }),
    audienceIds: v.array(v.id("pagesAudiences")),
    /** "draft" | "published" */
    status: v.string(),
    defaultVariantId: v.optional(v.id("pagesVariants")),
    /** RoutingRules */
    routing: v.any(),
    /** QuizConfig, generated at publish time. */
    quiz: v.optional(v.any()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_slug", ["brandId", "slug"]),

  pagesVariants: defineTable({
    pageId: v.id("pages"),
    brandId: v.id("pagesBrands"),
    /** Unset for the default variant. */
    audienceId: v.optional(v.id("pagesAudiences")),
    name: v.string(),
    /** "building" | "ready" | "failed" */
    status: v.string(),
    /** PageDoc */
    doc: v.optional(v.any()),
    screenshot: v.optional(v.string()),
    /** Why this version: the agent's spans (Qloo evidence per choice). */
    trace: v.array(spanValidator),
    /** PageInsights: the plain-language explanation per section, for doc `insights.version`. */
    insights: v.optional(v.any()),
    version: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_page", ["pageId"])
    .index("by_audience", ["audienceId"]),

  /** Builder chat per page: the merchant's messages and the agent's replies. */
  pagesBuilds: defineTable({
    pageId: v.id("pages"),
    messages: v.array(
      v.object({
        id: v.string(),
        /** "merchant" | "agent" */
        role: v.string(),
        at: v.number(),
        text: v.string(),
        /** Which variant the message was about / changed. */
        variantId: v.optional(v.id("pagesVariants")),
        trace: v.optional(v.array(spanValidator)),
        /** The agent's turn as the chat shows it: BuildStep[] (thought | tool | text), in order. */
        steps: v.optional(v.array(v.any())),
        /** Images the merchant attached to the message. */
        attachments: v.optional(v.array(v.object({ url: v.string(), name: v.string(), type: v.string() }))),
        /** Elements the merchant picked on the page; the text refers to each as "[label]". */
        elements: v.optional(v.array(v.object({ label: v.string(), tag: v.string(), section: v.string(), text: v.string() }))),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_page", ["pageId"]),

  /**
   * What the builder agent keeps about a page across sessions (its working
   * memory lives in the agent process and is lost on restart): the merchant's
   * standing instructions, the last review, and the Qloo names it has seen.
   */
  pagesMemory: defineTable({
    pageId: v.id("pages"),
    /** Standing instructions ("keep the hero orange"), in the merchant's words. */
    rules: v.array(v.object({ id: v.string(), text: v.string(), at: v.number() })),
    /** The last review_page result: { version, brandMatch, quality, issues, keep }. */
    review: v.optional(v.any()),
    /** Named things with pictures from tool results ({ name, kind, image? }[]), for explain_page. */
    seen: v.optional(v.array(v.any())),
    updatedAt: v.number(),
  }).index("by_page", ["pageId"]),

  /** Raw tracker events from published pages. */
  pagesEvents: defineTable({
    brandId: v.id("pagesBrands"),
    pageId: v.id("pages"),
    variantId: v.id("pagesVariants"),
    visitorId: v.string(),
    sessionId: v.string(),
    type: v.string(),
    at: v.number(),
    resolvedBy: v.string(),
    path: v.string(),
    sectionId: v.optional(v.string()),
    label: v.optional(v.string()),
    href: v.optional(v.string()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    value: v.optional(v.number()),
    data: v.optional(v.record(v.string(), v.string())),
    device: v.string(),
    browser: v.string(),
    os: v.string(),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    /** "direct" | "search" | "social" | "email" | "ads" | "referral" | "qr" */
    source: v.string(),
    referrerHost: v.optional(v.string()),
    utm: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_page_at", ["pageId", "at"])
    .index("by_variant_at", ["variantId", "at"])
    .index("by_session", ["sessionId"]),

  /** Hourly rollups per variant, updated on ingest. */
  pagesStats: defineTable({
    pageId: v.id("pages"),
    variantId: v.id("pagesVariants"),
    /** "YYYY-MM-DD" UTC. */
    day: v.string(),
    hour: v.number(),
    views: v.number(),
    sessions: v.number(),
    visitors: v.number(),
    clicks: v.number(),
    ctaClicks: v.number(),
    formSubmits: v.number(),
    engagedMs: v.number(),
    scrollSum: v.number(),
    scrollN: v.number(),
    byDevice: v.record(v.string(), v.number()),
    byBrowser: v.record(v.string(), v.number()),
    byCountry: v.record(v.string(), v.number()),
    bySource: v.record(v.string(), v.number()),
    byResolvedBy: v.record(v.string(), v.number()),
    bySection: v.record(v.string(), v.object({ seen: v.number(), clicks: v.number() })),
  })
    .index("by_page_day", ["pageId", "day"])
    .index("by_variant_day_hour", ["variantId", "day", "hour"]),

  pagesForms: defineTable({
    brandId: v.id("pagesBrands"),
    pageId: v.id("pages"),
    variantId: v.id("pagesVariants"),
    sessionId: v.string(),
    sectionId: v.string(),
    at: v.number(),
    fields: v.record(v.string(), v.string()),
  }).index("by_page_at", ["pageId", "at"]),

  /** Sessions the tracker opened, for visitor/session counts and the quiz result. */
  pagesSessions: defineTable({
    pageId: v.id("pages"),
    variantId: v.id("pagesVariants"),
    sessionId: v.string(),
    visitorId: v.string(),
    startedAt: v.number(),
    lastAt: v.number(),
    resolvedBy: v.string(),
  })
    .index("by_session", ["sessionId"])
    // "First session of this visitor on this page today" (visitor counts) and purging by page.
    .index("by_page_visitor", ["pageId", "visitorId", "startedAt"]),
});
