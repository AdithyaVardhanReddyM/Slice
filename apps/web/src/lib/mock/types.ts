// Console domain model. Mock data uses these shapes now; the Convex schema
// should mirror them when the backend lands, so the UI only swaps its source.

export type StoreKey = "marlow" | "fold";

export type WidgetStatus = "live" | "setup" | "paused";

export type SetupStep =
  "store" | "catalog" | "taste" | "concierge" | "appearance" | "install";

export type CatalogSourceKind =
  "upload" | "shopify" | "woocommerce" | "feed" | "api";

export interface Widget {
  id: string;
  name: string;
  domain: string;
  vertical: string;
  status: WidgetStatus;
  /** Demo catalog backing the mock. Real widgets read their own catalog. */
  storeKey: StoreKey | null;
  createdAt: string;
  publicKey: string;
  accent: string;
  completedSteps: SetupStep[];
  catalog: {
    source: CatalogSourceKind | null;
    sourceLabel: string;
    products: number;
    lastSyncAt: string | null;
    /** Share of products with enough copy and attributes to match taste against. */
    readiness: number;
  };
  stats7d: {
    conversations: number;
    conversationsDelta: number;
    recCtr: number;
    addToCart: number;
    influencedRevenue: number;
  };
  /** Conversations per day, last 14 days. */
  spark: number[];
}

export type QlooEntityType =
  | "artist"
  | "movie"
  | "tv_show"
  | "book"
  | "person"
  | "place"
  | "brand"
  | "podcast";

export interface QlooEntityRef {
  id: string;
  name: string;
  type: QlooEntityType;
  /** Where the signal came from. */
  source: "questionnaire" | "chat" | "location";
}

export interface TasteTag {
  id: string;
  name: string;
  /** Qloo affinity, 0–1. */
  weight: number;
  /** Entity IDs that produced this tag. */
  from: string[];
}

export interface StyleAffinity {
  /** Catalog style axis id ("japandi"). */
  style: string;
  label: string;
  score: number;
  /** Tag IDs that drove it. */
  from: string[];
}

export interface QuestionnaireAnswer {
  domain: string;
  question: string;
  options: string[];
  choice: string;
  freeText?: string;
}

export interface TasteProfile {
  answers: QuestionnaireAnswer[];
  entities: QlooEntityRef[];
  tags: TasteTag[];
  styles: StyleAffinity[];
  /** Catalog-language summary the agent works from. */
  palette: string[];
  materials: string[];
}

export interface Shopper {
  anonId: string;
  city: string;
  region: string;
  device: "desktop" | "mobile" | "tablet";
  entryPage: string;
  referrer: string;
  returning: boolean;
}

export type Outcome =
  | "purchased"
  | "added_to_cart"
  | "clicked"
  | "browsing"
  | "no_match"
  | "abandoned";

export interface ScoreBreakdown {
  /** Product attributes vs. the shopper's style affinities. */
  taste: number;
  /** Category, room, use-case vs. what the shopper asked for. */
  intent: number;
  /** Budget, stock and guardrails. 1 = all pass. */
  constraints: number;
}

export interface Recommendation {
  productId: string;
  rank: number;
  score: number;
  breakdown: ScoreBreakdown;
  /** The concierge's one-line reason, shown to the shopper. */
  reason: string;
  /** Longer rationale for the merchant. */
  rationale: string;
  matched: { styles: string[]; materials: string[]; colors: string[] };
  clicked: boolean;
  addedToCart: boolean;
}

export type SpanKind = "llm" | "qloo" | "catalog" | "slice";

export interface Span {
  id: string;
  kind: SpanKind;
  name: string;
  /** ms from turn start. */
  start: number;
  duration: number;
  /** Qloo only. */
  cache?: "hit" | "miss" | "stale";
  method?: "GET" | "POST";
  path?: string;
  params?: Record<string, string>;
  /** What came back, in one line. */
  result: string;
  tokens?: { input: number; output: number };
  model?: string;
}

export interface Candidate {
  productId: string;
  score: number;
  kept: boolean;
  /** Why it dropped, if it did. */
  note?: string;
}

export interface TurnTrace {
  id: string;
  messageId: string;
  totalMs: number;
  spans: Span[];
  intent: {
    summary: string;
    category: string[];
    budget?: number;
    room?: string;
    constraints: string[];
  };
  retrieval: {
    catalogSize: number;
    filtered: number;
    candidates: Candidate[];
  };
}

export interface Message {
  id: string;
  role: "shopper" | "concierge" | "system";
  at: string;
  text: string;
  recs?: Recommendation[];
  traceId?: string;
}

export interface Conversation {
  id: string;
  widgetId: string;
  storeKey: StoreKey;
  shopper: Shopper;
  startedAt: string;
  durationSec: number;
  outcome: Outcome;
  /** What the shopper came for, in a few words. */
  intent: string;
  persona: string;
  profile: TasteProfile;
  messages: Message[];
  traces: TurnTrace[];
  revenue: number;
  /** Unmet need, when outcome is no_match. */
  gap?: string;
}
