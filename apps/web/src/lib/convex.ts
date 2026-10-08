import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_CONVEX_URL — run `pnpm --filter @slice/backend run convex:setup` and copy CONVEX_URL into apps/web/.env.local",
  );
}

export const convex = new ConvexReactClient(convexUrl);
