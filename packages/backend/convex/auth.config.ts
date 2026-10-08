import type { AuthConfig } from "convex/server";

// Clerk issues the JWTs Convex verifies. Set CLERK_JWT_ISSUER_DOMAIN in the
// Convex dashboard (Settings → Environment Variables) to your Clerk Frontend API URL.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
