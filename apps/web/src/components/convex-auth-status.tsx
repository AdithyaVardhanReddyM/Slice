"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";

/** Confirms the Clerk session reaches Convex. */
export function ConvexAuthStatus() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");

  if (isLoading) return <p>Connecting to Convex…</p>;
  if (!isAuthenticated) {
    return (
      <p className="text-destructive">
        Convex didn&apos;t accept the Clerk token. Check CLERK_JWT_ISSUER_DOMAIN
        and the Clerk → Convex integration.
      </p>
    );
  }
  if (viewer === undefined) return <p>Loading…</p>;

  return (
    <p>
      Convex sees you as{" "}
      <span className="font-medium text-foreground">
        {viewer?.email ?? viewer?.name ?? viewer?.subject}
      </span>
    </p>
  );
}
