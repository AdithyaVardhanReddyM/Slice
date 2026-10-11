import Link from "next/link";
import { href } from "@/lib/saltline";

export default function NotFound() {
  return (
    <main className="sl-container py-32 text-center">
      <h1 className="sl-serif text-5xl">That page is not here</h1>
      <p className="mt-4 text-sl-mute">The link may be old, or the room may have changed its name.</p>
      <Link href={href.hotels} className="mt-8 inline-block border border-sl-charcoal px-6 py-3 text-[15px] font-medium hover:bg-sl-charcoal hover:text-sl-paper">
        See the hotels
      </Link>
    </main>
  );
}
