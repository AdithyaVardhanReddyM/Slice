import Link from "next/link";

// Index of the demo storefronts. Each store lives under its own path and
// embeds slice.js the way a real merchant would.
const stores = [
  {
    href: "/marlow",
    name: "Marlow",
    kind: "Home & living, house brand only",
    note: "Tests taste → product description matching with no brand signal at all.",
  },
  {
    href: "/fold",
    name: "Fold",
    kind: "Fashion & lifestyle from 24 labels, real and made-up",
    note: "Tests that recommendations follow taste, not brand fame: a third of the labels don't exist anywhere else.",
  },
  {
    href: "/ridgeline",
    name: "Ridgeline Coffee Roasters",
    kind: "Specialty coffee in Portland and Seattle, Austin opening soon",
    note: "Brand site for the Pages service: 12 coffees, 3 plans, 4 gift sets, cafés, journal. Intake is tested against its fonts, colours and copy.",
  },
  {
    href: "/saltline",
    name: "Saltline Hotels",
    kind: "Boutique hotels in Lisbon, Copenhagen and Barcelona",
    note: "Brand site for the Pages service: 3 hotels with 4 room tiers, 12 experiences, 4 offers and a plan-your-stay form.",
  },
  {
    href: "/tagide",
    name: "Tágide Festival",
    kind: "Music festival in Lisbon, 11–13 June 2027",
    note: "Brand site for the Pages service: 57 real acts on 4 stages, passes, day tickets and travel packages per origin city. The lineup is what Qloo re-ranks per audience.",
  },
  {
    href: "/gwen",
    name: "Gwen",
    kind: "Premium credit card at $695 with seven credits worth $2,140",
    note: "Brand site for the Pages service: one metal card whose perks span dining, tickets, streaming, hotels, travel, shopping and wellness. Each audience's page leads with the perks that fit its taste.",
  },
  {
    href: "/stackhouse",
    name: "Stackhouse Books",
    kind: "Independent bookshop in Brooklyn with 43 books and 5 events",
    note: "Brand site for the Email service: the brand setup reads its homepage, and campaign picks and links point at its book pages.",
  },
  {
    href: "/covers",
    name: "Covers",
    kind: "Restaurant booking app for 48 London restaurants",
    note: "Brand site for the Email service: campaign picks and links point at its restaurant pages.",
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
