import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ConvexAuthStatus } from "@/components/convex-auth-status";

export const metadata: Metadata = { title: "Dashboard" };

// Protected by src/proxy.ts. Concierge setup, catalog and insights land here.
export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/">
          <Image
            src="/brand/slice_logo_blktext.svg"
            alt="Slice"
            width={96}
            height={23}
          />
        </Link>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <p>Dashboard coming soon.</p>
        <ConvexAuthStatus />
      </main>
    </div>
  );
}
