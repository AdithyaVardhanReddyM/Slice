// Each store deploys as its own Vercel project with STORE=<slug> (src/proxy.ts
// sends every other store's paths to a 404). Run before the build there (see
// vercel.json), this deletes the other stores' routes and public files from the
// build's checkout, so a deployment carries one store instead of all of them.
// Does nothing without both STORE and VERCEL, so local builds keep every store.
import { readdirSync, rmSync } from "node:fs";

const only = process.env.STORE?.trim();
if (!only || !process.env.VERCEL) process.exit(0);

const stores = readdirSync("src/app", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
if (!stores.includes(only)) throw new Error(`STORE=${only} has no src/app/${only}`);

const dropped = stores.filter((s) => s !== only);
for (const store of dropped) for (const dir of [`src/app/${store}`, `public/${store}`]) rmSync(dir, { recursive: true, force: true });
console.log(`Building ${only} alone, without ${dropped.join(", ")}`);
