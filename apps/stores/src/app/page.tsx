import Link from "next/link";

// Index of the demo storefronts. Each store lives under its own path and
// embeds slice.js the way a real merchant would.
const stores = [
  {
    href: "/marlow",
    name: "Marlow",
    kind: "Home & living · house brand only",
    note: "Tests taste → product description matching with no brand signal at all.",
  },
];

export default function Index() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <p className="mono text-mute">Slice</p>
      <h1 className="display mt-4 text-7xl">Demo storefronts</h1>
      <p className="mt-4 max-w-md text-mute">
        Realistic stores the concierge widget is developed and judged against.
      </p>
      <ul className="mt-12 border-t border-ink">
        {stores.map((s, i) => (
          <li key={s.href} className="border-b border-ink">
            <Link href={s.href} className="group grid gap-4 py-6 sm:grid-cols-[4rem_1fr_auto]">
              <span className="mono text-mute">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="display text-4xl group-hover:text-cobalt transition-colors">
                  {s.name}
                </span>
                <span className="mono mt-2 block text-mute">{s.kind}</span>
                <span className="mt-2 block text-sm">{s.note}</span>
              </span>
              <span className="mono self-end text-mute group-hover:text-cobalt">Open ↗</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
