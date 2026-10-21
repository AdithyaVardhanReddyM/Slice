import { notFound } from "next/navigation";

// Only the root not-found handles unmatched URLs, so anything under /halfmoon
// that isn't a page lands here and renders Half Moon's own not-found inside its
// layout. With STORE=halfmoon the proxy also rewrites other stores' paths here.
export default function Missing() {
  notFound();
}
