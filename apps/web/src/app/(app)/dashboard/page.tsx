import type { Metadata } from "next";
import { HomeView } from "@/components/console/home/home-view";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { widgets } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Home" };

/** Console home: a way into each service. */
export default function HomePage() {
  return (
    <StandaloneShell>
      <HomeView liveWidgets={widgets.filter((w) => w.status === "live").length} />
    </StandaloneShell>
  );
}
