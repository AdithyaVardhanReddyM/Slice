import Link from "next/link";

export default function NotFound() {
  return (
    <main className="px-4 py-32 text-center sm:px-6">
      <p className="mono text-mute">404</p>
      <h1 className="display mt-4 text-7xl">We don&apos;t make that one</h1>
      <Link href="/marlow" className="mono mt-8 inline-block text-cobalt link-rule">
        Back to the catalog →
      </Link>
    </main>
  );
}
