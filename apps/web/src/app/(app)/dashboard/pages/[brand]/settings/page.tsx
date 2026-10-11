import type { Metadata } from "next";
import { BrandSettings } from "@/components/console/pages/settings";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Settings" };

export default function SettingsRoute() {
  return <BrandSettings />;
}
