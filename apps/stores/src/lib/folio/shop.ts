// Folio & Fern site helpers: routes, lookups and photos. The data itself is in
// ./books.ts (shared with the Email service's demo data).

import { FOLIO_BOOKS, FOLIO_EVENTS, FOLIO_SECTIONS, FOLIO_SHOP, FOLIO_STAFF, type FolioBook, type FolioEvent, type FolioSectionId, type FolioStaffId } from "./books";

export * from "./books";

export const href = {
  home: "/folio",
  books: "/folio/books",
  book: (slug: string) => `/folio/books/${slug}`,
  section: (id: FolioSectionId) => `/folio/books#${id}`,
  search: (q: string) => `/folio/books?q=${encodeURIComponent(q)}`,
  events: "/folio/events",
  event: (slug: string) => `/folio/events#${slug}`,
  newArrivals: "/folio#new",
  staffPicks: "/folio#staff-picks",
  bookClub: "/folio/events#book-club",
  visit: "/folio#visit",
  newsletter: "/folio#newsletter",
};

export const bookBySlug = (slug: string) => FOLIO_BOOKS.find((b) => b.slug === slug);
export const section = (id: FolioSectionId) => FOLIO_SECTIONS.find((s) => s.id === id)!;
export const staff = (id: FolioStaffId) => FOLIO_STAFF.find((s) => s.id === id)!;
/** A role mid-sentence: "Kids and YA" → "kids and YA". */
export const roleText = (role: string) => role.charAt(0).toLowerCase() + role.slice(1);
export const booksIn = (id: FolioSectionId) => FOLIO_BOOKS.filter((b) => b.section === id);
export const newArrivals = () => FOLIO_BOOKS.filter((b) => b.isNew);
export const eventBySlug = (slug: string) => FOLIO_EVENTS.find((e) => e.slug === slug);

type Picked = FolioBook & { staffNote: NonNullable<FolioBook["staffNote"]> };

/** One staff pick per bookseller (Theo, Ines, Jonah, Maeve, Sam, Priya). */
export function staffPicks(): Picked[] {
  const slugs = ["western-lane", "piranesi", "the-searcher", "small-things-like-these", "braiding-sweetgrass", "the-girl-who-drank-the-moon"];
  return slugs.map((slug) => bookBySlug(slug)).filter((b): b is Picked => !!b?.staffNote);
}

/** Same section first, then the rest, without the book itself. */
export function moreLike(book: FolioBook, take = 4): FolioBook[] {
  const same = FOLIO_BOOKS.filter((b) => b.section === book.section && b.slug !== book.slug);
  const overlap = (b: FolioBook) => b.tags.filter((t) => book.tags.includes(t)).length;
  const others = FOLIO_BOOKS.filter((b) => b.section !== book.section && overlap(b) > 0).sort((a, b) => overlap(b) - overlap(a));
  return [...same, ...others].slice(0, take);
}

export function searchBooks(q: string): FolioBook[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return FOLIO_BOOKS.filter((b) => {
    const hay = [b.title, b.author, section(b.section).name, ...b.tags, b.description].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** "Thursday, October 22" → { month: "Oct", day: "22", weekday: "Thu" }. */
export function dateParts(e: FolioEvent) {
  const d = new Date(e.startsAt);
  const tz = "America/New_York";
  return {
    month: d.toLocaleString("en-US", { month: "short", timeZone: tz }),
    day: d.toLocaleString("en-US", { day: "numeric", timeZone: tz }),
    weekday: d.toLocaleString("en-US", { weekday: "short", timeZone: tz }),
  };
}

export const address = `${FOLIO_SHOP.street}, ${FOLIO_SHOP.city}, ${FOLIO_SHOP.region} ${FOLIO_SHOP.postalCode}`;

/** Photos in public/folio/photos, from Pexels (photographer in `credit`). */
export const photos = {
  shopReading: { src: "/folio/photos/shop-reading.jpg", alt: "A customer reading between the shelves by the chalkboard wall", credit: "Ytalo Marcos" },
  storefront: { src: "/folio/photos/storefront.jpg", alt: "The green shopfront on Court Street with a table of books outside", credit: "Huy Phan" },
  authorTalk: { src: "/folio/photos/author-talk.jpg", alt: "An author talking with a small audience in the reading room", credit: "cottonbro studio" },
  storyHour: { src: "/folio/photos/story-hour.jpg", alt: "A parent and two children reading in the kids' corner", credit: "Rachel Claire" },
  bookClub: { src: "/folio/photos/book-club.jpg", alt: "Book club members laughing over their copies", credit: "Damian Santos" },
};

export const eventPhoto = (e: FolioEvent) => (e.photo === "author-talk" ? photos.authorTalk : e.photo === "story-hour" ? photos.storyHour : e.photo === "book-club" ? photos.bookClub : undefined);
