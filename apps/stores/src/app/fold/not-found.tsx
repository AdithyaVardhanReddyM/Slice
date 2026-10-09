import Link from "next/link";
import { href } from "@/lib/fold";

export default function NotFound() {
  return (
    <main className="px-4 py-36 text-center sm:px-8">
      <p className="tag text-fog">404</p>
      <h1 className="didone mt-6 text-7xl sm:text-9xl">
        not on <em>this rail.</em>
      </h1>
      <Link href={href.shop()} className="tag mt-10 inline-block rounded-full bg-bone px-6 py-3.5 text-night hover:bg-signal">
        Shop everything
      </Link>
    </main>
  );
}
