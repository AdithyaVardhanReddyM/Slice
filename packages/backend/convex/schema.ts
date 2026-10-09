import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Tables are added as features land (merchants, catalog, conversations, ...).
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
});
