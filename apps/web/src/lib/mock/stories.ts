import type { Outcome, StoreKey } from "./types";

// Two sample conversations written out in full, so the console shows what a
// real session looks like end to end: the taste questions, picks for that
// taste, a pick opened and picks that go with it, a question answered from
// the product's own details, a new ask, and what went in the cart. Every
// product fact comes from the catalog copy. conversations.ts builds them.

export type StoryTurn = { after: number } & (
  | { kind: "taste" }
  | { kind: "shopper"; text: string }
  | {
      kind: "concierge";
      text: string;
      picks: string[];
      /** What the turn answered, when the shopper asked for something. */
      ask?: {
        intent: string;
        category: string[];
        budget?: number;
        constraints: string[];
      };
    }
  | { kind: "opened"; product: string }
  | { kind: "carted"; product: string }
  | { kind: "end"; text: string }
);

export interface Story {
  id: string;
  widgetId: string;
  store: StoreKey;
  persona: string;
  intent: string;
  outcome: Outcome;
  city: [string, string];
  device: "desktop" | "mobile" | "tablet";
  entryPage: string;
  referrer: string;
  /** How long before the sample's "now" it started. */
  minutesAgo: number;
  /** Seconds after the previous turn. */
  turns: StoryTurn[];
}

export const stories: Story[] = [
  {
    id: "cnv_story_marlow",
    widgetId: "marlow",
    store: "marlow",
    persona: "quiet-naturalist",
    intent: "Calmer bedroom, lamp and bedside",
    outcome: "added_to_cart",
    city: ["Portland", "OR"],
    device: "mobile",
    entryPage: "/marlow/bedroom",
    referrer: "instagram.com",
    minutesAgo: 13,
    turns: [
      { after: 41, kind: "taste" },
      {
        after: 7,
        kind: "concierge",
        text: "You lean calm and natural: pale oak, paper light, linen, nothing loud. Three things from around the store that fit that.",
        picks: ["mw-bed-17", "mw-liv-30", "mw-dec-09"],
      },
      { after: 34, kind: "opened", product: "mw-bed-17" },
      {
        after: 6,
        kind: "concierge",
        text: "The Nimbus suits you: handmade washi paper on an oak base, with a dimmer on the cord. If it's going by the bed, these sit well beside it.",
        picks: ["mw-bed-13", "mw-bed-03", "mw-dec-05"],
        ask: {
          intent: "Goes with the paper lamp",
          category: ["Nightstands", "Bedding", "Candles & scent"],
          constraints: ["bedroom", "goes with Nimbus lamp"],
        },
      },
      {
        after: 52,
        kind: "shopper",
        text: "Would a smart bulb work in the lamp? I read in bed so I need it bright enough",
      },
      {
        after: 5,
        kind: "concierge",
        text: "Yes, it takes any standard E26 bulb up to 40W, so a smart bulb fits; leave the cord dimmer turned up if you use one. It comes with a 6W dimmable LED at a warm 2700K, and the paper shade keeps a brighter bulb glare-free for reading.",
        picks: [],
      },
      {
        after: 48,
        kind: "shopper",
        text: "Ok sold on the lamp and the oak nightstand. Anything for the bed that isn't another throw? Something with texture, under $80",
      },
      {
        after: 7,
        kind: "concierge",
        text: "Texture without another throw: a heavy linen lumbar cushion with a single hand-painted brushstroke, so no two are alike. And a stoneware candle for the new nightstand, fig, cedar and black tea.",
        picks: ["mw-liv-34", "mw-dec-01"],
        ask: {
          intent: "Textured accent for the bed, under $80",
          category: ["Throws & cushions"],
          budget: 80,
          constraints: ["bedroom", "texture", "not a throw", "≤ $80"],
        },
      },
      { after: 40, kind: "carted", product: "mw-bed-17" },
      { after: 22, kind: "carted", product: "mw-bed-13" },
      { after: 31, kind: "carted", product: "mw-liv-34" },
      { after: 20, kind: "end", text: "Left the chat with 3 picks in their cart" },
    ],
  },
  {
    id: "cnv_story_fold",
    widgetId: "fold",
    store: "fold",
    persona: "trail-quiet",
    intent: "A town parka, then staying dry on hikes",
    outcome: "added_to_cart",
    city: ["Seattle", "WA"],
    device: "desktop",
    entryPage: "/fold/outerwear",
    referrer: "google.com",
    minutesAgo: 14,
    turns: [
      { after: 36, kind: "taste" },
      {
        after: 6,
        kind: "concierge",
        text: "You lean outdoorsy and practical: earthy layers that work on a trail and in town. Three to start, across labels.",
        picks: ["fd-out-22", "fd-top-27", "fd-bag-12"],
      },
      { after: 29, kind: "opened", product: "fd-out-22" },
      {
        after: 6,
        kind: "concierge",
        text: "That parka is very you, matte olive cloth made for damp days. It's water-repellent rather than waterproof, so a Gore-Tex boot does the heavy lifting below; the pants and shirt keep the same quiet, earthy look.",
        picks: ["fd-ftw-19", "fd-bot-10", "fd-top-19"],
        ask: {
          intent: "Goes with the Light Mountain Cloth Parka",
          category: ["Boots", "Trousers", "Shirts"],
          constraints: ["goes with parka", "damp weather"],
        },
      },
      {
        after: 44,
        kind: "shopper",
        text: "How does the parka fit? I'm usually a medium and want a fleece under it",
      },
      {
        after: 5,
        kind: "concierge",
        text: "It's cut relaxed and longline, so your usual medium leaves room for a fleece underneath. It's unlined and packs small, and medium is in stock.",
        picks: [],
      },
      {
        after: 58,
        kind: "shopper",
        text: "Seattle rain though. What would keep me properly dry on a real hike?",
      },
      {
        after: 8,
        kind: "concierge",
        text: "For a real downpour, a fully taped waterproof shell that stuffs into its own pocket, so it rides in a small daypack until you need it.",
        picks: ["fd-out-21", "fd-bag-08"],
        ask: {
          intent: "Waterproof layer for rainy hikes",
          category: ["Shells & fleece", "Backpacks"],
          constraints: ["waterproof", "hiking", "packable"],
        },
      },
      { after: 37, kind: "opened", product: "fd-out-21" },
      { after: 46, kind: "carted", product: "fd-out-22" },
      { after: 25, kind: "carted", product: "fd-ftw-19" },
      { after: 18, kind: "end", text: "Left the chat with 2 picks in their cart" },
    ],
  },
];
