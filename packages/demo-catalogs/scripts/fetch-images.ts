// Product photos from Pexels, downloaded into the store app's public/ folder
// with the path written back into the product's `images`.
//
//   pnpm fetch-images marlow                      search every product without an image
//   pnpm fetch-images fold                        (any folder under src/)
//   pnpm fetch-images marlow --force              re-search every product
//   pnpm fetch-images marlow --pick mw-liv-09=1234567,mw-kit-01=7654321
//                                                 pin specific Pexels photos (ids from the photo URL)
//   pnpm fetch-images fold --only fd-bag-02,fd-ftw-19
//                                                 re-search just these (edit their imageQuery first)
//
// Search mode never reuses a photo already assigned to another product, and a
// re-search never returns the photo it is replacing.
// Needs PEXELS_API_KEY (packages/demo-catalogs/.env). Pexels photos are free to
// use without attribution; we still record photographers in <store>/credits.json.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Product } from "../src/types.ts";

const [, , storeId = "marlow", ...flags] = process.argv;
const force = flags.includes("--force");
const pickArg = flags[flags.indexOf("--pick") + 1];
const onlyArg = flags[flags.indexOf("--only") + 1];
const only = new Set(flags.includes("--only") && onlyArg ? onlyArg.split(",").map((s) => s.trim()) : []);
const picks = new Map<string, number>(
  flags.includes("--pick") && pickArg
    ? pickArg.split(",").map((pair) => {
        const [id, photo] = pair.split("=");
        return [id.trim(), Number(photo)] as const;
      })
    : [],
);

const apiKey = process.env.PEXELS_API_KEY;
if (!apiKey) {
  console.error("Set PEXELS_API_KEY (free at https://www.pexels.com/api/)");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const storeDir = path.join(root, "src", storeId);
const publicDir = path.resolve(root, "..", "..", "apps", "stores", "public", storeId);
const creditsPath = path.join(storeDir, "credits.json");

// Every product file in the store folder (store.json and credits.json aren't products).
const files = (await readdir(storeDir))
  .filter((f) => f.endsWith(".json") && f !== "store.json" && f !== "credits.json")
  .map((f) => f.replace(/\.json$/, ""));

interface PexelsPhoto {
  id: number;
  photographer: string;
  photographer_url: string;
  url: string;
  src: { large: string; large2x: string; medium: string };
}

interface Credit {
  pexelsId: number;
  url: string;
  photographer: string;
  photographerUrl: string;
}

async function pexels<T>(url: URL): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: apiKey! } });
  if (res.status === 429) {
    console.log("  rate limited, waiting 60s");
    await new Promise((r) => setTimeout(r, 60_000));
    return pexels(url);
  }
  if (!res.ok) throw new Error(`Pexels ${res.status} for ${url.pathname}${url.search}`);
  return (await res.json()) as T;
}

async function search(query: string, exclude: Set<number>): Promise<PexelsPhoto | undefined> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "10");
  url.searchParams.set("orientation", "portrait");
  const body = await pexels<{ photos: PexelsPhoto[] }>(url);
  return body.photos.find((p) => !exclude.has(p.id));
}

const photo = (id: number) =>
  pexels<PexelsPhoto>(new URL(`https://api.pexels.com/v1/photos/${id}`));

async function main() {
  await mkdir(publicDir, { recursive: true });
  const credits: Record<string, Credit> = existsSync(creditsPath)
    ? JSON.parse(await readFile(creditsPath, "utf8"))
    : {};
  const used = new Set(Object.values(credits).map((c) => c.pexelsId));

  for (const file of files) {
    const filePath = path.join(storeDir, `${file}.json`);
    if (!existsSync(filePath)) continue;
    const products = JSON.parse(await readFile(filePath, "utf8")) as Product[];
    let changed = false;

    for (const p of products) {
      const pinned = picks.get(p.id);
      if (picks.size > 0) {
        if (pinned === undefined) continue;
      } else if (only.size > 0) {
        if (!only.has(p.id)) continue;
      } else if (p.images.length > 0 && !force) continue;

      process.stdout.write(`${p.id} ${pinned ? `pin ${pinned}` : `"${p.imageQuery}"`} … `);
      // A pinned photo may be the one already assigned; a search must not
      // hand back the photo we're replacing.
      const previous = credits[p.id]?.pexelsId;
      if (pinned && previous !== undefined) used.delete(previous);

      const found = pinned ? await photo(pinned) : await search(p.imageQuery, used);
      if (!found) {
        console.log("no result");
        continue;
      }
      const res = await fetch(found.src.large2x);
      if (!res.ok) {
        console.log(`download failed (${res.status})`);
        continue;
      }
      const fileName = `${p.id}.jpg`;
      await writeFile(path.join(publicDir, fileName), Buffer.from(await res.arrayBuffer()));
      p.images = [`/${storeId}/${fileName}`];
      credits[p.id] = {
        pexelsId: found.id,
        url: found.url,
        photographer: found.photographer,
        photographerUrl: found.photographer_url,
      };
      used.add(found.id);
      changed = true;
      console.log(`ok (${found.photographer})`);
      // Stay well under Pexels' 200 requests/hour.
      await new Promise((r) => setTimeout(r, 400));
    }

    if (changed) await writeFile(filePath, JSON.stringify(products, null, 2) + "\n");
  }

  await writeFile(creditsPath, JSON.stringify(credits, null, 2) + "\n");
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
