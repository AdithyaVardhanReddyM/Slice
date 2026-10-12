// Absolute origin for canonical URLs, JSON-LD and Open Graph. Set
// NEXT_PUBLIC_SITE_URL explicitly; on Vercel it falls back to the deployment's
// production domain, and locally to the dev port.
const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;

export const SITE = fromEnv ?? fromVercel ?? "http://localhost:3002";
