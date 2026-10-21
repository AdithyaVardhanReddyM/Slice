// Knock: a Los Angeles food-delivery app (fictional company, real restaurants).
// Brand site for the Media service: the brand setup reads its homepage, and the
// restaurants and dishes here are what Media's Knock creatives feature.

export const KNOCK = {
  name: "Knock",
  legalName: "Knock Delivery, Inc.",
  tagline: "LA's favourite kitchens, at your door.",
  domain: "knock.la",
  email: "hello@knock.la",
  founded: 2021,
  street: "1100 E 5th St",
  city: "Los Angeles",
  region: "CA",
  postalCode: "90013",
  country: "US",
  stats: { kitchens: 140, minutes: 28, rating: 4.8, angelenos: "120k" },
  socials: [
    { network: "Instagram", url: "https://instagram.com/knock.la" },
    { network: "TikTok", url: "https://tiktok.com/@knock.la" },
    { network: "X", url: "https://x.com/knockla" },
  ],
};

export const img = (name: string) => `/knock/img/${name}`;

export const href = {
  home: "/knock",
  restaurants: "/knock/restaurants",
  category: (id: string) => `/knock/restaurants?category=${id}`,
  area: (id: string) => `/knock/restaurants?area=${id}`,
  restaurant: (slug: string) => `/knock/restaurants/${slug}`,
  how: "/knock#how-it-works",
  areas: "/knock#neighbourhoods",
  partners: "/knock#for-restaurants",
  app: "/knock#app",
};

export interface KnockCategory {
  id: string;
  name: string;
  image: string;
}

export const CATEGORIES: KnockCategory[] = [
  { id: "tacos", name: "Tacos", image: "birria-tacos.jpg" },
  { id: "ramen", name: "Ramen & udon", image: "tonkotsu.jpg" },
  { id: "chicken", name: "Hot chicken", image: "hot-chicken.jpg" },
  { id: "pizza", name: "Pizza", image: "pepperoni.jpg" },
  { id: "burgers", name: "Burgers", image: "smash-burger.jpg" },
  { id: "korean", name: "Korean", image: "korean-chicken.jpg" },
  { id: "pasta", name: "Pasta", image: "spicy-fusilli.jpg" },
  { id: "bowls", name: "Healthy bowls", image: "sorrel-bowl.jpg" },
  { id: "breakfast", name: "Bagels & brunch", image: "bagel.jpg" },
  { id: "dessert", name: "Desserts", image: "churros.jpg" },
];

export interface KnockArea {
  id: string;
  name: string;
  note: string;
}

export const AREAS: KnockArea[] = [
  { id: "east-la", name: "East LA", note: "Birria and mariscos on Whittier Blvd" },
  { id: "boyle-heights", name: "Boyle Heights", note: "Shrimp tacos off Olympic" },
  { id: "downtown", name: "Downtown", note: "Sonoran flour tortillas on 8th" },
  { id: "little-tokyo", name: "Little Tokyo", note: "Ramen and udon on 1st St" },
  { id: "chinatown", name: "Chinatown", note: "The hot chicken line, skipped" },
  { id: "sawtelle", name: "Sawtelle", note: "Tsukemen on Japantown's main drag" },
  { id: "koreatown", name: "Koreatown", note: "Fried chicken and burgers on 6th" },
  { id: "west-hollywood", name: "West Hollywood", note: "Pepperoni squares on Sunset" },
  { id: "fairfax", name: "Fairfax", note: "Spicy fusilli and meatballs" },
  { id: "silver-lake", name: "Silver Lake", note: "Rice bowls and bagels on Virgil" },
  { id: "manhattan-beach", name: "Manhattan Beach", note: "Acai and cold-pressed juice" },
];

export interface KnockDish {
  name: string;
  description: string;
  price: number;
  popular?: boolean;
}

export interface KnockRestaurant {
  slug: string;
  name: string;
  area: string;
  address: string;
  cuisine: string;
  categories: string[];
  image: string;
  imageAlt: string;
  blurb: string;
  rating: number;
  reviews: number;
  eta: [number, number];
  fee: number;
  offer?: string;
  menu: KnockDish[];
}

export const RESTAURANTS: KnockRestaurant[] = [
  {
    slug: "birrieria-gonzalez",
    name: "Birrieria Gonzalez",
    area: "east-la",
    address: "5522 Whittier Blvd, Los Angeles, CA 90022",
    cuisine: "Jalisco-style birria",
    categories: ["tacos"],
    image: "birria-tacos.jpg",
    imageAlt: "Three griddled birria tacos with a cup of red consomé and lime",
    blurb: "Goat and beef birria the Jalisco way, with a cup of consomé for dipping. The East LA counter people drive across town for.",
    rating: 4.9,
    reviews: 3820,
    eta: [25, 35],
    fee: 0,
    offer: "$0 delivery fee",
    menu: [
      { name: "Birria tacos (3)", description: "Griddled corn tortillas, cheese, onion, cilantro, a cup of consomé", price: 14.5, popular: true },
      { name: "Quesabirria plate", description: "Two cheesy tacos, rice, beans, consomé", price: 16.95 },
      { name: "Birria ramen", description: "Instant ramen in a big bowl of birria consomé, topped with meat", price: 13.5, popular: true },
      { name: "Consomé, large", description: "32 oz of the broth, onion and cilantro on the side", price: 7.5 },
    ],
  },
  {
    slug: "sonoratown",
    name: "Sonoratown",
    area: "downtown",
    address: "208 E 8th St, Los Angeles, CA 90014",
    cuisine: "Sonoran tacos",
    categories: ["tacos"],
    image: "carne-asada.jpg",
    imageAlt: "Carne asada tacos on thin flour tortillas with guacamole, beans and salsa",
    blurb: "Mesquite-grilled steak on paper-thin flour tortillas made by hand every morning, the way they do it in Sonora.",
    rating: 4.8,
    reviews: 2410,
    eta: [20, 30],
    fee: 1.99,
    offer: "20% off your first order",
    menu: [
      { name: "Carne asada tacos (3)", description: "Mesquite steak, guacamole, salsa roja on flour tortillas", price: 13.75, popular: true },
      { name: "Chivichanga", description: "A small burrito of carne asada, beans, cheese and green chile", price: 9.5, popular: true },
      { name: "Costra", description: "Crisped cheese folded around steak and guacamole", price: 8.25 },
      { name: "Pinto beans", description: "Slow-cooked with lard, a side for two", price: 4.5 },
    ],
  },
  {
    slug: "mariscos-jalisco",
    name: "Mariscos Jalisco",
    area: "boyle-heights",
    address: "3040 E Olympic Blvd, Los Angeles, CA 90023",
    cuisine: "Mexican seafood",
    categories: ["tacos"],
    image: "shrimp-tacos.jpg",
    imageAlt: "Crispy fried shrimp tacos topped with red salsa and avocado",
    blurb: "The truck behind the most famous taco in Boyle Heights: shrimp folded into a tortilla, fried crisp, buried in salsa and avocado.",
    rating: 4.9,
    reviews: 2975,
    eta: [25, 40],
    fee: 0.99,
    menu: [
      { name: "Tacos dorados de camarón (3)", description: "Fried shrimp tacos, salsa roja, sliced avocado", price: 12.0, popular: true },
      { name: "Tostada de ceviche", description: "Fish ceviche, tomato, onion, cilantro, lime", price: 6.5 },
      { name: "Campechana", description: "Shrimp and octopus cocktail, avocado, saltines", price: 17.5 },
    ],
  },
  {
    slug: "tsujita",
    name: "Tsujita LA Artisan Noodle",
    area: "sawtelle",
    address: "2057 Sawtelle Blvd, Los Angeles, CA 90025",
    cuisine: "Tsukemen and ramen",
    categories: ["ramen"],
    image: "tsukemen.jpg",
    imageAlt: "Thick tsukemen noodles beside a bowl of dark dipping broth with chashu and egg",
    blurb: "Thick noodles and a pork-and-fish dipping broth simmered for 60 hours. The Sawtelle bowl that started LA's tsukemen line.",
    rating: 4.8,
    reviews: 4105,
    eta: [30, 40],
    fee: 1.99,
    menu: [
      { name: "Tsukemen", description: "Thick chilled noodles, rich tonkotsu-gyokai dipping broth, chashu, egg", price: 17.95, popular: true },
      { name: "Tonkotsu ramen", description: "Pork bone broth, thin noodles, chashu, scallion", price: 16.5 },
      { name: "Chashu rice bowl", description: "Torched pork belly over rice, sweet soy", price: 8.95 },
    ],
  },
  {
    slug: "daikokuya",
    name: "Daikokuya",
    area: "little-tokyo",
    address: "327 E 1st St, Los Angeles, CA 90012",
    cuisine: "Tonkotsu ramen",
    categories: ["ramen"],
    image: "tonkotsu.jpg",
    imageAlt: "A bowl of creamy tonkotsu ramen with chashu, egg and scallions",
    blurb: "Little Tokyo's classic since 2002: milky tonkotsu, kurobuta pork belly and a soy-marinated egg.",
    rating: 4.7,
    reviews: 5230,
    eta: [25, 35],
    fee: 0.99,
    offer: "Buy 1 get 1 free today",
    menu: [
      { name: "Daikoku ramen", description: "Tonkotsu broth, kurobuta chashu, marinated egg, bamboo, scallion", price: 16.25, popular: true },
      { name: "Spicy miso ramen", description: "Miso tonkotsu with chili oil and ground pork", price: 16.75 },
      { name: "Gyoza (6)", description: "Pan-fried pork dumplings", price: 7.5 },
    ],
  },
  {
    slug: "marugame-monzo",
    name: "Marugame Monzo",
    area: "little-tokyo",
    address: "329 E 1st St, Los Angeles, CA 90012",
    cuisine: "Handmade udon",
    categories: ["ramen", "pasta"],
    image: "udon-carbonara.jpg",
    imageAlt: "Miso carbonara udon with bacon and black pepper in a dark bowl",
    blurb: "Udon cut by hand in the front window. Order the miso carbonara, the dish Little Tokyo queues for.",
    rating: 4.8,
    reviews: 3360,
    eta: [25, 35],
    fee: 1.49,
    menu: [
      { name: "Miso carbonara udon", description: "Fresh udon, miso cream, egg, bacon, parmesan, black pepper", price: 19.5, popular: true },
      { name: "Uni cream udon", description: "Sea urchin cream sauce, shiso, nori", price: 26.0 },
      { name: "Kake udon", description: "Hot dashi broth, scallion, tempura flakes", price: 13.5 },
    ],
  },
  {
    slug: "howlin-rays",
    name: "Howlin' Ray's",
    area: "chinatown",
    address: "727 N Broadway #128, Los Angeles, CA 90012",
    cuisine: "Nashville hot chicken",
    categories: ["chicken"],
    image: "hot-chicken.jpg",
    imageAlt: "A Nashville hot chicken sandwich with slaw and pickles beside crinkle fries",
    blurb: "Nashville hot chicken from Far East Plaza, from Country to Howlin'. Skip the two-hour line.",
    rating: 4.9,
    reviews: 6120,
    eta: [30, 45],
    fee: 1.99,
    offer: "Free fries over $25",
    menu: [
      { name: "Hot chicken sando", description: "Hot chicken thigh, comeback sauce, slaw, pickles, brioche", price: 15.0, popular: true },
      { name: "Tenders (3)", description: "Your heat, white bread, pickles", price: 16.0 },
      { name: "Crinkle fries", description: "Dusted with hot spice if you like", price: 5.0 },
      { name: "Comeback sauce", description: "The house dip", price: 1.5 },
    ],
  },
  {
    slug: "kyochon",
    name: "Kyochon Chicken",
    area: "koreatown",
    address: "3833 W 6th St, Los Angeles, CA 90020",
    cuisine: "Korean fried chicken",
    categories: ["chicken", "korean"],
    image: "korean-chicken.jpg",
    imageAlt: "Korean fried wings in soy-garlic and spicy red glaze with sesame and radish",
    blurb: "Twice-fried wings brushed by hand in soy garlic or red pepper, with pickled radish to cool things down.",
    rating: 4.6,
    reviews: 2280,
    eta: [20, 30],
    fee: 0.99,
    menu: [
      { name: "Half and half wings (16)", description: "Soy garlic and red pepper, pickled radish", price: 27.99, popular: true },
      { name: "Honey series combo", description: "Wings and drumsticks in honey glaze", price: 24.99 },
      { name: "Tteokbokki", description: "Rice cakes in sweet chili sauce", price: 12.99 },
    ],
  },
  {
    slug: "prince-street-pizza",
    name: "Prince Street Pizza",
    area: "west-hollywood",
    address: "9161 Sunset Blvd, West Hollywood, CA 90069",
    cuisine: "New York pizza",
    categories: ["pizza"],
    image: "pepperoni.jpg",
    imageAlt: "Square Sicilian pizza slices covered in cupped crispy pepperoni in a box",
    blurb: "The SoHo square slice, on Sunset: thick Sicilian crust, spicy sauce and pepperoni that curls into little cups.",
    rating: 4.7,
    reviews: 1840,
    eta: [25, 40],
    fee: 1.99,
    menu: [
      { name: "Spicy Spring square", description: "Fra diavolo sauce, mozzarella, cupped pepperoni", price: 6.95, popular: true },
      { name: "Whole Spicy Spring pie", description: "Eight squares, for the group chat", price: 48.0 },
      { name: "Grandma square", description: "Thin square, marinara, garlic, fresh mozzarella", price: 5.95 },
    ],
  },
  {
    slug: "cassells",
    name: "Cassell's Hamburgers",
    area: "koreatown",
    address: "3600 W 6th St, Los Angeles, CA 90020",
    cuisine: "Burgers",
    categories: ["burgers"],
    image: "smash-burger.jpg",
    imageAlt: "A double cheeseburger with griddled onions and pickles beside fries",
    blurb: "An LA burger counter since 1948, with beef ground in-house every morning and pies baked in the back.",
    rating: 4.6,
    reviews: 1530,
    eta: [20, 35],
    fee: 0.99,
    menu: [
      { name: "Double cheeseburger", description: "Two patties, American cheese, griddled onions, pickles", price: 15.5, popular: true },
      { name: "Patty melt", description: "Rye, Swiss, caramelized onions", price: 15.0 },
      { name: "Fries", description: "Skin-on, salted", price: 5.0 },
    ],
  },
  {
    slug: "jon-and-vinnys",
    name: "Jon & Vinny's",
    area: "fairfax",
    address: "412 N Fairfax Ave, Los Angeles, CA 90036",
    cuisine: "Italian-American",
    categories: ["pasta", "pizza"],
    image: "spicy-fusilli.jpg",
    imageAlt: "Spicy fusilli in a vodka tomato cream sauce with parmesan and basil",
    blurb: "The Fairfax spot for spicy fusilli, meatballs and LA Woman pizza, packed for the couch.",
    rating: 4.7,
    reviews: 2690,
    eta: [30, 45],
    fee: 1.99,
    menu: [
      { name: "Spicy fusilli", description: "Vodka sauce, chili, parmesan, basil", price: 25.0, popular: true },
      { name: "LA Woman pizza", description: "Tomato, burrata, basil", price: 25.0 },
      { name: "Meatballs", description: "Four, in red sauce with garlic bread", price: 21.0 },
    ],
  },
  {
    slug: "sqirl",
    name: "Sqirl",
    area: "silver-lake",
    address: "720 N Virgil Ave #4, Los Angeles, CA 90029",
    cuisine: "Californian breakfast and lunch",
    categories: ["bowls", "breakfast"],
    image: "sorrel-bowl.jpg",
    imageAlt: "A rice bowl with green sorrel pesto, a poached egg, feta and watermelon radish",
    blurb: "The sorrel pesto rice bowl that defined LA breakfast, with jam made from Southern California fruit.",
    rating: 4.6,
    reviews: 2050,
    eta: [25, 35],
    fee: 1.49,
    offer: "20% off your first order",
    menu: [
      { name: "Sorrel pesto rice bowl", description: "Kokuho rose rice, sorrel pesto, lemon, feta, radish, poached egg", price: 16.0, popular: true },
      { name: "Ricotta toast", description: "Brioche, house ricotta, seasonal jam", price: 12.5 },
      { name: "Crispy rice salad", description: "Herbs, lime, chili, sausage", price: 17.0 },
    ],
  },
  {
    slug: "kreation",
    name: "Kreation Organic",
    area: "manhattan-beach",
    address: "3516 Highland Ave, Manhattan Beach, CA 90266",
    cuisine: "Juice and bowls",
    categories: ["bowls"],
    image: "acai-bowl.jpg",
    imageAlt: "An acai bowl with banana, berries and granola next to a green juice",
    blurb: "Organic cold-pressed juice and acai bowls, for after the beach or after class.",
    rating: 4.7,
    reviews: 890,
    eta: [20, 30],
    fee: 0.99,
    menu: [
      { name: "Acai bowl", description: "Acai, banana, berries, granola, coconut, honey", price: 14.0, popular: true },
      { name: "Kale-ginger juice", description: "Cold-pressed, 16 oz", price: 11.0 },
      { name: "Power greens bowl", description: "Quinoa, kale, avocado, lemon tahini", price: 15.5 },
    ],
  },
  {
    slug: "courage-bagels",
    name: "Courage Bagels",
    area: "silver-lake",
    address: "777 N Virgil Ave, Los Angeles, CA 90029",
    cuisine: "Bagels",
    categories: ["breakfast"],
    image: "bagel.jpg",
    imageAlt: "An everything bagel with scallion cream cheese, smoked salmon and capers",
    blurb: "Hand-rolled, long-fermented bagels from a tiny Virgil Village window. They sell out by noon.",
    rating: 4.8,
    reviews: 1260,
    eta: [20, 30],
    fee: 0.99,
    menu: [
      { name: "Everything with lox", description: "Scallion cream cheese, smoked salmon, capers, red onion", price: 19.0, popular: true },
      { name: "Sesame with cream cheese", description: "Plain or scallion", price: 8.0 },
      { name: "Half dozen bagels", description: "Baker's choice, with a tub of cream cheese", price: 26.0 },
    ],
  },
  {
    slug: "mr-churro",
    name: "Mr. Churro",
    area: "downtown",
    address: "E-12 Olvera St, Los Angeles, CA 90012",
    cuisine: "Churros",
    categories: ["dessert"],
    image: "churros.jpg",
    imageAlt: "A paper cone of cinnamon-sugar churros with a cup of chocolate",
    blurb: "Churros fried to order on Olvera Street, filled or plain, with thick chocolate for dipping.",
    rating: 4.7,
    reviews: 970,
    eta: [20, 30],
    fee: 0.99,
    menu: [
      { name: "Churros (4) with chocolate", description: "Cinnamon sugar, a cup of thick chocolate", price: 9.0, popular: true },
      { name: "Cajeta-filled churro", description: "Goat's milk caramel inside", price: 4.5 },
      { name: "Mexican hot chocolate", description: "Cinnamon and piloncillo", price: 4.75 },
    ],
  },
];

export interface KnockTrending {
  restaurant: string;
  dish: string;
  image: string;
  ordered: number;
  offer?: string;
}

/** The week's most-ordered dishes, by restaurant slug and dish name. */
export const TRENDING: KnockTrending[] = [
  { restaurant: "birrieria-gonzalez", dish: "Birria tacos (3)", image: "birria-tacos.jpg", ordered: 1842, offer: "$0 delivery fee" },
  { restaurant: "howlin-rays", dish: "Hot chicken sando", image: "hot-chicken.jpg", ordered: 1630, offer: "Free fries over $25" },
  { restaurant: "mariscos-jalisco", dish: "Tacos dorados de camarón (3)", image: "shrimp-tacos.jpg", ordered: 1377 },
  { restaurant: "tsujita", dish: "Tsukemen", image: "tsukemen.jpg", ordered: 1215 },
  { restaurant: "sqirl", dish: "Sorrel pesto rice bowl", image: "sorrel-bowl.jpg", ordered: 948, offer: "20% off your first order" },
];

export const TESTIMONIALS = [
  {
    quote: "Birria from Whittier showed up in Silver Lake still crackling, consomé still steaming. I don't know how they do it and I don't want to know.",
    name: "Daniela R.",
    area: "Silver Lake",
  },
  {
    quote: "Tsujita without the Sawtelle line, on my couch, before the episode ended. Knock is the only app on my home screen now.",
    name: "Kenji M.",
    area: "Palms",
  },
  {
    quote: "Hot chicken came cold once. They refunded it before I'd finished typing. That's why I stay.",
    name: "Marcus T.",
    area: "Inglewood",
  },
];

export const areaById = (id: string) => AREAS.find((a) => a.id === id);
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
export const restaurantBySlug = (slug: string) => RESTAURANTS.find((r) => r.slug === slug);
export const money = (n: number) => `$${n.toFixed(2)}`;
export const feeLabel = (fee: number) => (fee === 0 ? "Free delivery" : `${money(fee)} delivery`);
export const signature = (r: KnockRestaurant) => (r.menu.find((d) => d.popular) ?? r.menu[0]).name.replace(/\s*\(\d+\)$/, "");
export const etaLabel = (r: KnockRestaurant) => `${r.eta[0]}–${r.eta[1]} min`;
export const reviewsLabel = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));
export const dishOf = (t: KnockTrending) => {
  const r = restaurantBySlug(t.restaurant)!;
  return { r, dish: r.menu.find((d) => d.name === t.dish)! };
};
export const moreLike = (r: KnockRestaurant, n: number) =>
  RESTAURANTS.filter((o) => o.slug !== r.slug)
    .map((o) => ({ o, s: (o.area === r.area ? 2 : 0) + o.categories.filter((c) => r.categories.includes(c)).length * 3 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.o);
