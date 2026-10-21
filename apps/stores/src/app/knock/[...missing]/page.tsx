import { notFound } from "next/navigation";

// Only the root not-found handles unmatched URLs, so anything under /knock that
// isn't a page lands here and renders Knock's own not-found inside its layout.
// With STORE=knock the proxy also rewrites other stores' paths here.
export default function Missing() {
  notFound();
}
