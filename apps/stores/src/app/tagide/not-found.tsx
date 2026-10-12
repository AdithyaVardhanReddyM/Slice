import Link from "next/link";
import { href } from "@/lib/tagide";

export default function NotFound() {
  return (
    <main className="tg-container py-32 text-center">
      <h1 className="tg-display text-[56px]">Not on the bill</h1>
      <p className="mt-4 text-tg-mute">That page is not here. The lineup changes; links sometimes do too.</p>
      <Link href={href.lineup} className="tg-btn mt-8 bg-tg-ink text-tg-cream hover:bg-black">
        See the lineup
      </Link>
    </main>
  );
}
