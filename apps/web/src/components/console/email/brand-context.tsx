"use client";

import { createContext, useContext } from "react";
import type { EmailBrand } from "@/lib/email/types";

const EmailBrandContext = createContext<EmailBrand | null>(null);

/** Set by the brand layout once it has resolved the brand from the URL slug. */
export const EmailBrandProvider = EmailBrandContext.Provider;

/** The brand the layout resolved from the URL slug. Only valid under /dashboard/email/[brand]. */
export function useEmailBrand(): EmailBrand {
  const b = useContext(EmailBrandContext);
  if (!b) throw new Error("useEmailBrand must be used inside the email brand layout");
  return b;
}
