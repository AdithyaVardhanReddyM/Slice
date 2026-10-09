import Link from "next/link";
import { href } from "@/lib/fold";

export default function NotFound() {
  return (
    <main className="fd-container py-32 text-center">
      <p className="text-sm font-semibold text-fd-mute">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-[15px] text-fd-mute">It may have sold out or moved.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href={href.home} className="rounded-full bg-fd-ink px-6 py-3 text-sm font-semibold text-white hover:bg-fd-forest">
          Go to homepage
        </Link>
        <Link href={href.newIn} className="rounded-full border border-fd-ink px-6 py-3 text-sm font-semibold hover:bg-fd-ink hover:text-white">
          Shop new in
        </Link>
      </div>
    </main>
  );
}
