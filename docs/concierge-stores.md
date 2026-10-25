# Concierge: store connections (Shopify via Composio, WooCommerce)

A widget's catalog can sync from the merchant's store platform instead of a file. The
merchant picks the platform when creating the widget, then connects it in setup's Catalog
step. Products come over in the Slice product shape, become the widget's own catalog, and
the tagging job describes them in Qloo's vocabulary.

```
Console (setup/step-catalog.tsx: ShopifyPanel, WooPanel; use-store-connection.ts)
  │ /api/concierge/catalog/{status,connect,woo-keys,sync,disconnect}
  │   (owner check: catalogConnections.forWidget with the merchant's Clerk token)
  ▼
Agent (apps/agent/slice_catalog: sync.py + routes.py)
  ├─ Shopify (shopify.py) ── Composio, user "concierge-widget:<key>"
  │    connected_accounts.initiate(subdomain) → Shopify consent popup → /store-connected
  │    tools.proxy → Admin GraphQL (products, variants, media), paced by query cost
  └─ WooCommerce (woocommerce.py) ── direct, not in Composio
       /wc-auth/v1/authorize popup → WooCommerce POSTs the key to
       /api/concierge/catalog/woocommerce/callback (public, matched by one-time state)
       or the merchant pastes ck_/cs_ keys; REST wc/v3 (Basic over https, OAuth 1.0a over http)
  ▼
mapping.py → Slice products (key:value tags round-trip the Shopify CSV export)
  │ Convex HTTP /catalog/sync → catalogConnections.applySync
  ▼
store "<widgetKey>" (or "<key>-own" for a demo master), widget.catalogKey points at it,
then tag_store() in the background
```

## State

`catalogConnections` (one per widget): platform, status (`pending` → `connected` /
`syncing` / `error`), shop, Composio account id (Shopify), Fernet-sealed REST key
(WooCommerce, readable only by the agent), product and skipped counts, last sync, error.
The console subscribes to `catalogConnections.forWidget`, which never returns the key.

A synced catalog never overwrites a shared demo store: it is written under the widget's own
key and the widget serves it through `conciergeWidgets.catalogKey`. Disconnecting a demo
widget clears `catalogKey`, so it serves the demo catalog again.

## Setup

In `apps/agent/.env`:

- `COMPOSIO_API_KEY` (already used by Pages CRM; needs write permissions).
- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`: Composio has no managed Shopify app, so
  create one in the Shopify Dev Dashboard with `read_products,read_inventory` and the
  redirect URL `https://backend.composio.dev/api/v1/auth-apps/add`. The first connect creates
  the Composio auth config "Slice catalog (read-only)" from them. Or create the auth config
  yourself and set `COMPOSIO_SHOPIFY_AUTH_CONFIG_ID`.
- `CATALOG_SECRET_KEY`: any passphrase; seals WooCommerce keys.

In `apps/web`: `SLICE_PUBLIC_URL` (optional) is the console's https address. WooCommerce
only posts approved keys to https, so local dev without a tunnel uses pasted keys.

## Not built

No platform webhooks (sync is on demand: first connect, then "Sync now"), at most 2,500
products per sync, 30 variants and 4 images per Shopify product, and the mock create flow
still opens the sample Ostro widget, which has no saved widget to connect.
