import { notFound } from "next/navigation";

// Only the root not-found handles unmatched URLs, so anything under /stackhouse that
// isn't a page lands here and renders Stackhouse's own not-found inside its
// layout. With STORE=folio the proxy also rewrites other stores' paths here.
export default function Missing() {
  notFound();
}
