import type { Metadata } from "next";
import { BrandKitPage } from "@/components/console/pages/kit-page";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Brand kit" };

export default function KitRoute() {
  return <BrandKitPage />;
}
