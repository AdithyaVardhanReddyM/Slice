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

/* Email service validators (shapes in emailTypes.ts). */

const emailProgress = v.object({ value: v.number(), label: v.string() });

/** A resolved Qloo entity on a contact. */
export const emailEntityValidator = v.object({ id: v.string(), name: v.string(), type: v.string(), image: v.optional(v.string()) });

export const emailStatsValidator = v.object({
  recipients: v.number(),
  sent: v.number(),
  delivered: v.number(),
  opened: v.number(),
  clicked: v.number(),
  bounced: v.number(),
  complained: v.number(),
  unsubscribed: v.number(),
  failed: v.number(),
});

export const emailSenderValidator = v.object({ fromName: v.string(), fromLocal: v.string(), replyTo: v.optional(v.string()) });

export const emailDomainValidator = v.object({
  name: v.string(),
  resendId: v.optional(v.string()),
  status: v.union(v.literal("not_started"), v.literal("pending"), v.literal("verified"), v.literal("failed"), v.literal("temporary_failure")),
  records: v.array(
    v.object({
      record: v.string(),
      name: v.string(),
      type: v.string(),
      value: v.string(),
      ttl: v.optional(v.string()),
      priority: v.optional(v.number()),
      status: v.string(),
    }),
  ),
  checkedAt: v.optional(v.number()),
  error: v.optional(v.string()),
});

export const emailSetupValidator = v.object({
  status: v.union(v.literal("reading"), v.literal("done"), v.literal("failed")),
  progress: v.optional(emailProgress),
  error: v.optional(v.string()),
  at: v.number(),
});

export const emailBriefValidator = v.object({
  summary: v.string(),
  speakTo: v.string(),
  leadWith: v.string(),
  hooks: v.array(v.object({ text: v.string(), evidence: v.string() })),
});

export const emailMappingValidator = v.object({
  email: v.string(),
  name: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  /** Columns of what they bought or booked (recent orders, bookings, visits). */
  purchases: v.optional(v.array(v.string())),
  /** Columns of what they like, when the business knows it. */
  taste: v.array(v.string()),
  /** Neighbourhood within the city, for local brands. */
  neighborhood: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  age: v.optional(v.string()),
  gender: v.optional(v.string()),
});

export const emailPersonalizationStateValidator = v.object({
  status: v.union(v.literal("idle"), v.literal("running"), v.literal("ready"), v.literal("failed")),
  done: v.number(),
  total: v.number(),
  docVersion: v.optional(v.number()),
  error: v.optional(v.string()),
  startedAt: v.optional(v.number()),
});

export const emailChatMessageValidator = v.object({
  id: v.string(),
  role: v.union(v.literal("merchant"), v.literal("agent")),
  at: v.number(),
  text: v.string(),
  trace: v.optional(v.array(spanValidator)),
  steps: v.optional(v.array(v.any())),
  attachments: v.optional(v.array(v.object({ url: v.string(), name: v.string(), type: v.string() }))),
  /** Blocks the merchant picked; the text refers to each by its label. */
  blocks: v.optional(v.array(v.object({ id: v.string(), label: v.string(), type: v.string() }))),
});

export const sendStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("opened"),
  v.literal("clicked"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const campaignStatusValidator = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
);

export const sendingModeValidator = v.union(v.literal("domain"), v.literal("shared"), v.literal("demo"), v.literal("none"));

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

  /* Email service ----------------------------------------------------------
     Its own brands, contacts, audiences and campaigns (docs/email-plan.md).
     Kits, docs, profiles and personalisations use the shapes in emailTypes.ts
     and are stored as v.any(). */

  emailBrands: defineTable({
    /** URL-safe, unique across emailBrands. */
    slug: v.string(),
    name: v.string(),
    /** A placeholder guessed from the URL; setup replaces it with the name read from the site. */
    nameFromSite: v.optional(v.boolean()),
    url: v.optional(v.string()),
    status: v.union(v.literal("setup"), v.literal("ready")),
    /** The homepage read (agent /email/setup). */
    setup: v.optional(emailSetupValidator),
    /** EmailKit */
    kit: v.optional(v.any()),
    /** EmailAbout */
    about: v.optional(v.any()),
    /** EmailFooterInfo */
    footer: v.optional(v.any()),
    sender: v.optional(emailSenderValidator),
    domain: v.optional(emailDomainValidator),
    /** Clerk subject of the merchant whose console lists it. */
    owner: v.optional(v.string()),
    /** A demo brand: badged, never deleted. Without `demoOf` it is a master copied into every account (emailDemo.ts). */
    demo: v.optional(v.boolean()),
    demoOf: v.optional(v.id("emailBrands")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["owner"])
    .index("by_demo", ["demo", "demoOf"]),

  /** What a brand sells or offers (EmailItem); items blocks and taste picks feature them. */
  emailItems: defineTable({
    brandId: v.id("emailBrands"),
    name: v.string(),
    subtitle: v.optional(v.string()),
    /** "book" | "product" | "event" | "offer" | "service" */
    kind: v.string(),
    description: v.string(),
    price: v.optional(v.string()),
    image: v.optional(v.string()),
    url: v.optional(v.string()),
    tags: v.array(v.string()),
    qloo: v.optional(v.object({ id: v.string(), name: v.string(), type: v.string(), tags: v.optional(v.array(v.string())) })),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_brand", ["brandId"]),

  emailLists: defineTable({
    brandId: v.id("emailBrands"),
    name: v.string(),
    source: v.union(v.literal("csv"), v.literal("manual"), v.literal("demo")),
    filename: v.optional(v.string()),
    columns: v.array(v.string()),
    rowCount: v.number(),
    /** "groups": clustered into taste groups. "people": kept one by one, a profile per person. */
    mode: v.union(v.literal("groups"), v.literal("people")),
    mapping: emailMappingValidator,
    status: v.union(
      v.literal("importing"),
      v.literal("resolving"),
      v.literal("clustering"),
      v.literal("profiling"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    progress: v.optional(emailProgress),
    /** People mode: the brand's individual contacts audience the list's people joined. */
    audienceId: v.optional(v.id("emailAudiences")),
    trace: v.array(spanValidator),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brand", ["brandId"]),

  emailContacts: defineTable({
    brandId: v.id("emailBrands"),
    listId: v.id("emailLists"),
    /** Lower-cased. */
    email: v.string(),
    name: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    /** The CSV row, as strings. */
    row: v.record(v.string(), v.string()),
    /** What they bought or booked, most recent first, as the business wrote it. */
    purchases: v.optional(v.array(v.string())),
    /** Purchases found in the brand's own catalog. */
    boughtItemIds: v.optional(v.array(v.id("emailItems"))),
    /** What they like, when the business knows it: from the taste columns or the add form. */
    interests: v.array(v.string()),
    /** Qloo entities read from what they bought and like. */
    entities: v.array(emailEntityValidator),
    /** Where in the city they live (Park Slope), for a local shop; Qloo reads "Park Slope, Brooklyn". */
    neighborhood: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    /** Qloo age bucket (24_and_younger …). */
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    cluster: v.optional(v.number()),
    /** Kept as an individual contact (their own profile, ticked per campaign) rather than placed in a taste group. */
    individual: v.optional(v.boolean()),
    /** Why they are in their taste group when it wasn't what they bought: no purchases yet, so placed by age, gender and city through Qloo. */
    placement: v.optional(v.object({ by: v.literal("demographics"), note: v.string() })),
    /** Its taste group, or the brand's individual contacts audience. */
    audienceId: v.optional(v.id("emailAudiences")),
    /** Individuals: AudienceProfile compiled for this person. */
    profile: v.optional(v.any()),
    profileStatus: v.optional(v.union(v.literal("pending"), v.literal("compiling"), v.literal("ready"), v.literal("failed"))),
    /** Why the profile failed, for the people drawer. */
    profileError: v.optional(v.string()),
    unsubscribed: v.optional(v.boolean()),
    unsubscribedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_list", ["listId"])
    .index("by_brand", ["brandId"])
    .index("by_brand_email", ["brandId", "email"])
    .index("by_audience", ["audienceId"]),

  emailAudiences: defineTable({
    brandId: v.id("emailBrands"),
    /** A group: the upload that started it (later uploads can add to it). Unset on the brand's individual contacts. */
    listId: v.optional(v.id("emailLists")),
    name: v.string(),
    kind: v.union(v.literal("group"), v.literal("people")),
    cluster: v.optional(v.number()),
    status: v.union(v.literal("compiling"), v.literal("ready"), v.literal("failed")),
    progress: v.optional(emailProgress),
    /** AudienceProfile: the group's, or the people's merged (for the cover). */
    profile: v.optional(v.any()),
    brief: v.optional(emailBriefValidator),
    size: v.number(),
    /** Names, for cards. */
    topEntities: v.array(v.string()),
    trace: v.array(spanValidator),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_list", ["listId"]),

  emailCampaigns: defineTable({
    brandId: v.id("emailBrands"),
    name: v.string(),
    /** The name is cut from the first prompt; the builder's first subject line replaces it. */
    nameFromPrompt: v.optional(v.boolean()),
    status: campaignStatusValidator,
    /** The taste groups ticked: each gets one version, written for the group's taste. */
    groupIds: v.optional(v.array(v.id("emailAudiences"))),
    /** The individual contacts ticked: each gets their own version. */
    contactIds: v.optional(v.array(v.id("emailContacts"))),
    /** EmailDoc */
    doc: v.any(),
    templateId: v.optional(v.string()),
    /** The first prompt, for the first generate turn. */
    prompt: v.optional(v.string()),
    personalization: v.optional(emailPersonalizationStateValidator),
    scheduledAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    /** Fixed when sending starts. */
    sendingMode: v.optional(sendingModeValidator),
    /** The scheduled send (run or simulate), so `cancel` can stop it. */
    sendJob: v.optional(v.id("_scheduled_functions")),
    stats: emailStatsValidator,
    test: v.optional(v.object({ to: v.string(), at: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_status", ["status"]),

  /** Builder chat per campaign (same message shape as pagesBuilds). */
  emailChats: defineTable({
    campaignId: v.id("emailCampaigns"),
    messages: v.array(emailChatMessageValidator),
    updatedAt: v.number(),
  }).index("by_campaign", ["campaignId"]),

  /** One recipient's version of a campaign: a taste group's (`audienceId`) or one person's (`contactId`). */
  emailVersions: defineTable({
    campaignId: v.id("emailCampaigns"),
    contactId: v.optional(v.id("emailContacts")),
    audienceId: v.optional(v.id("emailAudiences")),
    /** The doc version it was written against (stale when lower). */
    docVersion: v.number(),
    /** Personalization */
    personalization: v.any(),
    status: v.union(v.literal("ready"), v.literal("failed")),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_contact", ["campaignId", "contactId"])
    .index("by_campaign_audience", ["campaignId", "audienceId"]),

  emailSends: defineTable({
    campaignId: v.id("emailCampaigns"),
    brandId: v.id("emailBrands"),
    contactId: v.id("emailContacts"),
    email: v.string(),
    status: sendStatusValidator,
    resendId: v.optional(v.string()),
    error: v.optional(v.string()),
    subject: v.string(),
    queuedAt: v.number(),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    openedAt: v.optional(v.number()),
    clickedAt: v.optional(v.number()),
    bouncedAt: v.optional(v.number()),
    unsubscribedAt: v.optional(v.number()),
    opens: v.number(),
    clicks: v.number(),
    links: v.array(v.object({ url: v.string(), blockId: v.optional(v.string()), at: v.number() })),
    /** Demo mode: nothing left Slice; the events were simulated. */
    simulated: v.optional(v.boolean()),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_resend", ["resendId"])
    .index("by_contact", ["contactId"]),

  /* Media service: posters and short videos (see apps/web/src/lib/media). */

  /** A brand the Media agent designs for: kit, what it does, its products and photos. Its own list, like Pages and Email brands. */
  mediaBrands: defineTable({
    owner: v.string(),
    name: v.string(),
    url: v.optional(v.string()),
    /** MediaAbout: what the business does and who for. */
    about: v.optional(v.any()),
    /** MediaKit: logo, colours, fonts, voice, imagery. */
    kit: v.any(),
    /** MediaProduct[] the agent can feature. */
    products: v.array(v.any()),
    /** Photos from the brand's site. */
    images: v.array(v.string()),
    source: v.object({
      kind: v.union(v.literal("pages"), v.literal("email"), v.literal("url"), v.literal("manual")),
      pagesBrandId: v.optional(v.id("pagesBrands")),
      emailBrandId: v.optional(v.id("emailBrands")),
    }),
    /** "reading" while its website is read, then "ready" (or "failed"). */
    status: v.string(),
    progress: v.optional(v.object({ value: v.number(), label: v.string() })),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["owner"]),

  mediaCampaigns: defineTable({
    name: v.string(),
    owner: v.string(),
    /** The brand the agent designs for; `kit` and `products` are its copy at the time it was picked. */
    brandId: v.optional(v.id("mediaBrands")),
    /** Where the canvas was last looking. */
    viewport: v.optional(v.object({ x: v.number(), y: v.number(), zoom: v.number() })),
    /** "poster" | "video" | "both" */
    kind: v.string(),
    /** Where the kit came from. */
    source: v.object({
      kind: v.union(v.literal("pages"), v.literal("email"), v.literal("url"), v.literal("manual")),
      pagesBrandId: v.optional(v.id("pagesBrands")),
      emailBrandId: v.optional(v.id("emailBrands")),
      url: v.optional(v.string()),
    }),
    /** MediaKit: a snapshot, edited here without touching the source brand. */
    kit: v.any(),
    /** MediaBrief: goal, offer, cta, notes, link. */
    brief: v.any(),
    /** MediaProduct[] picked for the campaign (snapshots). */
    products: v.array(v.any()),
    /** MediaAudience[]: Pages audiences (snapshots) or taste seeds. */
    audiences: v.array(v.any()),
    /** Format presets, e.g. "story", "square". */
    formats: v.array(v.string()),
    /** "draft" | "smart" | "premium" */
    tier: v.string(),
    /** USD cap; generation stops and asks once spend would pass it. */
    budget: v.number(),
    /** USD spent on finished jobs. */
    spend: v.number(),
    /** "new" | "working" | "ready" */
    status: v.string(),
    /** The agent's concepts per audience (MediaConcept[]), for the "why" panel. */
    concepts: v.optional(v.array(v.any())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["owner"]),

  mediaAssets: defineTable({
    campaignId: v.id("mediaCampaigns"),
    /** "image" | "video" | "audio" */
    kind: v.string(),
    /** "upload" | "generated" | "brand" | "product" | "stock" | "export" */
    source: v.string(),
    url: v.string(),
    storageId: v.optional(v.id("_storage")),
    mime: v.optional(v.string()),
    name: v.optional(v.string()),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    duration: v.optional(v.number()),
    prompt: v.optional(v.string()),
    model: v.optional(v.string()),
    /** The asset this one was edited or extended from. */
    parentId: v.optional(v.id("mediaAssets")),
    cost: v.optional(v.number()),
    credit: v.optional(v.string()),
    /** On the canvas (unset: only in the library). */
    board: v.optional(v.object({ x: v.number(), y: v.number(), w: v.number() })),
    /** The brand check of a generated picture: {score, total, passed, tries, notes}. */
    review: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_campaign", ["campaignId"]),

  /** One creative per audience × format. */
  mediaCreatives: defineTable({
    campaignId: v.id("mediaCampaigns"),
    name: v.string(),
    /** Audience id within the campaign ("all" for the brand-wide cut). */
    audienceKey: v.string(),
    format: v.string(),
    /** "poster" | "video" */
    kind: v.string(),
    /** MediaDoc */
    doc: v.any(),
    version: v.number(),
    /** "draft" | "rendering" | "ready" */
    status: v.string(),
    /** Why this creative, citing Qloo evidence. */
    why: v.optional(v.array(v.object({ text: v.string(), evidence: v.string() }))),
    export: v.optional(v.object({ url: v.string(), storageId: v.optional(v.id("_storage")), mime: v.string(), version: v.number(), at: v.number() })),
    /** On the canvas. */
    board: v.optional(v.object({ x: v.number(), y: v.number(), w: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_campaign", ["campaignId"]),

  /** Earlier docs of a creative, for undo and history. */
  mediaVersions: defineTable({
    creativeId: v.id("mediaCreatives"),
    version: v.number(),
    doc: v.any(),
    /** "agent" | "merchant" */
    by: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_creative", ["creativeId", "version"]),

  /** Generation and export jobs (Veo, Omni, Nano Banana, Lyria, TTS, render). */
  mediaJobs: defineTable({
    campaignId: v.id("mediaCampaigns"),
    creativeId: v.optional(v.id("mediaCreatives")),
    /** Clip or layer the result lands in. */
    targetId: v.optional(v.string()),
    /** "video" | "edit" | "extend" | "image" | "music" | "voice" | "export" */
    kind: v.string(),
    model: v.string(),
    prompt: v.optional(v.string()),
    /** "queued" | "running" | "done" | "failed" */
    status: v.string(),
    /** Estimated USD, counted against the budget while running. */
    estimate: v.number(),
    /** USD charged once done. */
    cost: v.optional(v.number()),
    assetId: v.optional(v.id("mediaAssets")),
    error: v.optional(v.string()),
    /** A standalone generation (an image, a clip, a track) holds its spot on the canvas while it runs; its asset lands there. */
    board: v.optional(v.object({ x: v.number(), y: v.number(), w: v.number() })),
    /** The shape it will have ("9:16"), so the placeholder is the right size. */
    aspect: v.optional(v.string()),
    /** Hidden from the canvas (a failed generation the merchant dismissed). */
    dismissed: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_creative", ["creativeId"])
    .index("by_status", ["status"]),

  mediaChats: defineTable({
    campaignId: v.id("mediaCampaigns"),
    messages: v.array(emailChatMessageValidator),
    updatedAt: v.number(),
  }).index("by_campaign", ["campaignId"]),
});
