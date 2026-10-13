import { notFound } from "next/navigation";

// Only the root not-found handles unmatched URLs, so anything under /gwen that
// isn't a page lands here and renders Gwen's own not-found inside its layout.
// With STORE=gwen the proxy also rewrites other stores' paths to this route.
export default function Missing() {
  notFound();
}
