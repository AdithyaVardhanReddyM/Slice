"""Catalog sync from a merchant's store platform, for the concierge.

A widget connects one store in the console's setup (Catalog step):

- Shopify, through Composio (shopify.py). Composio holds the OAuth token for
  Slice's Shopify app; every Admin API call goes through its proxy.
- WooCommerce, directly (woocommerce.py). Composio has no WooCommerce toolkit,
  so Slice uses WooCommerce's own key-approval screen (or keys the merchant
  pastes) and its REST API. The read-only keys are stored encrypted (vault.py).

Either way the products are mapped into the Slice product shape (mapping.py),
written to the widget's own store in Convex (catalogConnections.ts), and then
described in Qloo's tag vocabulary by the tagging job. sync.py runs it;
routes.py is the HTTP side.
"""
