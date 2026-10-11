"use client";

import { createContext, useContext } from "react";
import type { Brand } from "@/lib/pages/types";

const BrandContext = createContext<Brand | null>(null);

export const BrandProvider = BrandContext.Provider;

/** The brand the hub layout resolved from the URL slug. Only valid under /dashboard/pages/[brand]. */
export function useBrand(): Brand {
  const b = useContext(BrandContext);
  if (!b) throw new Error("useBrand must be used inside the brand hub layout");
  return b;
}
