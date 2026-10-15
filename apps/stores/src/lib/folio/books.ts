// Folio & Fern's catalog, staff, events and shop details. A verbatim copy of
// the shared block in packages/backend/convex/emailDemoData.ts (the Email
// service's demo data), so the site and the emails sell the same books. Edit
// there and copy the block here; don't edit this file on its own.

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
