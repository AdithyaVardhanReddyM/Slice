"use client";

import { useEffect } from "react";

/**
 * Where Composio sends the CRM connect popup once the merchant has signed in.
 * Tells the console that opened it, then closes itself.
 */
export default function CrmConnected() {
  useEffect(() => {
    window.opener?.postMessage({ type: "slice:crm-connected" }, window.location.origin);
    const t = setTimeout(() => window.close(), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Connected</h1>
        <p className="text-sm text-muted-foreground">You can close this window and go back to Slice.</p>
      </div>
    </main>
  );
}
