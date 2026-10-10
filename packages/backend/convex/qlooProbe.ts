import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { cachedQlooGet } from "./qloo";

// Dev tool: inspect a Qloo response through the cache.
//   npx convex run qlooProbe:probe '{"path":"/search","params":{"query":"Bon Iver"},"pick":"results","project":["name","entity_id"]}'
export const probe = internalAction({
  args: {
    path: v.string(),
    params: v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean(), v.array(v.string())),
    ),
    pick: v.optional(v.string()),
    project: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { path, params, pick, project }) => {
    const { body, status } = await cachedQlooGet(ctx, path, params);
    let cur: any = JSON.parse(body);
    if (pick) for (const k of pick.split(".")) cur = cur?.[k];
    if (project && Array.isArray(cur)) {
      cur = cur.map((e: any) =>
        Object.fromEntries(
          project.map((f) => {
            let val: any = e;
            for (const k of f.split(".")) val = val?.[k];
            if (f === "tags" && Array.isArray(val)) val = val.slice(0, 4).map((t: any) => t.name);
            return [f, val];
          }),
        ),
      );
    }
    return { status, body: JSON.stringify(cur).slice(0, 8000) };
  },
});
