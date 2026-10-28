// Each store deploys as its own Vercel project with STORE=<slug>, or a comma
// list (src/proxy.ts sends every other store's paths to a 404). Run before the
// build there (see vercel.json), this deletes the other stores' routes and
// public files from the build's checkout, so a deployment carries only its own.
// Does nothing without both STORE and VERCEL, so local builds keep every store.
import { readdirSync, rmSync } from "node:fs";

const only = (process.env.STORE ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!only.length || !process.env.VERCEL) process.exit(0);

const stores = readdirSync("src/app", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
for (const s of only) if (!stores.includes(s)) throw new Error(`STORE has ${s}, but there is no src/app/${s}`);

const dropped = stores.filter((s) => !only.includes(s));
for (const store of dropped) for (const dir of [`src/app/${store}`, `public/${store}`]) rmSync(dir, { recursive: true, force: true });
console.log(`Building ${only.join(" and ")} alone, without ${dropped.join(", ")}`);
