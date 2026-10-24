"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@slice/backend/convex/_generated/api";

/**
 * The signed-in account's own widget for a store, created on first visit the
 * way Pages and Email give every account its own demo brands. Undefined while
 * loading or being created; null when there's no such store yet.
 */
export function useMyWidget(storeKey: string) {
  const mine = useQuery(api.conciergeWidgets.mine, { storeKey });
  const provision = useMutation(api.conciergeWidgets.provision);
  const asked = useRef(false);
  useEffect(() => {
    if (mine !== "provision" || asked.current) return;
    asked.current = true;
    void provision();
  }, [mine, provision]);
  return mine === "provision" ? undefined : mine;
}
