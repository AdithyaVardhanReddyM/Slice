import { Suspense } from "react";
import { ConciergeApp } from "@/components/concierge/app";

export const metadata = { title: "Concierge", robots: { index: false } };

export default function ConciergePage() {
  return (
    <Suspense fallback={null}>
      <ConciergeApp />
    </Suspense>
  );
}
