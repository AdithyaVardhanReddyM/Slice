import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeView } from "@/components/console/home/home-view";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { visibleWidgets } from "@/lib/concierge/removed-server";

export const metadata: Metadata = { title: "Home" };

/** How many widgets are live, leaving out deleted ones. */
async function LiveWidgets() {
  const live = (await visibleWidgets()).filter((w) => w.status === "live").length;
  return live === 0 ? "No live widgets" : `${live} live ${live === 1 ? "widget" : "widgets"}`;
}

/** Console home: a way into each service. */
export default function HomePage() {
  return (
    <StandaloneShell>
      <HomeView
        liveWidgets={
          <Suspense>
            <LiveWidgets />
          </Suspense>
        }
      />
    </StandaloneShell>
  );
}
