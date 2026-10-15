import { notFound } from "next/navigation";

// Only the root not-found handles unmatched URLs, so anything under /covers that
// isn't a page lands here and renders Covers' own not-found inside its layout.
// With STORE=covers the proxy also rewrites other stores' paths here.
export default function Missing() {
  notFound();
}
