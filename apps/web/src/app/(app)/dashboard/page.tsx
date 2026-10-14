import type { Metadata } from "next";
import { HomeView } from "@/components/console/home/home-view";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { conciergeHome } from "@/lib/mock/home";

export const metadata: Metadata = { title: "Home" };

/** Console home: how each service is doing, with the way into each. */
export default function HomePage() {
  return (
    <StandaloneShell>
      <HomeView concierge={conciergeHome()} />
    </StandaloneShell>
  );
}
