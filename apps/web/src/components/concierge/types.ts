// Shapes shared between the embed UI, the agent's event stream and slice.js.

export interface PageContext {
  url?: string;
  path?: string;
  title?: string;
  product?: {
    id?: string;
    sku?: string;
    name?: string;
    brand?: string;
    price?: number;
    url?: string;
  } | null;
  category?: string;
  query?: string;
}

export interface Span {
  kind: "qloo" | "catalog" | "slice" | "llm" | string;
  name: string;
  path?: string;
  params?: Record<string, string>;
  cache?: string;
  ms: number;
  result: string;
}

export interface EntityRef {
  id: string;
  name: string;
  type: string;
  image?: string;
  subtitle?: string;
  source: string;
}

export interface Question {
  id: string;
  domain: string;
  prompt: string;
  hint: string;
  options: EntityRef[];
}

export interface Answer {
  domain: string;
  question: string;
  choice: string;
  entityId?: string;
}

export interface Brief {
  summary: string;
  styles: { id: string; weight: number; because: string }[];
  palette: string[];
  materials: string[];
  avoid: string[];
}

export interface TasteProfile {
  _id: string;
  storeKey: string;
  city?: string;
  entities: EntityRef[];
  tags: { id: string; name: string; type: string; affinity: number }[];
  brands: {
    id: string;
    name: string;
    affinity: number;
    image?: string;
    personalStyle: string[];
    lifestyle: string[];
    industries: string[];
    explain: { entityId: string; score: number }[];
    inStore: boolean;
  }[];
  demographics?: { age: Record<string, number>; gender: Record<string, number> } | null;
  hints: {
    styles: { id: string; score: number; from: string[] }[];
    terms: { term: string; weight: number; from: string }[];
  };
  brief?: Brief | null;
  trace: Span[];
}

export interface StoreInfo {
  key: string;
  name: string;
  tagline: string;
  vertical: string;
  siteUrl: string;
  styles: { id: string; label: string; description: string }[];
  nav: { label: string; category: string; subcategories: string[] }[];
  brands?: { name: string; slug: string }[];
}

export interface Pick {
  product: {
    id: string;
    slug: string;
    name: string;
    brand?: string | null;
    price: number;
    compareAtPrice?: number | null;
    category: string;
    subcategory: string;
    image?: string | null;
    url?: string | null;
    styles: string[];
    materials: string[];
    colors: string[];
    description: string;
  };
  reason: string;
  fit?: number | null;
  breakdown?: {
    taste: number;
    style: number;
    terms: number;
    details: number;
    brand: number;
    intent: number;
  } | null;
  matched: {
    styles?: string[];
    terms?: string[];
    palette?: string[];
    materials?: string[];
    brand?: string;
    keywords?: string[];
  };
}

export interface Message {
  id: string;
  role: "shopper" | "concierge";
  text: string;
  picks?: Pick[];
  trace?: Span[];
  totalMs?: number;
  /** Status line while streaming. */
  status?: string;
  streaming?: boolean;
  error?: string;
  /** Set on a proactive opener: the page it greeted ("home" or "product:<id>").
   *  Persisted with the transcript so a reload doesn't greet the same page twice. */
  openerFor?: string;
}

export type AgentEvent =
  | { type: "start"; messageId: string }
  | { type: "status"; text: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "span"; span: Span }
  | { type: "text"; delta: string }
  | { type: "text_done"; text: string }
  | { type: "picks"; picks: Pick[] }
  | { type: "brief"; brief: Brief }
  | { type: "profile_changed"; added?: { name: string; type: string } }
  | { type: "done"; messageId: string; text: string; trace: Span[]; totalMs: number }
  | { type: "error"; message: string };

/** What the widget (parent page) and the embed exchange over postMessage. */
export type ToParent =
  | { type: "slice:ready" }
  | { type: "slice:state"; profileId: string | null; messages: Message[] }
  | { type: "slice:navigate"; url: string }
  | { type: "slice:close" };

export type FromParent = {
  type: "slice:context";
  key: string;
  sessionId: string;
  profileId: string | null;
  page: PageContext;
  messages?: Message[];
  mobile?: boolean;
};
