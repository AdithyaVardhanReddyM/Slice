import { Suspense } from "react";
import { Notify } from "./notify";

/**
 * Where Shopify (through Composio) and WooCommerce send the store-connect
 * popup once the merchant has approved Slice, or declined. Tells the console
 * that opened it, then closes itself.
 */
export default function StoreConnected({ searchParams }: PageProps<"/store-connected">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
      <Suspense>
        <Result searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Result({ searchParams }: { searchParams: PageProps<"/store-connected">["searchParams"] }) {
  const q = await searchParams;
  // WooCommerce adds success=0 when the merchant declines; Composio adds status=failed.
  const declined = q.success === "0" || q.status === "failed";
  return (
    <div className="space-y-1">
      <Notify platform={typeof q.platform === "string" ? q.platform : null} ok={!declined} />
      <h1 className="text-base font-semibold">{declined ? "Not connected" : "Connected"}</h1>
      <p className="text-sm text-muted-foreground">
        {declined
          ? "Slice wasn't given access. You can close this window and try again."
          : "You can close this window and go back to Slice."}
      </p>
    </div>
  );
}
