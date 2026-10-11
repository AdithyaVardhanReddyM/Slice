import Link from "next/link";
import { href } from "@/lib/ridgeline";

export default function NotFound() {
  return (
    <main className="rl-container py-32 text-center">
      <h1 className="rl-serif text-4xl">We could not find that page</h1>
      <p className="mt-3 text-rl-mute">It may have sold out, or the link is old.</p>
      <Link href={href.coffee} className="mt-8 inline-block rounded-[4px] bg-rl-ink px-6 py-3 text-sm font-semibold text-rl-cream hover:bg-rl-rust">
        Shop coffee
      </Link>
    </main>
  );
}
