// Folio & Fern, the Email service's demo brand: an independent bookshop on
// Court Street in Carroll Gardens, Brooklyn (fictional). Everything the seed
// (emailSeed.ts) needs, as plain data: the catalog, the shop's kit, about,
// footer and sender, two contact lists and three hand-written campaign docs.
// No Convex imports.
//
// The shop's site is apps/stores (/folio). The block between the "shared"
// markers below is copied verbatim to apps/stores/src/lib/folio/books.ts, so
// the site and the emails sell the same books: edit it here, then copy it over.
//
// Item references: campaign docs point at books as `slug:<book slug>` (and at
// events as `event:<event slug>`) in ItemsBlock.itemIds and as the keys of
// ItemsBlock.reasons. `folioItems()` returns each item with that `ref`, so the
// seed swaps refs for the emailItems ids it creates. See `folioRef`.

import type { EmailAbout, EmailDoc, EmailFooterInfo, EmailItem, EmailKit, EmailSender } from "./emailTypes";

/* ---- shared with apps/stores/src/lib/folio/books.ts ---- */

export type FolioSectionId =
  | "literary-fiction"
  | "translated-fiction"
  | "sci-fi-fantasy"
  | "crime-suspense"
  | "ideas-nonfiction"
  | "poetry"
  | "cookbooks"
  | "kids-ya";

export interface FolioSection {
  id: FolioSectionId;
  name: string;
  /** One line for the shelf heading. */
  blurb: string;
}

export const FOLIO_SECTIONS: FolioSection[] = [
  { id: "literary-fiction", name: "Literary fiction", blurb: "Novels about people, closely observed, from new voices and old favorites." },
  { id: "translated-fiction", name: "Fiction in translation", blurb: "Our favorite books from Tokyo, Turin, Berlin and Buenos Aires." },
  { id: "sci-fi-fantasy", name: "Sci-fi & fantasy", blurb: "Other worlds, near futures and a few very strange houses." },
  { id: "crime-suspense", name: "Crime & suspense", blurb: "Slow burns, spies, cold cases and one perfect sociopath." },
  { id: "ideas-nonfiction", name: "Ideas & nonfiction", blurb: "Science, history and essays that change what you notice." },
  { id: "poetry", name: "Poetry", blurb: "Collections we read aloud in the shop after closing." },
  { id: "cookbooks", name: "Cookbooks", blurb: "The ones with sauce on the pages at home." },
  { id: "kids-ya", name: "Kids & YA", blurb: "Picture books, chapter books and novels for teens." },
];

export type FolioStaffId = "maeve" | "theo" | "ines" | "jonah" | "sam" | "priya";

export interface FolioStaff {
  id: FolioStaffId;
  name: string;
  role: string;
}

export const FOLIO_STAFF: FolioStaff[] = [
  { id: "maeve", name: "Maeve Calloway", role: "Owner" },
  { id: "theo", name: "Theo Brandt", role: "Fiction buyer" },
  { id: "ines", name: "Ines Duarte", role: "Sci-fi, fantasy and events" },
  { id: "jonah", name: "Jonah Weiss", role: "Crime and thrillers" },
  { id: "sam", name: "Sam Okonkwo", role: "Nonfiction and poetry" },
  { id: "priya", name: "Priya Raman", role: "Kids and YA" },
];

export interface FolioBook {
  slug: string;
  title: string;
  author: string;
  section: FolioSectionId;
  /** A few lowercase words that help match taste. */
  tags: string[];
  /** USD, e.g. "$18.00". */
  price: string;
  format: "Paperback" | "Hardcover";
  /** First published (in English for translations, original year otherwise). */
  year: number;
  /** Open Library cover, checked to load at authoring time. */
  cover: string;
  /** Our own words, one or two sentences. */
  description: string;
  staffNote?: { by: FolioStaffId; text: string };
  /** On the "New on our shelves" table. */
  isNew?: boolean;
  /** Kids' books: who it's for. */
  ages?: string;
}

const cover = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

export const FOLIO_BOOKS: FolioBook[] = [
  // Literary fiction
  {
    slug: "intermezzo",
    title: "Intermezzo",
    author: "Sally Rooney",
    section: "literary-fiction",
    tags: ["literary fiction", "irish", "brothers", "grief", "love"],
    price: "$19.00",
    format: "Paperback",
    year: 2024,
    cover: cover(14836043),
    description: "Two Dublin brothers, fourteen years apart and nothing alike, grieve their father in very different ways. Rooney's longest novel and her tenderest, with chess as its quiet metronome.",
    isNew: true,
  },
  {
    slug: "small-things-like-these",
    title: "Small Things Like These",
    author: "Claire Keegan",
    section: "literary-fiction",
    tags: ["literary fiction", "irish", "novella", "historical", "moral courage"],
    price: "$14.00",
    format: "Paperback",
    year: 2021,
    cover: cover(12433542),
    description: "In a small Irish town in 1985, a coal merchant on his Christmas deliveries sees something at the convent he can't unsee. You'll finish it in an evening and think about it for a year.",
    staffNote: { by: "maeve", text: "I hand this to everyone who says they don't have time to read. It's 114 pages and it will rearrange you." },
  },
  {
    slug: "orbital",
    title: "Orbital",
    author: "Samantha Harvey",
    section: "literary-fiction",
    tags: ["literary fiction", "space", "short novel", "meditative", "booker prize"],
    price: "$17.00",
    format: "Paperback",
    year: 2023,
    cover: cover(14541972),
    description: "One day aboard the International Space Station: sixteen sunrises, six astronauts and the whole Earth turning below. Plotless in the best way, a book that slows your breathing down.",
    isNew: true,
  },
  {
    slug: "the-bee-sting",
    title: "The Bee Sting",
    author: "Paul Murray",
    section: "literary-fiction",
    tags: ["literary fiction", "irish", "family saga", "dark comedy"],
    price: "$20.00",
    format: "Paperback",
    year: 2023,
    cover: cover(14406691),
    description: "An Irish family's fortunes come apart after the crash, told by each of the four Barnes in turn. Funny, sad and enormous, with an ending people still argue about at our counter.",
  },
  {
    slug: "western-lane",
    title: "Western Lane",
    author: "Chetna Maroo",
    section: "literary-fiction",
    tags: ["literary fiction", "debut", "grief", "sisters", "sport"],
    price: "$17.00",
    format: "Paperback",
    year: 2023,
    cover: cover(14771234),
    description: "Eleven-year-old Gopi plays squash for hours a day while her family quietly comes apart after her mother's death. Spare, exact and moving, in under two hundred pages.",
    staffNote: { by: "theo", text: "The sound of a squash ball in an empty court has never been so sad. A debut that does more in 160 pages than most novels do in 400." },
    isNew: true,
  },
  {
    slug: "the-safekeep",
    title: "The Safekeep",
    author: "Yael van der Wouden",
    section: "literary-fiction",
    tags: ["literary fiction", "historical", "queer", "debut", "postwar"],
    price: "$19.00",
    format: "Paperback",
    year: 2024,
    cover: cover(14631041),
    description: "The Dutch countryside, summer 1961: a woman living alone in her grandmother's house has to take in a stranger, and the house starts to give up its secrets. Slow, sensual and sharp.",
    isNew: true,
  },
  {
    slug: "stoner",
    title: "Stoner",
    author: "John Williams",
    section: "literary-fiction",
    tags: ["literary fiction", "classic", "campus novel", "american"],
    price: "$17.95",
    format: "Paperback",
    year: 1965,
    cover: cover(8310729),
    description: "The quiet life of a Missouri English professor, his unhappy marriage and his one great love, which is literature. Almost nothing happens, and it is completely gripping.",
  },

  // Fiction in translation
  {
    slug: "kitchen",
    title: "Kitchen",
    author: "Banana Yoshimoto",
    section: "translated-fiction",
    tags: ["translated fiction", "japanese", "novella", "grief", "found family"],
    price: "$16.00",
    format: "Paperback",
    year: 1993,
    cover: cover(569477),
    description: "Two novellas about grief, food and found family in 1980s Tokyo, as light and strange as a midnight snack. The first Japanese novel for a lot of our regulars.",
  },
  {
    slug: "the-days-of-abandonment",
    title: "The Days of Abandonment",
    author: "Elena Ferrante",
    section: "translated-fiction",
    tags: ["translated fiction", "italian", "marriage", "psychological"],
    price: "$17.00",
    format: "Paperback",
    year: 2005,
    cover: cover(11527614),
    description: "Olga's husband leaves her in a Turin summer, and over a few feverish weeks her life, her apartment and her sentences unravel. Ferrante at her most ferocious.",
  },
  {
    slug: "convenience-store-woman",
    title: "Convenience Store Woman",
    author: "Sayaka Murata",
    section: "translated-fiction",
    tags: ["translated fiction", "japanese", "work", "outsider", "dark comedy"],
    price: "$16.00",
    format: "Paperback",
    year: 2018,
    cover: cover(9315164),
    description: "Keiko has worked the same Tokyo convenience store for eighteen years and is perfectly happy, which nobody around her can accept. Deadpan, odd and very funny.",
  },
  {
    slug: "kairos",
    title: "Kairos",
    author: "Jenny Erpenbeck",
    section: "translated-fiction",
    tags: ["translated fiction", "german", "love affair", "history", "berlin"],
    price: "$18.00",
    format: "Paperback",
    year: 2023,
    cover: cover(13913814),
    description: "A nineteen-year-old student and a married writer in his fifties begin an affair in East Berlin in 1986, and as their country comes apart, so do they. Winner of the 2024 International Booker.",
    staffNote: { by: "maeve", text: "A love story with the Wall coming down behind it. If you read Rooney for the way two people talk past each other, start here." },
    isNew: true,
  },
  {
    slug: "fever-dream",
    title: "Fever Dream",
    author: "Samanta Schweblin",
    section: "translated-fiction",
    tags: ["translated fiction", "argentinian", "horror", "novella", "eco-anxiety"],
    price: "$16.00",
    format: "Paperback",
    year: 2017,
    cover: cover(8826783),
    description: "A woman lies dying in a rural Argentine clinic while a boy at her bedside makes her remember exactly what happened. Short and eerie; read it in one sitting, with the lights on.",
  },

  // Sci-fi & fantasy
  {
    slug: "the-dispossessed",
    title: "The Dispossessed",
    author: "Ursula K. Le Guin",
    section: "sci-fi-fantasy",
    tags: ["science fiction", "classic", "utopia", "politics", "philosophy"],
    price: "$18.99",
    format: "Paperback",
    year: 1974,
    cover: cover(6979680),
    description: "A physicist leaves his anarchist moon to visit the rich planet it broke away from, and neither world looks the same by the end. Le Guin's great novel about freedom, walls and what we owe each other.",
  },
  {
    slug: "the-fifth-season",
    title: "The Fifth Season",
    author: "N. K. Jemisin",
    section: "sci-fi-fantasy",
    tags: ["fantasy", "science fiction", "apocalypse", "trilogy", "geology"],
    price: "$17.99",
    format: "Paperback",
    year: 2015,
    cover: cover(8133598),
    description: "On a continent shaken by apocalyptic earthquakes, a woman searches for her daughter while the world ends, again. The first of a trilogy that won the Hugo three years running.",
  },
  {
    slug: "piranesi",
    title: "Piranesi",
    author: "Susanna Clarke",
    section: "sci-fi-fantasy",
    tags: ["fantasy", "mystery", "labyrinth", "short novel"],
    price: "$18.00",
    format: "Paperback",
    year: 2020,
    cover: cover(10226290),
    description: "A man lives alone in an endless house of marble halls, statues and tides, keeping careful journals. Then the journals start to contradict him.",
    staffNote: { by: "ines", text: "The book I give people who say they don't read fantasy. Strange, kind and over far too soon." },
  },
  {
    slug: "a-psalm-for-the-wild-built",
    title: "A Psalm for the Wild-Built",
    author: "Becky Chambers",
    section: "sci-fi-fantasy",
    tags: ["science fiction", "solarpunk", "cozy", "hopepunk", "novella"],
    price: "$20.99",
    format: "Hardcover",
    year: 2021,
    cover: cover(10476616),
    description: "A traveling tea monk on a gentle future moon meets a robot who wants to know what people need. Hopeful science fiction you can read in an afternoon.",
    staffNote: { by: "ines", text: "Prescribed at this counter for burnout, bad news weeks and Sunday nights." },
  },
  {
    slug: "the-ministry-of-time",
    title: "The Ministry of Time",
    author: "Kaliane Bradley",
    section: "sci-fi-fantasy",
    tags: ["science fiction", "time travel", "romance", "debut", "spy"],
    price: "$19.00",
    format: "Paperback",
    year: 2024,
    cover: cover(14621125),
    description: "A civil servant is assigned to look after a Victorian polar explorer pulled into present-day London, and they fall for each other. Time travel, spy thriller and romantic comedy at once.",
    isNew: true,
  },
  {
    slug: "annihilation",
    title: "Annihilation",
    author: "Jeff VanderMeer",
    section: "sci-fi-fantasy",
    tags: ["science fiction", "weird fiction", "horror", "nature"],
    price: "$17.00",
    format: "Paperback",
    year: 2014,
    cover: cover(8408974),
    description: "Four women cross into Area X, a stretch of coast where nature has turned strange, beautiful and wrong. The first Southern Reach book, best read on a humid night.",
  },

  // Crime & suspense
  {
    slug: "the-searcher",
    title: "The Searcher",
    author: "Tana French",
    section: "crime-suspense",
    tags: ["crime", "mystery", "irish", "slow burn"],
    price: "$18.00",
    format: "Paperback",
    year: 2020,
    cover: cover(10213619),
    description: "A retired Chicago cop buys a run-down cottage in the west of Ireland and is drawn into the case of a missing local boy. All wet hills, long silences and slowly tightening suspense.",
    staffNote: { by: "jonah", text: "Tana French writes suspense like weather: you feel it before you see it. Save it for a long, rainy weekend." },
  },
  {
    slug: "slow-horses",
    title: "Slow Horses",
    author: "Mick Herron",
    section: "crime-suspense",
    tags: ["thriller", "spy", "british", "dark comedy", "series"],
    price: "$17.95",
    format: "Paperback",
    year: 2010,
    cover: cover(8982363),
    description: "Disgraced MI5 agents are parked in a crumbling London office to push paper, until a kidnapping hands them a shot at redemption. Sharp, funny and very British.",
    staffNote: { by: "jonah", text: "Come for the spycraft, stay for Jackson Lamb, the most disgusting and brilliant boss in fiction." },
  },
  {
    slug: "the-talented-mr-ripley",
    title: "The Talented Mr. Ripley",
    author: "Patricia Highsmith",
    section: "crime-suspense",
    tags: ["crime", "classic", "psychological", "italy", "suspense"],
    price: "$16.95",
    format: "Paperback",
    year: 1955,
    cover: cover(14640311),
    description: "Tom Ripley is sent to Italy to bring a rich man's son home, and decides he would rather become him. The original charming sociopath, and you will root for him.",
  },
  {
    slug: "razorblade-tears",
    title: "Razorblade Tears",
    author: "S. A. Cosby",
    section: "crime-suspense",
    tags: ["crime", "thriller", "southern noir", "revenge", "fathers"],
    price: "$18.99",
    format: "Paperback",
    year: 2021,
    cover: cover(10480276),
    description: "Two ex-con fathers, one Black and one white, team up to find who killed their sons, and face what they couldn't accept about them while they were alive. Brutal, big-hearted Southern noir.",
  },
  {
    slug: "the-secret-history",
    title: "The Secret History",
    author: "Donna Tartt",
    section: "crime-suspense",
    tags: ["crime", "literary fiction", "campus novel", "dark academia", "classic"],
    price: "$18.00",
    format: "Paperback",
    year: 1992,
    cover: cover(744854),
    description: "A circle of classics students at a Vermont college commit a murder, and you learn who on the first page. The question is why, and what it costs them.",
  },
  {
    slug: "the-god-of-the-woods",
    title: "The God of the Woods",
    author: "Liz Moore",
    section: "crime-suspense",
    tags: ["crime", "mystery", "literary suspense", "summer camp", "family secrets"],
    price: "$20.00",
    format: "Paperback",
    year: 2024,
    cover: cover(14645734),
    description: "A teenage girl vanishes from an Adirondack summer camp in 1975, fourteen years after her brother disappeared from the same woods. A big, absorbing mystery with a lot of heart.",
    isNew: true,
  },

  // Ideas & nonfiction
  {
    slug: "braiding-sweetgrass",
    title: "Braiding Sweetgrass",
    author: "Robin Wall Kimmerer",
    section: "ideas-nonfiction",
    tags: ["nature writing", "science", "indigenous", "essays", "ecology"],
    price: "$20.00",
    format: "Paperback",
    year: 2013,
    cover: cover(7281575),
    description: "A botanist and member of the Citizen Potawatomi Nation braids together plant science, Indigenous knowledge and her own life to ask how we might live well with the land.",
    staffNote: { by: "sam", text: "I gave this to my dad, who gave it to his whole hiking club. It changes what you notice on a walk." },
  },
  {
    slug: "entangled-life",
    title: "Entangled Life",
    author: "Merlin Sheldrake",
    section: "ideas-nonfiction",
    tags: ["science", "nature", "biology", "fungi", "popular science"],
    price: "$19.00",
    format: "Paperback",
    year: 2020,
    cover: cover(10152882),
    description: "A young biologist goes deep into fungi: the networks under forests, the yeast in our bread and the mushrooms that change minds. You won't look at a mushroom the same way.",
  },
  {
    slug: "the-dawn-of-everything",
    title: "The Dawn of Everything",
    author: "David Graeber and David Wengrow",
    section: "ideas-nonfiction",
    tags: ["history", "anthropology", "politics", "big ideas"],
    price: "$22.00",
    format: "Paperback",
    year: 2021,
    cover: cover(11359192),
    description: "An anthropologist and an archaeologist argue that early human societies were far more varied and inventive than the usual story allows. Big, combative and full of ideas.",
  },
  {
    slug: "how-to-do-nothing",
    title: "How to Do Nothing",
    author: "Jenny Odell",
    section: "ideas-nonfiction",
    tags: ["essays", "attention", "technology", "nature", "art"],
    price: "$18.00",
    format: "Paperback",
    year: 2019,
    cover: cover(8750439),
    description: "An Oakland artist makes the case for paying attention to birds, neighbors and places instead of feeds. A gentle manifesto for anyone tired of their phone.",
  },
  {
    slug: "say-nothing",
    title: "Say Nothing",
    author: "Patrick Radden Keefe",
    section: "ideas-nonfiction",
    tags: ["history", "true crime", "ireland", "politics", "narrative nonfiction"],
    price: "$20.00",
    format: "Paperback",
    year: 2018,
    cover: cover(9242450),
    description: "The 1972 disappearance of a mother of ten in Belfast opens out into a history of the Troubles and the people who never stopped carrying them. Reads like a thriller; all of it happened.",
  },
  {
    slug: "an-immense-world",
    title: "An Immense World",
    author: "Ed Yong",
    section: "ideas-nonfiction",
    tags: ["science", "animals", "nature", "senses", "popular science"],
    price: "$21.00",
    format: "Paperback",
    year: 2022,
    cover: cover(12835209),
    description: "How other animals sense the world: the electric fields of fish, the ultraviolet of birds, the slow vision of a scallop. A science book that's mostly wonder.",
  },

  // Poetry
  {
    slug: "time-is-a-mother",
    title: "Time Is a Mother",
    author: "Ocean Vuong",
    section: "poetry",
    tags: ["poetry", "grief", "family", "queer", "vietnamese american"],
    price: "$18.00",
    format: "Paperback",
    year: 2022,
    cover: cover(11465692),
    description: "Vuong's second collection, written after his mother's death: poems about grief, survival and the strange tenderness of staying alive.",
    staffNote: { by: "sam", text: "Read it slowly, out loud if you can. It's the collection people come back to buy for a friend." },
  },
  {
    slug: "postcolonial-love-poem",
    title: "Postcolonial Love Poem",
    author: "Natalie Diaz",
    section: "poetry",
    tags: ["poetry", "indigenous", "love", "pulitzer prize"],
    price: "$16.00",
    format: "Paperback",
    year: 2020,
    cover: cover(10120222),
    description: "Poems of desire, rivers and the body from a Mojave poet and former professional basketball player. It won the Pulitzer and earns every word.",
  },
  {
    slug: "devotions",
    title: "Devotions",
    author: "Mary Oliver",
    section: "poetry",
    tags: ["poetry", "nature", "collected poems", "classic"],
    price: "$20.00",
    format: "Paperback",
    year: 2017,
    cover: cover(10326261),
    description: "Mary Oliver chose these herself from fifty years of work: geese, ponds, grasshoppers and how to pay attention. The poetry book we wrap most often in December.",
  },
  {
    slug: "bluets",
    title: "Bluets",
    author: "Maggie Nelson",
    section: "poetry",
    tags: ["poetry", "essays", "lyric", "heartbreak", "art"],
    price: "$16.00",
    format: "Paperback",
    year: 2009,
    cover: cover(8457107),
    description: "240 numbered fragments about the color blue, heartbreak and looking closely. Part poem, part essay, entirely its own thing.",
  },

  // Cookbooks
  {
    slug: "salt-fat-acid-heat",
    title: "Salt, Fat, Acid, Heat",
    author: "Samin Nosrat",
    section: "cookbooks",
    tags: ["cookbook", "cooking basics", "technique", "illustrated"],
    price: "$40.00",
    format: "Hardcover",
    year: 2017,
    cover: cover(8315567),
    description: "The four elements of good cooking, taught so you can cook without a recipe. Wendy MacNaughton's drawings make it the friendliest cooking school there is.",
  },
  {
    slug: "ottolenghi-simple",
    title: "Ottolenghi Simple",
    author: "Yotam Ottolenghi",
    section: "cookbooks",
    tags: ["cookbook", "vegetables", "mediterranean", "weeknight"],
    price: "$35.00",
    format: "Hardcover",
    year: 2018,
    cover: cover(10470345),
    description: "Ottolenghi's big flavors in recipes that take thirty minutes, ten ingredients or one pan. The one we actually cook from on weeknights.",
  },
  {
    slug: "cook-this-book",
    title: "Cook This Book",
    author: "Molly Baz",
    section: "cookbooks",
    tags: ["cookbook", "technique", "beginners", "weeknight"],
    price: "$35.00",
    format: "Hardcover",
    year: 2021,
    cover: cover(11503410),
    description: "A former Bon Appétit editor teaches the why behind the how, with QR codes to videos for the tricky bits. Our favorite first cookbook for a new apartment.",
    isNew: true,
  },
  {
    slug: "ruffage",
    title: "Ruffage",
    author: "Abra Berens",
    section: "cookbooks",
    tags: ["cookbook", "vegetables", "seasonal", "farmers market"],
    price: "$35.00",
    format: "Hardcover",
    year: 2019,
    cover: cover(8803962),
    description: "A Michigan farmer and chef works through 29 vegetables, with a few good ways to cook each one. Made for Saturday mornings at the Carroll Park greenmarket.",
  },

  // Kids & YA
  {
    slug: "frog-and-toad-are-friends",
    title: "Frog and Toad Are Friends",
    author: "Arnold Lobel",
    section: "kids-ya",
    tags: ["picture book", "early reader", "friendship", "classic"],
    price: "$5.99",
    format: "Paperback",
    year: 1970,
    cover: cover(11303047),
    description: "Five small stories about two best friends, a lost button and a very long winter nap. Story Hour's most requested book, four years running.",
    ages: "Ages 4 to 8",
  },
  {
    slug: "the-wild-robot",
    title: "The Wild Robot",
    author: "Peter Brown",
    section: "kids-ya",
    tags: ["middle grade", "robots", "nature", "adventure"],
    price: "$9.99",
    format: "Paperback",
    year: 2016,
    cover: cover(7443301),
    description: "A robot washes up on a wild island, learns to survive from the animals and ends up raising an orphaned gosling. Short chapters, big feelings.",
    ages: "Ages 8 to 12",
  },
  {
    slug: "a-wrinkle-in-time",
    title: "A Wrinkle in Time",
    author: "Madeleine L'Engle",
    section: "kids-ya",
    tags: ["middle grade", "science fiction", "classic", "family"],
    price: "$8.99",
    format: "Paperback",
    year: 1962,
    cover: cover(8709146),
    description: "Meg Murry crosses space and time to find her missing father, with her little brother and an unlikely friend. Weird, brave and still a perfect first science fiction novel.",
    ages: "Ages 10 and up",
  },
  {
    slug: "the-girl-who-drank-the-moon",
    title: "The Girl Who Drank the Moon",
    author: "Kelly Barnhill",
    section: "kids-ya",
    tags: ["middle grade", "fantasy", "fairy tale", "magic"],
    price: "$10.99",
    format: "Paperback",
    year: 2016,
    cover: cover(7903958),
    description: "A baby left in the forest as a sacrifice is raised by a kind witch, a swamp monster and a very small dragon. A fairy tale for readers ten and up, and their parents.",
    staffNote: { by: "priya", text: "My go-to for kids who've finished every dragon book in the shop. Read it aloud and try not to wobble at the end." },
    ages: "Ages 10 and up",
  },
  {
    slug: "long-way-down",
    title: "Long Way Down",
    author: "Jason Reynolds",
    section: "kids-ya",
    tags: ["young adult", "verse novel", "grief", "gun violence"],
    price: "$12.99",
    format: "Paperback",
    year: 2017,
    cover: cover(8155949),
    description: "Will has sixty seconds in an elevator to decide whether to avenge his brother, and at every floor someone from his past gets on. A novel in verse for teens that grown-ups should read too.",
    ages: "Ages 12 and up",
  },
];

export interface FolioEvent {
  slug: string;
  title: string;
  kind: "Book club" | "Author event" | "Kids" | "Poetry";
  /** As printed: "Thursday, October 22". */
  date: string;
  /** "7–8:30pm" */
  time: string;
  /** ISO with offset, for JSON-LD and calendars. */
  startsAt: string;
  endsAt: string;
  place: string;
  price: string;
  /** Two or three sentences. */
  description: string;
  /** The book on the table, when there is one. */
  bookSlug?: string;
  /** Debut Night's readers (fictional authors and books). */
  readers?: { name: string; book: string; line: string }[];
  host?: string;
  /** Photo key (public/folio/photos/<key>.jpg). */
  photo?: string;
  /** Repeats every week ("Every Saturday"). */
  recurring?: string;
}

export const FOLIO_EVENTS: FolioEvent[] = [
  {
    slug: "story-hour",
    title: "Saturday Story Hour",
    kind: "Kids",
    date: "Saturday, October 17",
    time: "10:30–11:15am",
    startsAt: "2026-10-17T10:30:00-04:00",
    endsAt: "2026-10-17T11:15:00-04:00",
    place: "The kids' corner",
    price: "Free",
    description: "Priya reads three picture books aloud, then there are crayons and a lot of questions. This week: Frog and Toad, and two new autumn stories. Best for ages 2 to 6; grown-ups stay.",
    bookSlug: "frog-and-toad-are-friends",
    host: "Priya Raman",
    photo: "story-hour",
    recurring: "Every Saturday",
  },
  {
    slug: "book-club",
    title: "Book Club: Small Things Like These",
    kind: "Book club",
    date: "Thursday, October 22",
    time: "7–8:30pm",
    startsAt: "2026-10-22T19:00:00-04:00",
    endsAt: "2026-10-22T20:30:00-04:00",
    place: "The reading room",
    price: "Free for members, $5 drop-in (taken off the book)",
    description: "Our monthly book club meets on the fourth Thursday. October's pick is Claire Keegan's short, quietly devastating novel, and there will be tea and a very good soda bread. Members get 10% off the pick.",
    bookSlug: "small-things-like-these",
    host: "Maeve Calloway",
    photo: "book-club",
    recurring: "Fourth Thursday of the month",
  },
  {
    slug: "poetry-night",
    title: "Poetry at the Fern: open reading",
    kind: "Poetry",
    date: "Wednesday, October 28",
    time: "7:30–9pm",
    startsAt: "2026-10-28T19:30:00-04:00",
    endsAt: "2026-10-28T21:00:00-04:00",
    place: "The reading room",
    price: "Free",
    description: "Five minutes each, your own poems or someone else's. Sign up at the counter from 7pm; first-timers are very welcome and the room is kind.",
    host: "Sam Okonkwo",
  },
  {
    slug: "debut-night",
    title: "Debut Night: three first novels",
    kind: "Author event",
    date: "Thursday, November 5",
    time: "7–8:30pm",
    startsAt: "2026-11-05T19:00:00-05:00",
    endsAt: "2026-11-05T20:30:00-05:00",
    place: "The reading room",
    price: "Free, RSVP to save a seat",
    description: "Three first-time novelists read from their books and talk with Maeve about how a first novel gets written, sold and finished. Wine from our neighbors on Court Street, and signed copies on the night.",
    readers: [
      { name: "Marisol Tran", book: "Salt Season", line: "A family's last summer in a Rockaway bungalow, told by three sisters who remember it differently." },
      { name: "Owen Achterberg", book: "The Lending Year", line: "A retired librarian in Duluth, a stolen atlas and the teenager who returns it a page at a time." },
      { name: "Ada Lindqvist", book: "Small Hours on Smith Street", line: "A night-shift nurse and the baker downstairs, one Brooklyn winter, mostly between 3 and 5am." },
    ],
    host: "Maeve Calloway",
    photo: "author-talk",
  },
  {
    slug: "other-worlds",
    title: "Other Worlds Book Club: The Dispossessed",
    kind: "Book club",
    date: "Tuesday, November 10",
    time: "7–8:30pm",
    startsAt: "2026-11-10T19:00:00-05:00",
    endsAt: "2026-11-10T20:30:00-05:00",
    place: "The reading room",
    price: "Free",
    description: "Our science fiction and fantasy club reads one classic and one new book a season. November is Le Guin's ambiguous utopia; bring opinions about walls.",
    bookSlug: "the-dispossessed",
    host: "Ines Duarte",
  },
];

export const FOLIO_SHOP = {
  name: "Folio & Fern",
  legalName: "Folio & Fern Books LLC",
  tagline: "An independent bookshop in Carroll Gardens, Brooklyn.",
  founded: 2014,
  street: "418 Court Street",
  neighborhood: "Carroll Gardens",
  city: "Brooklyn",
  region: "NY",
  postalCode: "11231",
  country: "US",
  phone: "(718) 555-0142",
  email: "hello@folioandfernbooks.com",
  hours: [
    { days: "Monday to Thursday", short: "Mon–Thu", open: "10:00", close: "20:00", label: "10am–8pm" },
    { days: "Friday and Saturday", short: "Fri–Sat", open: "10:00", close: "21:00", label: "10am–9pm" },
    { days: "Sunday", short: "Sun", open: "11:00", close: "19:00", label: "11am–7pm" },
  ],
  socials: [
    { network: "instagram", label: "Instagram", handle: "@folioandfernbooks", url: "https://www.instagram.com/folioandfernbooks" },
    { network: "tiktok", label: "TikTok", handle: "@folioandfernbooks", url: "https://www.tiktok.com/@folioandfernbooks" },
    { network: "facebook", label: "Facebook", handle: "Folio & Fern Books", url: "https://www.facebook.com/folioandfernbooks" },
    { network: "threads", label: "Threads", handle: "@folioandfernbooks", url: "https://www.threads.net/@folioandfernbooks" },
  ],
} as const;

/* ---- end shared ---- */

/* Brand --------------------------------------------------------------------- */

/** Where the site runs locally; the seed passes the deployed one when there is one. */
export const FOLIO_SITE = "http://localhost:3002/folio";

/** A ref the seed maps to an emailItems id. */
export const folioRef = (slug: string, kind: "book" | "event" = "book") => (kind === "book" ? `slug:${slug}` : `event:${slug}`);

const pexels = (id: number, w = 1200, h?: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}${h ? `&h=${h}&fit=crop` : ""}`;

/** The site's photos (also in apps/stores/public/folio/photos), from Pexels, for emails; the portrait hero is cropped landscape. */
export const FOLIO_PHOTOS = {
  shopReading: { src: pexels(31600273, 1200, 760), alt: "A customer reading between the shelves by the chalkboard wall", credit: "Ytalo Marcos / Pexels" },
  storefront: { src: pexels(17160725), alt: "A green-painted bookshop front with a table of books on the sidewalk", credit: "Huy Phan / Pexels" },
  authorTalk: { src: pexels(4865515), alt: "An author talking with a small audience in a warm, lamplit room", credit: "cottonbro studio / Pexels" },
  storyHour: { src: pexels(5865565), alt: "A parent and two children reading in a bright kids' corner full of picture books", credit: "Rachel Claire / Pexels" },
  bookClub: { src: pexels(35203998), alt: "Four friends laughing over books in a cozy room", credit: "Damian Santos / Pexels" },
};

/** "story-hour" (the site's file name) → FOLIO_PHOTOS.storyHour. */
const photoFor = (key: string) => FOLIO_PHOTOS[key.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) as keyof typeof FOLIO_PHOTOS];

export function folioKit(site = FOLIO_SITE): EmailKit {
  return {
    logo: { src: `${site}/logo.png`, alt: "Folio & Fern" },
    icon: `${site}/mark.png`,
    wordmark: "Folio & Fern",
    colors: {
      background: "#F6F1E7",
      foreground: "#1E2A22",
      primary: "#1F3D2B",
      primaryForeground: "#F6F1E7",
      accent: "#C8643B",
      muted: "#EFE7D8",
      surface: "#FFFCF6",
    },
    fonts: {
      heading: { family: "Fraunces", fallback: "Georgia, 'Times New Roman', serif", google: true, weights: [500, 600] },
      body: { family: "Source Sans 3", fallback: "'Helvetica Neue', Helvetica, Arial, sans-serif", google: true, weights: [400, 600] },
    },
    buttonStyle: "rounded",
    radius: "md",
    uppercaseLabels: false,
    voice: {
      summary:
        "Warm, bookish and specific, like a bookseller handing you a book across the counter: what it is, who it's for and why we love it. Neighborly and a little funny, never snobbish.",
      do: [
        "Name the book, the author and one concrete reason to read it",
        "Write like a bookseller talking to a regular: \"we\", first names, plain words",
        "Mention the people and the place: staff picks, the reading room, Court Street",
        "Keep each book to two or three sentences",
        "Invite people in: events, the book club, Story Hour",
      ],
      avoid: [
        "Snobbery or gatekeeping about what counts as a good book",
        "Framing picks against bestseller lists or what's trending",
        "Hype words: must-read, unputdownable, game-changing",
        "Exclamation marks in every line",
        "Discount-first selling; we rarely run sales",
      ],
    },
  };
}

export const FOLIO_KIT: EmailKit = folioKit();

export const FOLIO_ABOUT: EmailAbout = {
  summary:
    "Folio & Fern is an independent bookshop on Court Street in Carroll Gardens, Brooklyn, open since 2014. It sells new books across literary and translated fiction, sci-fi and fantasy, crime, ideas and nonfiction, poetry, cookbooks and kids' books, with handwritten staff picks, a monthly book club, author events in the reading room and a Saturday Story Hour.",
  audience:
    "Neighborhood readers in Brooklyn and across New York: regulars who want a considered recommendation, book club members, parents of young readers and people who come for the events.",
  categories: ["Literary fiction", "Fiction in translation", "Sci-fi & fantasy", "Crime & suspense", "Ideas & nonfiction", "Poetry", "Cookbooks", "Kids & YA", "Events"],
  location: "Carroll Gardens, Brooklyn, New York",
};

const ADDRESS = `${FOLIO_SHOP.street}, ${FOLIO_SHOP.city}, ${FOLIO_SHOP.region} ${FOLIO_SHOP.postalCode}`;

export function folioFooter(site = FOLIO_SITE): EmailFooterInfo {
  return {
    address: `${FOLIO_SHOP.name}, ${ADDRESS}`,
    website: site,
    socials: FOLIO_SHOP.socials.map((s) => ({ network: s.network, url: s.url })),
  };
}

export const FOLIO_FOOTER: EmailFooterInfo = folioFooter();

export const FOLIO_SENDER: EmailSender = { fromName: "Folio & Fern", fromLocal: "hello", replyTo: FOLIO_SHOP.email };

/** The domain the shop would verify with Resend. */
export const FOLIO_DOMAIN = "folioandfernbooks.com";

/* Items ----------------------------------------------------------------------- */

/** The catalog as email items (books, then events), each with the ref docs use. */
export function folioItems(site = FOLIO_SITE): (Omit<EmailItem, "id"> & { ref: string })[] {
  const sectionName = (id: FolioSectionId) => FOLIO_SECTIONS.find((s) => s.id === id)?.name ?? id;
  const books = FOLIO_BOOKS.map((b) => ({
    ref: folioRef(b.slug),
    name: b.title,
    subtitle: b.author,
    kind: "book",
    description: b.description,
    price: b.price,
    image: b.cover,
    url: `${site}/books/${b.slug}`,
    tags: [...new Set([sectionName(b.section).toLowerCase(), ...b.tags])],
  }));
  const events = FOLIO_EVENTS.map((e) => ({
    ref: folioRef(e.slug, "event"),
    name: e.title,
    subtitle: `${e.date}, ${e.time}`,
    kind: "event",
    description: e.description,
    price: e.price.startsWith("Free") ? "Free" : e.price,
    // The Pexels original, not the site's copy: emails need an image any inbox (and Convex) can fetch.
    image: e.photo ? photoFor(e.photo)?.src ?? `${site}/photos/${e.photo}.jpg` : undefined,
    url: `${site}/events#${e.slug}`,
    tags: [e.kind.toLowerCase(), "event", "brooklyn"],
  }));
  return [...books, ...events];
}

/* Contacts ------------------------------------------------------------------------ */

/** One CSV row. Taste columns hold semicolon-separated values. */
export interface FolioContact {
  email: string;
  first_name: string;
  last_name: string;
  city: string;
  age: number;
  gender: string;
  favourite_authors: string;
  favourite_books: string;
  music: string;
  films: string;
  genres: string;
}

export const FOLIO_CONTACT_COLUMNS: (keyof FolioContact)[] = [
  "email",
  "first_name",
  "last_name",
  "city",
  "age",
  "gender",
  "favourite_authors",
  "favourite_books",
  "music",
  "films",
  "genres",
];

/** The column mapping the import step would pick (emailLists.mapping). */
export const FOLIO_LIST_MAPPING = {
  email: "email",
  firstName: "first_name",
  lastName: "last_name",
  city: "city",
  age: "age",
  gender: "gender",
  // "genres" stays in the file but isn't a taste column: words like "history"
  // aren't names, and Qloo matches them to unrelated entities (a TV channel).
  taste: ["favourite_authors", "favourite_books", "music", "films"],
};

/** Eight members kept one by one ("people"): each has a distinct, specific taste. */
export const FOLIO_BOOK_CLUB: FolioContact[] = [
  {
    email: "maya.okafor@example.com",
    first_name: "Maya",
    last_name: "Okafor",
    city: "Brooklyn",
    age: 29,
    gender: "female",
    favourite_authors: "Zadie Smith; Sally Rooney; Brit Bennett",
    favourite_books: "Swing Time; Normal People; The Vanishing Half",
    music: "Solange; Frank Ocean; Mitski",
    films: "Moonlight; Past Lives; Lady Bird",
    genres: "literary fiction; contemporary fiction",
  },
  {
    email: "daniel.reyes@example.com",
    first_name: "Daniel",
    last_name: "Reyes",
    city: "Queens",
    age: 41,
    gender: "male",
    favourite_authors: "Cormac McCarthy; Denis Johnson; Annie Proulx",
    favourite_books: "The Road; Train Dreams; Blood Meridian",
    music: "Bruce Springsteen; Jason Isbell; Townes Van Zandt",
    films: "No Country for Old Men; There Will Be Blood; Paris, Texas",
    genres: "literary fiction; westerns; american fiction",
  },
  {
    email: "hana.kobayashi@example.com",
    first_name: "Hana",
    last_name: "Kobayashi",
    city: "Brooklyn",
    age: 34,
    gender: "female",
    favourite_authors: "Haruki Murakami; Kazuo Ishiguro; Yoko Ogawa",
    favourite_books: "Never Let Me Go; The Memory Police; Kafka on the Shore",
    music: "Ryuichi Sakamoto; Nils Frahm; Joe Hisaishi",
    films: "Drive My Car; In the Mood for Love; Perfect Days",
    genres: "translated fiction; japanese literature; magical realism",
  },
  {
    email: "marcus.bell@example.com",
    first_name: "Marcus",
    last_name: "Bell",
    city: "Brooklyn",
    age: 52,
    gender: "male",
    favourite_authors: "Robert Caro; Isabel Wilkerson; Ta-Nehisi Coates",
    favourite_books: "The Power Broker; The Warmth of Other Suns; Between the World and Me",
    music: "John Coltrane; Miles Davis; Nina Simone",
    films: "13th; I Am Not Your Negro; Do the Right Thing",
    genres: "history; biography; politics",
  },
  {
    email: "chloe.brennan@example.com",
    first_name: "Chloe",
    last_name: "Brennan",
    city: "Jersey City",
    age: 26,
    gender: "female",
    favourite_authors: "Taylor Jenkins Reid; Emily Henry; Madeline Miller",
    favourite_books: "The Seven Husbands of Evelyn Hugo; Circe; Book Lovers",
    music: "Taylor Swift; Olivia Rodrigo; Gracie Abrams",
    films: "Pride & Prejudice; Little Women; Mamma Mia!",
    genres: "romance; historical fiction; mythology retellings",
  },
  {
    email: "ravi.menon@example.com",
    first_name: "Ravi",
    last_name: "Menon",
    city: "Manhattan",
    age: 38,
    gender: "male",
    favourite_authors: "Ted Chiang; Liu Cixin; Andy Weir",
    favourite_books: "Exhalation; The Three-Body Problem; Project Hail Mary",
    music: "Daft Punk; Brian Eno; Vangelis",
    films: "Arrival; Interstellar; Blade Runner 2049",
    genres: "hard science fiction; popular science",
  },
  {
    email: "ruth.abramson@example.com",
    first_name: "Ruth",
    last_name: "Abramson",
    city: "Brooklyn",
    age: 67,
    gender: "female",
    favourite_authors: "Alice Munro; Marilynne Robinson; Elizabeth Strout",
    favourite_books: "Gilead; Olive Kitteridge; Runaway",
    music: "Joni Mitchell; Leonard Cohen; Johann Sebastian Bach",
    films: "Howards End; The Remains of the Day; Moonstruck",
    genres: "literary fiction; short stories; poetry",
  },
  {
    email: "jules.fischer@example.com",
    first_name: "Jules",
    last_name: "Fischer",
    city: "Queens",
    age: 31,
    gender: "non-binary",
    favourite_authors: "Agatha Christie; Anthony Horowitz; Richard Osman",
    favourite_books: "Magpie Murders; The Thursday Murder Club; And Then There Were None",
    music: "Vampire Weekend; The Kinks; Belle and Sebastian",
    films: "Knives Out; Glass Onion; Murder on the Orient Express",
    genres: "cozy mystery; puzzle mysteries; british crime",
  },
];

const literary: FolioContact[] = [
  {
    email: "nora.haddad@example.com",
    first_name: "Nora",
    last_name: "Haddad",
    city: "Brooklyn",
    age: 28,
    gender: "female",
    favourite_authors: "Sally Rooney; Ocean Vuong; Rachel Cusk",
    favourite_books: "Normal People; On Earth We're Briefly Gorgeous; Outline",
    music: "Phoebe Bridgers; Big Thief; Mitski",
    films: "Aftersun; Past Lives; Frances Ha",
    genres: "literary fiction; poetry",
  },
  {
    email: "elliot.park@example.com",
    first_name: "Elliot",
    last_name: "Park",
    city: "Brooklyn",
    age: 31,
    gender: "male",
    favourite_authors: "Ocean Vuong; Sally Rooney; Ben Lerner",
    favourite_books: "On Earth We're Briefly Gorgeous; Dept. of Speculation",
    music: "Bon Iver; Phoebe Bridgers; Sufjan Stevens",
    films: "Aftersun; Moonlight; Past Lives",
    genres: "literary fiction; poetry; essays",
  },
  {
    email: "sofia.marchetti@example.com",
    first_name: "Sofia",
    last_name: "Marchetti",
    city: "Manhattan",
    age: 26,
    gender: "female",
    favourite_authors: "Sally Rooney; Ottessa Moshfegh; Elif Batuman",
    favourite_books: "Conversations with Friends; My Year of Rest and Relaxation; The Idiot",
    music: "Phoebe Bridgers; Mitski; Japanese Breakfast",
    films: "Lady Bird; Frances Ha; The Worst Person in the World",
    genres: "literary fiction; autofiction",
  },
  {
    email: "tom.gallagher@example.com",
    first_name: "Tom",
    last_name: "Gallagher",
    city: "Queens",
    age: 35,
    gender: "male",
    favourite_authors: "Sally Rooney; Claire Keegan; Rachel Cusk",
    favourite_books: "Normal People; Foster",
    music: "Bon Iver; Big Thief; Nick Drake",
    films: "Aftersun; Past Lives; The Banshees of Inisherin",
    genres: "literary fiction; irish fiction",
  },
  {
    email: "amara.diallo@example.com",
    first_name: "Amara",
    last_name: "Diallo",
    city: "Brooklyn",
    age: 30,
    gender: "female",
    favourite_authors: "Ocean Vuong; Zadie Smith; Ottessa Moshfegh",
    favourite_books: "On Earth We're Briefly Gorgeous; Luster",
    music: "Phoebe Bridgers; Mitski; Solange",
    films: "Past Lives; Lady Bird; Moonlight",
    genres: "literary fiction; poetry",
  },
  {
    email: "grace.whitfield@example.com",
    first_name: "Grace",
    last_name: "Whitfield",
    city: "Jersey City",
    age: 24,
    gender: "female",
    favourite_authors: "Sally Rooney; Ocean Vuong; Annie Ernaux",
    favourite_books: "Normal People; Conversations with Friends; The Years",
    music: "Mitski; Phoebe Bridgers; Clairo",
    films: "Lady Bird; Aftersun; Portrait of a Lady on Fire",
    genres: "literary fiction; memoir; essays",
  },
  {
    email: "isaac.feldman@example.com",
    first_name: "Isaac",
    last_name: "Feldman",
    city: "Brooklyn",
    age: 33,
    gender: "male",
    favourite_authors: "Rachel Cusk; Ocean Vuong; W. G. Sebald",
    favourite_books: "On Earth We're Briefly Gorgeous; The Rings of Saturn",
    music: "Big Thief; Bon Iver; Radiohead",
    films: "Frances Ha; Aftersun; Paterson",
    genres: "literary fiction; essays",
  },
  {
    email: "lucia.romero@example.com",
    first_name: "Lucía",
    last_name: "Romero",
    city: "Brooklyn",
    age: 29,
    gender: "female",
    favourite_authors: "Ottessa Moshfegh; Rachel Cusk; Sheila Heti",
    favourite_books: "My Year of Rest and Relaxation; Outline; Eileen",
    music: "Mitski; Big Thief; Fiona Apple",
    films: "Frances Ha; Past Lives; Zodiac",
    genres: "literary fiction; autofiction; true crime",
  },
  {
    email: "hannah.lee@example.com",
    first_name: "Hannah",
    last_name: "Lee",
    city: "Hoboken",
    age: 27,
    gender: "female",
    favourite_authors: "Ocean Vuong; Sally Rooney; Hanya Yanagihara",
    favourite_books: "Normal People; A Little Life",
    music: "Phoebe Bridgers; Bon Iver; boygenius",
    films: "Past Lives; Lady Bird; Everything Everywhere All at Once",
    genres: "literary fiction; poetry",
  },
];

const speculative: FolioContact[] = [
  {
    email: "kai.nakamura@example.com",
    first_name: "Kai",
    last_name: "Nakamura",
    city: "Brooklyn",
    age: 29,
    gender: "male",
    favourite_authors: "Ursula K. Le Guin; Ted Chiang; Octavia E. Butler",
    favourite_books: "The Left Hand of Darkness; Stories of Your Life and Others",
    music: "Radiohead; Björk; Boards of Canada",
    films: "Spirited Away; Arrival; Princess Mononoke",
    genres: "science fiction; fantasy",
  },
  {
    email: "jess.romano@example.com",
    first_name: "Jess",
    last_name: "Romano",
    city: "Queens",
    age: 34,
    gender: "female",
    favourite_authors: "N. K. Jemisin; Martha Wells; Ursula K. Le Guin",
    favourite_books: "A Memory Called Empire; All Systems Red",
    music: "Radiohead; Massive Attack; Grimes",
    films: "Arrival; Blade Runner 2049; Annihilation",
    genres: "science fiction; fantasy; speculative fiction",
  },
  {
    email: "arjun.mehta@example.com",
    first_name: "Arjun",
    last_name: "Mehta",
    city: "Brooklyn",
    age: 27,
    gender: "male",
    favourite_authors: "Ursula K. Le Guin; Becky Chambers; Terry Pratchett",
    favourite_books: "The Left Hand of Darkness; Good Omens",
    music: "Radiohead; Björk; Joe Hisaishi",
    films: "Spirited Away; Princess Mononoke; Howl's Moving Castle",
    genres: "fantasy; science fiction; cozy fantasy",
  },
  {
    email: "morgan.ellis@example.com",
    first_name: "Morgan",
    last_name: "Ellis",
    city: "Brooklyn",
    age: 38,
    gender: "non-binary",
    favourite_authors: "Octavia E. Butler; N. K. Jemisin; China Miéville",
    favourite_books: "Parable of the Sower; Dune",
    music: "Björk; Aphex Twin; Massive Attack",
    films: "Blade Runner 2049; Arrival; Akira",
    genres: "science fiction; speculative fiction; afrofuturism",
  },
  {
    email: "lena.hoffmann@example.com",
    first_name: "Lena",
    last_name: "Hoffmann",
    city: "Manhattan",
    age: 41,
    gender: "female",
    favourite_authors: "Ted Chiang; Ursula K. Le Guin; Arkady Martine",
    favourite_books: "A Memory Called Empire; Dune; Children of Time",
    music: "Radiohead; Aphex Twin; Vangelis",
    films: "Arrival; Blade Runner 2049; Interstellar",
    genres: "science fiction; space opera; popular science",
  },
  {
    email: "andre.wallace@example.com",
    first_name: "Andre",
    last_name: "Wallace",
    city: "The Bronx",
    age: 32,
    gender: "male",
    favourite_authors: "N. K. Jemisin; Octavia E. Butler; Nnedi Okorafor",
    favourite_books: "Parable of the Sower; Binti",
    music: "Massive Attack; Radiohead; Flying Lotus",
    films: "Princess Mononoke; Spirited Away; Black Panther",
    genres: "science fiction; fantasy; afrofuturism",
  },
  {
    email: "riley.oconnor@example.com",
    first_name: "Riley",
    last_name: "O'Connor",
    city: "Jersey City",
    age: 23,
    gender: "female",
    favourite_authors: "Ursula K. Le Guin; N. K. Jemisin; Naomi Novik",
    favourite_books: "The Left Hand of Darkness; Uprooted",
    music: "Björk; Radiohead; Grimes",
    films: "Spirited Away; Howl's Moving Castle; Pan's Labyrinth",
    genres: "fantasy; fairy tales",
  },
  {
    email: "ben.adler@example.com",
    first_name: "Ben",
    last_name: "Adler",
    city: "Brooklyn",
    age: 45,
    gender: "male",
    favourite_authors: "Ursula K. Le Guin; Ted Chiang; William Gibson",
    favourite_books: "Dune; Neuromancer",
    music: "Radiohead; Aphex Twin; Kraftwerk",
    films: "Blade Runner 2049; Arrival; 2001: A Space Odyssey",
    genres: "science fiction; climate fiction",
  },
  {
    email: "yuki.tanaka@example.com",
    first_name: "Yuki",
    last_name: "Tanaka",
    city: "Queens",
    age: 26,
    gender: "female",
    favourite_authors: "Octavia E. Butler; Ted Chiang; Becky Chambers",
    favourite_books: "A Memory Called Empire; Parable of the Sower",
    music: "Björk; Massive Attack; Phoebe Bridgers",
    films: "Spirited Away; Princess Mononoke; Kiki's Delivery Service",
    genres: "science fiction; cozy fantasy",
  },
];

const crime: FolioContact[] = [
  {
    email: "claire.donovan@example.com",
    first_name: "Claire",
    last_name: "Donovan",
    city: "Brooklyn",
    age: 39,
    gender: "female",
    favourite_authors: "Tana French; Gillian Flynn; Dennis Lehane",
    favourite_books: "In the Woods; Gone Girl",
    music: "Nick Cave & the Bad Seeds; The National; Portishead",
    films: "Zodiac; Prisoners; Mindhunter",
    genres: "crime; mystery; thrillers",
  },
  {
    email: "mike.russo@example.com",
    first_name: "Mike",
    last_name: "Russo",
    city: "Staten Island",
    age: 47,
    gender: "male",
    favourite_authors: "Dennis Lehane; Patricia Highsmith; Michael Connelly",
    favourite_books: "Mystic River; The Big Sleep",
    music: "Nick Cave & the Bad Seeds; The National; Bruce Springsteen",
    films: "Se7en; Zodiac; Heat",
    genres: "crime; thrillers; true crime",
  },
  {
    email: "anika.shah@example.com",
    first_name: "Anika",
    last_name: "Shah",
    city: "Manhattan",
    age: 33,
    gender: "female",
    favourite_authors: "Tana French; Patricia Highsmith; Ruth Ware",
    favourite_books: "In the Woods; Strangers on a Train",
    music: "Lana Del Rey; Portishead; The National",
    films: "Mindhunter; Zodiac; Gone Girl",
    genres: "psychological thrillers; true crime",
  },
  {
    email: "sean.brady@example.com",
    first_name: "Sean",
    last_name: "Brady",
    city: "Brooklyn",
    age: 36,
    gender: "male",
    favourite_authors: "Tana French; Dennis Lehane; John le Carré",
    favourite_books: "In the Woods; Tinker Tailor Soldier Spy",
    music: "The National; Nick Cave & the Bad Seeds; Interpol",
    films: "Prisoners; Se7en; Tinker Tailor Soldier Spy",
    genres: "spy fiction; crime",
  },
  {
    email: "natalie.brooks@example.com",
    first_name: "Natalie",
    last_name: "Brooks",
    city: "Jersey City",
    age: 29,
    gender: "female",
    favourite_authors: "Gillian Flynn; Tana French; Megan Abbott",
    favourite_books: "Gone Girl; Sharp Objects",
    music: "Lana Del Rey; Portishead; Fiona Apple",
    films: "Mindhunter; Prisoners; Mare of Easttown",
    genres: "crime; psychological thrillers",
  },
  {
    email: "victor.alvarez@example.com",
    first_name: "Victor",
    last_name: "Alvarez",
    city: "Queens",
    age: 42,
    gender: "male",
    favourite_authors: "Patricia Highsmith; Dennis Lehane; Raymond Chandler",
    favourite_books: "The Big Sleep; Mystic River",
    music: "Nick Cave & the Bad Seeds; Lana Del Rey; Tom Waits",
    films: "Se7en; Zodiac; Chinatown",
    genres: "noir; crime; mystery",
  },
  {
    email: "rachel.kim@example.com",
    first_name: "Rachel",
    last_name: "Kim",
    city: "Brooklyn",
    age: 31,
    gender: "female",
    favourite_authors: "Tana French; Gillian Flynn; Jo Nesbø",
    favourite_books: "Gone Girl; In the Woods; The Snowman",
    music: "The National; Portishead; Nine Inch Nails",
    films: "Prisoners; Mindhunter; Memories of Murder",
    genres: "crime; nordic noir; true crime",
  },
  {
    email: "paul.becker@example.com",
    first_name: "Paul",
    last_name: "Becker",
    city: "Philadelphia",
    age: 52,
    gender: "male",
    favourite_authors: "Patricia Highsmith; Tana French; Agatha Christie",
    favourite_books: "The Big Sleep; Mystic River",
    music: "Nick Cave & the Bad Seeds; The National; Leonard Cohen",
    films: "Zodiac; Se7en; Rear Window",
    genres: "mystery; classic crime",
  },
  {
    email: "tasha.greene@example.com",
    first_name: "Tasha",
    last_name: "Greene",
    city: "Brooklyn",
    age: 27,
    gender: "female",
    favourite_authors: "Gillian Flynn; Dennis Lehane; Attica Locke",
    favourite_books: "Gone Girl; Bluebird, Bluebird",
    music: "Lana Del Rey; Portishead; Nina Simone",
    films: "Mindhunter; Se7en; Get Out",
    genres: "crime; true crime; southern noir",
  },
];

const ideas: FolioContact[] = [
  {
    email: "ezra.goldberg@example.com",
    first_name: "Ezra",
    last_name: "Goldberg",
    city: "Brooklyn",
    age: 44,
    gender: "male",
    favourite_authors: "Robert Macfarlane; Rebecca Solnit; Oliver Sacks",
    favourite_books: "Underland; A Field Guide to Getting Lost",
    music: "Brian Eno; Talking Heads; Max Richter",
    films: "My Octopus Teacher; Free Solo; Honeyland",
    genres: "nature writing; essays; science",
  },
  {
    email: "laila.rahman@example.com",
    first_name: "Laila",
    last_name: "Rahman",
    city: "Manhattan",
    age: 37,
    gender: "female",
    favourite_authors: "Oliver Sacks; Michael Pollan; Siddhartha Mukherjee",
    favourite_books: "The Emperor of All Maladies; Being Mortal",
    music: "Khruangbin; Talking Heads; Vampire Weekend",
    films: "Jiro Dreams of Sushi; Free Solo; My Octopus Teacher",
    genres: "popular science; medicine; history",
  },
  {
    email: "owen.price@example.com",
    first_name: "Owen",
    last_name: "Price",
    city: "Brooklyn",
    age: 50,
    gender: "male",
    favourite_authors: "Oliver Sacks; Robert Macfarlane; Bill Bryson",
    favourite_books: "Sapiens; A Short History of Nearly Everything",
    music: "Talking Heads; Brian Eno; Paul Simon",
    films: "Planet Earth; Free Solo; Apollo 11",
    genres: "history; popular science; big ideas",
  },
  {
    email: "mei.chen@example.com",
    first_name: "Mei",
    last_name: "Chen",
    city: "Queens",
    age: 34,
    gender: "female",
    favourite_authors: "Michael Pollan; Robin Wall Kimmerer; Rebecca Solnit",
    favourite_books: "The Sixth Extinction; The Omnivore's Dilemma",
    music: "Khruangbin; Max Richter; Fleet Foxes",
    films: "My Octopus Teacher; Planet Earth; Jiro Dreams of Sushi",
    genres: "nature writing; science; food writing",
  },
  {
    email: "jamal.carter@example.com",
    first_name: "Jamal",
    last_name: "Carter",
    city: "Brooklyn",
    age: 39,
    gender: "male",
    favourite_authors: "Rebecca Solnit; Michael Pollan; Isabel Wilkerson",
    favourite_books: "Sapiens; The Warmth of Other Suns",
    music: "Talking Heads; Khruangbin; Kendrick Lamar",
    films: "Free Solo; Jiro Dreams of Sushi; 13th",
    genres: "history; politics; narrative nonfiction",
  },
  {
    email: "clara.lindgren@example.com",
    first_name: "Clara",
    last_name: "Lindgren",
    city: "Brooklyn",
    age: 29,
    gender: "female",
    favourite_authors: "Rebecca Solnit; Jenny Odell; Oliver Sacks",
    favourite_books: "Underland; Trick Mirror",
    music: "Khruangbin; Talking Heads; Vampire Weekend",
    films: "My Octopus Teacher; Free Solo; Won't You Be My Neighbor?",
    genres: "essays; culture; technology",
  },
  {
    email: "david.mensah@example.com",
    first_name: "David",
    last_name: "Mensah",
    city: "Jersey City",
    age: 46,
    gender: "male",
    favourite_authors: "Michael Pollan; Oliver Sacks; Malcolm Gladwell",
    favourite_books: "Sapiens; The Emperor of All Maladies",
    music: "Brian Eno; Max Richter; Radiohead",
    films: "Planet Earth; Free Solo; Cosmos",
    genres: "psychology; popular science; economics",
  },
  {
    email: "rosa.delgado@example.com",
    first_name: "Rosa",
    last_name: "Delgado",
    city: "Brooklyn",
    age: 58,
    gender: "female",
    favourite_authors: "Oliver Sacks; Robert Macfarlane; Rachel Carson",
    favourite_books: "The Sixth Extinction; Musicophilia",
    music: "Max Richter; Brian Eno; Joni Mitchell",
    films: "Planet Earth; My Octopus Teacher; March of the Penguins",
    genres: "science; nature writing",
  },
  {
    email: "felix.novak@example.com",
    first_name: "Felix",
    last_name: "Novak",
    city: "Boston",
    age: 41,
    gender: "male",
    favourite_authors: "Robert Macfarlane; Michael Pollan; Robert Caro",
    favourite_books: "Underland; The Power Broker",
    music: "Talking Heads; Brian Eno; Bruce Springsteen",
    films: "Free Solo; Planet Earth; Apollo 11",
    genres: "history; narrative nonfiction; true crime",
  },
];

/**
 * The groups the subscribers were written to fall into, for checking the
 * clustering and naming groups in the seed. Rows are interleaved below so the
 * list doesn't arrive sorted by taste.
 */
export const FOLIO_SUBSCRIBER_GROUPS = {
  literary: { name: "Quiet literary readers", emails: literary.map((c) => c.email) },
  speculative: { name: "Speculative fiction fans", emails: speculative.map((c) => c.email) },
  crime: { name: "Crime & suspense", emails: crime.map((c) => c.email) },
  ideas: { name: "Ideas & nonfiction", emails: ideas.map((c) => c.email) },
};

/** 36 newsletter subscribers that cluster into four taste groups (with a little noise). */
export const FOLIO_SUBSCRIBERS: FolioContact[] = literary.flatMap((_, i) => [literary[i], speculative[i], crime[i], ideas[i]]);

/** Rows as a CSV file, the way a merchant would upload them. */
export function folioCsv(rows: FolioContact[]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [FOLIO_CONTACT_COLUMNS.join(","), ...rows.map((r) => FOLIO_CONTACT_COLUMNS.map((k) => cell(r[k])).join(","))].join("\n") + "\n";
}

/* Campaigns ------------------------------------------------------------------------ */

/** A doc without its theme: the seed sets `theme: themeFromKit(FOLIO_KIT)`. */
export type FolioDoc = Omit<EmailDoc, "theme">;

export interface FolioCampaign {
  key: "literary-new" | "autumn-list" | "debut-night";
  name: string;
  /** Which audience it goes to: a subscriber group, the book club list, or none yet. */
  audience: { kind: "group"; group: keyof typeof FOLIO_SUBSCRIBER_GROUPS } | { kind: "people"; list: "book-club" } | null;
  /** "sent" gets simulated stats in the seed; "people" campaigns get real personalisation from the agent. */
  status: "sent" | "draft";
  /** Event template the draft started from (emailTemplates id), when there is one. */
  templateId?: string;
  doc: FolioDoc;
}

type Section = FolioDoc["sections"][number];

function headerSection(p: string, site: string): Section {
  return {
    id: `${p}_header`,
    label: "Header",
    background: "surface",
    padding: [28, 32, 20, 32],
    columns: [{ id: `${p}_header_c`, width: 1, blocks: [{ id: `${p}_logo`, type: "logo", width: 168, align: "center", href: site }] }],
    evidence: "Brand logo from the homepage header; links back to the shop.",
  };
}

function footerSection(p: string, site: string, why: string): Section {
  return {
    id: `${p}_footer`,
    label: "Footer",
    background: "muted",
    padding: [32, 32, 36, 32],
    columns: [
      {
        id: `${p}_footer_c`,
        width: 1,
        blocks: [
          {
            id: `${p}_social`,
            type: "social",
            links: FOLIO_SHOP.socials.map((s) => ({ network: s.network, url: s.url })),
            align: "center",
            style: "brand",
            size: 22,
          },
          {
            id: `${p}_footer_text`,
            type: "footer",
            text: `${why} Open Mon–Thu 10am–8pm, Fri–Sat 10am–9pm, Sun 11am–7pm. <a href="${site}">Shop online</a>`,
            address: `${FOLIO_SHOP.name}, ${ADDRESS}`,
            align: "center",
            unsubscribeLabel: "Unsubscribe",
            viewOnline: true,
          },
        ],
      },
    ],
    evidence: "Address, hours and socials from the brand footer; unsubscribe and view-online links are required.",
  };
}

export function folioCampaigns(site = FOLIO_SITE): FolioCampaign[] {
  const book = (slug: string) => `${site}/books/${slug}`;
  const event = (slug: string) => `${site}/events#${slug}`;
  const smallThings = FOLIO_BOOKS.find((b) => b.slug === "small-things-like-these")!;

  // a. Sent to the quiet literary readers group.
  const literaryNew: FolioDoc = {
    kind: "email",
    version: 1,
    subject: "Four new novels for slow evenings",
    preheader: "Erpenbeck, Maroo, van der Wouden and Harvey, for anyone still thinking about Aftersun.",
    sections: [
      headerSection("ln", site),
      {
        id: "ln_photo",
        label: "Hero photo",
        background: "surface",
        padding: [0, 0, 0, 0],
        columns: [
          {
            id: "ln_photo_c",
            width: 1,
            blocks: [{ id: "ln_photo_img", type: "image", src: FOLIO_PHOTOS.shopReading.src, alt: FOLIO_PHOTOS.shopReading.alt, href: `${site}/books#literary-fiction`, width: 100, align: "center", radius: 0, source: "pexels", credit: FOLIO_PHOTOS.shopReading.credit }],
          },
        ],
        evidence: "Warm, quiet interior over a busy shelf shot: this group's films (Aftersun, Past Lives) are intimate and lamp-lit.",
      },
      {
        id: "ln_hero",
        label: "Hero",
        background: "primary",
        padding: [40, 44, 44, 44],
        columns: [
          {
            id: "ln_hero_c",
            width: 1,
            blocks: [
              { id: "ln_hero_label", type: "text", html: "<p>New in literary fiction</p>", align: "left", color: "accent", size: 15 },
              { id: "ln_hero_h", type: "heading", text: "Four novels for the slow evenings ahead", level: 1, align: "left", size: 36 },
              {
                id: "ln_hero_text",
                type: "text",
                html: "<p>Hi {{first_name|there}}, the light goes earlier now and the reading room lamps are on by five. These are the new books our booksellers keep pressing into people's hands: small in scale, big in feeling, each one made for a long evening and a pot of tea.</p>",
                align: "left",
                size: 17,
              },
              { id: "ln_hero_btn", type: "button", label: "See all new fiction", href: `${site}/books#literary-fiction`, align: "left", color: "accent", size: "md" },
            ],
          },
        ],
        evidence:
          "Group's strongest signals: Sally Rooney, Ocean Vuong and Phoebe Bridgers, with A24 dramas (Aftersun, Past Lives, Lady Bird). Copy leads with mood and attention, not plot.",
      },
      {
        id: "ln_picks",
        label: "Picks",
        background: "surface",
        padding: [40, 32, 16, 32],
        columns: [
          {
            id: "ln_picks_c",
            width: 1,
            blocks: [
              { id: "ln_picks_h", type: "heading", text: "This month's four", level: 2, align: "left" },
              {
                id: "ln_picks_items",
                type: "items",
                itemIds: [folioRef("kairos"), folioRef("western-lane"), folioRef("the-safekeep"), folioRef("orbital")],
                pick: "manual",
                count: 4,
                columns: 2,
                layout: "grid",
                show: { image: true, subtitle: true, description: false, price: true, button: true, reason: true },
                buttonLabel: "Read more",
                reasons: {
                  [folioRef("kairos")]: "For Normal People readers: the same close attention to two people talking past each other, with East Berlin coming apart around them.",
                  [folioRef("western-lane")]: "Spare and aching, like a Phoebe Bridgers song: grief, sisters and the sound of a squash ball, in 160 pages.",
                  [folioRef("the-safekeep")]: "If Portrait of a Lady on Fire is your film: a slow, sensual 1960s summer in a house full of secrets.",
                  [folioRef("orbital")]: "Like Aftersun, it's built from small moments that quietly add up to something enormous.",
                },
              },
            ],
          },
        ],
        evidence:
          "Picked for the group's taste: interior literary fiction (Rooney, Cusk, Offill), lyric poetry (Vuong), A24 films. Tag overlap: literary fiction, grief, love affair, debut.",
      },
      {
        id: "ln_quote",
        label: "Staff note",
        background: "muted",
        padding: [36, 48, 36, 48],
        columns: [
          {
            id: "ln_quote_c",
            width: 1,
            blocks: [
              {
                id: "ln_quote_q",
                type: "quote",
                text: "The sound of a squash ball in an empty court has never been so sad. A debut that does more in 160 pages than most novels do in 400.",
                author: "Theo Brandt",
                role: "Fiction buyer, on Western Lane",
                align: "center",
              },
            ],
          },
        ],
        evidence: "A bookseller's voice carries this group (they read for sentences); Theo's note is on the pick closest to their taste.",
      },
      {
        id: "ln_event",
        label: "Event",
        background: "surface",
        padding: [36, 32, 40, 32],
        gap: 24,
        columns: [
          {
            id: "ln_event_img_c",
            width: 0.45,
            verticalAlign: "middle",
            blocks: [{ id: "ln_event_img", type: "image", src: FOLIO_PHOTOS.authorTalk.src, alt: FOLIO_PHOTOS.authorTalk.alt, href: event("debut-night"), width: 100, align: "center", source: "pexels", credit: FOLIO_PHOTOS.authorTalk.credit }],
          },
          {
            id: "ln_event_text_c",
            width: 0.55,
            verticalAlign: "middle",
            blocks: [
              { id: "ln_event_h", type: "heading", text: "Debut Night, Thursday, November 5", level: 3, align: "left" },
              {
                id: "ln_event_text",
                type: "text",
                html: "<p>Three first novelists, one long table and a glass of wine. Marisol Tran, Owen Achterberg and Ada Lindqvist read from their debuts and talk with Maeve about how a first book gets made. Free, but seats go quickly.</p>",
                align: "left",
                size: 16,
              },
              { id: "ln_event_btn", type: "button", label: "Save a seat", href: event("debut-night"), align: "left", variant: "outline", size: "sm" },
            ],
          },
        ],
        evidence: "Debut fiction overlaps two of the four picks (Western Lane, The Safekeep); most of the group lives in Brooklyn, a short walk from the reading room.",
      },
      footerSection("ln", site, "You're getting this because you signed up for the Fern Letter at Folio & Fern."),
    ],
  };

  // b. The book club ("people"): personal hero heading, intro and picks, rewritten per member.
  const autumnList: FolioDoc = {
    kind: "email",
    version: 1,
    subject: "Your autumn reading list",
    preheader: "Three books picked for you, plus October's book club pick and a seat at the table.",
    sections: [
      headerSection("al", site),
      {
        id: "al_hero",
        label: "Hero",
        background: "surface",
        padding: [8, 32, 24, 32],
        columns: [
          {
            id: "al_hero_c",
            width: 1,
            blocks: [
              { id: "al_hero_img", type: "image", src: FOLIO_PHOTOS.bookClub.src, alt: FOLIO_PHOTOS.bookClub.alt, width: 100, align: "center", source: "pexels", credit: FOLIO_PHOTOS.bookClub.credit },
              { id: "al_hero_h", type: "heading", personal: true, text: "Your autumn reading list, {{first_name|friend}}", level: 1, align: "left", padding: [28, 0, 8, 0] },
              {
                id: "al_hero_text",
                type: "text",
                personal: true,
                html: "<p>We've read a lot together this year, from Irish novellas to East Berlin love affairs. For autumn we went back through what each of you has told us you love and pulled three books from our shelves we think you'll want next. Bring your verdicts to the reading room.</p>",
                align: "left",
                size: 17,
              },
            ],
          },
        ],
        evidence:
          "Written for the club as a whole: eight readers with eight distinct tastes (Zadie Smith, Cormac McCarthy, Murakami, Robert Caro, Emily Henry, Ted Chiang, Alice Munro, Agatha Christie). Each member's version rewrites the heading and intro from their own profile.",
      },
      {
        id: "al_picks",
        label: "Picks",
        background: "surface",
        padding: [8, 32, 32, 32],
        columns: [
          {
            id: "al_picks_c",
            width: 1,
            blocks: [
              { id: "al_picks_h", type: "heading", text: "Three for you", level: 2, align: "left" },
              {
                id: "al_picks_items",
                type: "items",
                personal: true,
                itemIds: [folioRef("kairos"), folioRef("piranesi"), folioRef("the-god-of-the-woods")],
                pick: "taste",
                count: 3,
                columns: 3,
                layout: "grid",
                show: { image: true, subtitle: true, description: false, price: true, button: true, reason: true },
                buttonLabel: "Reserve a copy",
                reasons: {
                  [folioRef("kairos")]: "Short chapters and big questions about love and power: a lot to talk about.",
                  [folioRef("piranesi")]: "A strange, kind puzzle box that even our fantasy skeptics have loved.",
                  [folioRef("the-god-of-the-woods")]: "A long, absorbing mystery for the first properly cold weekend.",
                },
              },
            ],
          },
        ],
        evidence:
          "Taste slot: replaced per member by emailItems:rank on their own profile (Ravi toward hard science fiction, Hana toward Japanese fiction, Marcus toward history). The defaults suit the club as a whole.",
      },
      {
        id: "al_club",
        label: "Book club pick",
        background: "muted",
        padding: [32, 32, 32, 32],
        gap: 24,
        columns: [
          {
            id: "al_club_img_c",
            width: 0.3,
            verticalAlign: "middle",
            blocks: [{ id: "al_club_cover", type: "image", src: smallThings.cover, alt: "Small Things Like These by Claire Keegan, book cover", href: book(smallThings.slug), width: 100, align: "center", radius: 2, source: "item" }],
          },
          {
            id: "al_club_text_c",
            width: 0.7,
            verticalAlign: "middle",
            blocks: [
              { id: "al_club_h", type: "heading", text: "October's book club pick", level: 3, align: "left" },
              {
                id: "al_club_text",
                type: "text",
                html: "<p><strong>Small Things Like These</strong> by Claire Keegan. A coal merchant, a convent and one December in 1985: 114 pages you can read in an evening and talk about for hours.</p><p>We meet <strong>Thursday, October 22 at 7pm</strong> in the reading room. Members get 10% off the pick, and there's always tea.</p>",
                align: "left",
                size: 16,
              },
              { id: "al_club_btn", type: "button", label: "Get your copy", href: book(smallThings.slug), align: "left", size: "md" },
            ],
          },
        ],
        evidence: "The same for every member: the club's monthly pick and meeting.",
      },
      {
        id: "al_next",
        label: "Next month",
        background: "surface",
        padding: [24, 32, 28, 32],
        columns: [
          {
            id: "al_next_c",
            width: 1,
            blocks: [
              {
                id: "al_next_text",
                type: "text",
                html: "<p>November's pick is <a href=\"" +
                  book("the-bee-sting") +
                  "\">The Bee Sting</a> by Paul Murray. It's a big one, so we're meeting a week early for Thanksgiving: <strong>Thursday, November 19</strong>.</p>",
                align: "left",
                size: 15,
                color: "text",
              },
            ],
          },
        ],
        evidence: "A heads-up for the long November read keeps members on schedule.",
      },
      footerSection("al", site, "You're getting this because you're a member of the Folio & Fern Book Club."),
    ],
  };

  // c. Event invite draft (fictional authors).
  const debut = FOLIO_EVENTS.find((e) => e.slug === "debut-night")!;
  const debutNight: FolioDoc = {
    kind: "email",
    version: 1,
    subject: "Debut Night: three first novels, Nov 5",
    preheader: "Three new novelists, one long table and a glass of wine. Free; RSVP to save a seat.",
    sections: [
      headerSection("dn", site),
      {
        id: "dn_photo",
        label: "Hero photo",
        background: "surface",
        padding: [0, 0, 0, 0],
        columns: [
          {
            id: "dn_photo_c",
            width: 1,
            blocks: [{ id: "dn_photo_img", type: "image", src: FOLIO_PHOTOS.authorTalk.src, alt: FOLIO_PHOTOS.authorTalk.alt, href: event("debut-night"), width: 100, align: "center", radius: 0, source: "pexels", credit: FOLIO_PHOTOS.authorTalk.credit }],
          },
        ],
        evidence: "The reading room at an event: lamplight and a small crowd, so it reads as an evening in, not a lecture.",
      },
      {
        id: "dn_hero",
        label: "Hero",
        background: "surface",
        padding: [36, 40, 32, 40],
        columns: [
          {
            id: "dn_hero_c",
            width: 1,
            blocks: [
              { id: "dn_hero_when", type: "text", html: "<p><strong>Thursday, November 5 · 7pm · The reading room</strong></p>", align: "center", color: "accent", size: 15 },
              { id: "dn_hero_h", type: "heading", text: "Debut Night: three first novels, one evening", level: 1, align: "center" },
              {
                id: "dn_hero_text",
                type: "text",
                html: "<p>Every bookseller remembers handing someone a first novel and watching them come back for the author's next. This is that feeling with the authors in the room: three readings, a conversation with Maeve, and time to get your copy signed.</p>",
                align: "center",
                size: 17,
              },
              { id: "dn_hero_btn", type: "button", label: "RSVP, it's free", href: event("debut-night"), align: "center", size: "lg" },
            ],
          },
        ],
        evidence: "Invite copy for the whole list; one primary action (RSVP), repeated at the end.",
      },
      {
        id: "dn_readers",
        label: "The authors",
        background: "muted",
        padding: [32, 28, 32, 28],
        gap: 20,
        columns: (debut.readers ?? []).map((r, i) => ({
          id: `dn_reader_${i + 1}`,
          width: 1 / 3,
          blocks: [
            { id: `dn_reader_${i + 1}_h`, type: "heading" as const, text: r.name, level: 3 as const, align: "left" as const, size: 20 },
            { id: `dn_reader_${i + 1}_text`, type: "text" as const, html: `<p><strong>${r.book}</strong><br>${r.line}</p>`, align: "left" as const, size: 15 },
          ],
        })),
        evidence: "Each debut gets one line: what it's about and who's in it, so readers find the one that's theirs.",
      },
      {
        id: "dn_details",
        label: "Details",
        background: "surface",
        padding: [32, 40, 16, 40],
        columns: [
          {
            id: "dn_details_c",
            width: 1,
            blocks: [
              { id: "dn_details_h", type: "heading", text: "The details", level: 2, align: "left" },
              {
                id: "dn_details_text",
                type: "text",
                html:
                  `<ul><li><strong>When:</strong> Thursday, November 5. Doors at 6:30pm, readings at 7pm.</li>` +
                  `<li><strong>Where:</strong> The reading room at Folio &amp; Fern, ${ADDRESS}.</li>` +
                  `<li><strong>Cost:</strong> Free. Signed copies of all three books on sale on the night.</li>` +
                  `<li><strong>Access:</strong> Step-free entrance on Court Street; the reading room is on the ground floor.</li></ul>`,
                align: "left",
                size: 16,
              },
            ],
          },
        ],
        evidence: "Practical details people look for before saying yes.",
      },
      {
        id: "dn_quote",
        label: "Host",
        background: "surface",
        padding: [8, 48, 32, 48],
        columns: [
          {
            id: "dn_quote_c",
            width: 1,
            blocks: [
              {
                id: "dn_quote_q",
                type: "quote",
                text: "All three of these books made me miss my subway stop. I can't wait for you to meet the people who wrote them.",
                author: "Maeve Calloway",
                role: "Owner, Folio & Fern",
                align: "center",
              },
              { id: "dn_quote_btn", type: "button", label: "Save a seat", href: event("debut-night"), align: "center", size: "md", padding: [20, 0, 0, 0] },
            ],
          },
        ],
        evidence: "The owner's voice as host; the RSVP repeated once.",
      },
      footerSection("dn", site, "You're getting this because you signed up for the Fern Letter at Folio & Fern."),
    ],
  };

  return [
    { key: "literary-new", name: "New in literary fiction", audience: { kind: "group", group: "literary" }, status: "sent", doc: literaryNew },
    { key: "autumn-list", name: "Your autumn reading list", audience: { kind: "people", list: "book-club" }, status: "draft", doc: autumnList },
    { key: "debut-night", name: "Debut night at Folio & Fern", audience: null, status: "draft", doc: debutNight },
  ];
}

export const FOLIO_CAMPAIGNS: FolioCampaign[] = folioCampaigns();
