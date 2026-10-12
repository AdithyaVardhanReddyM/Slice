# Design craft

How a page earns a second look. Use this with the brand's anatomy and screenshot: the brand decides the style, this decides the quality.

## Extend the brand, do not reinvent it
- The page must read as the brand's own work. Start from the homepage: same header logic, same hero composition family, same section rhythm, same type scale and casing, same button shape, same way of framing photographs. Change the content and the emphasis for the audience, not the design language.
- Use the kit tokens for colour and type. Never introduce a new accent colour, a gradient the brand does not use, or a decorative font. If the brand is quiet, stay quiet.
- When the merchant asks for a different look ("make it dark", "more playful", "like Apple"), that instruction wins over the brand default for this page; keep the logo, the fonts and the voice unless told otherwise.

## Hierarchy
- One h1, 4 to 9 words, the biggest thing on the page. Each section has one h2. Scale steps are clear: display, h2, lead, body, small. Weight and size change together, not one without the other.
- Everything the eye lands on first should be the thing that matters most: the offer, the headline, the primary button. Secondary content is smaller, lighter, later.
- Line length 45 to 75 characters for body copy (max-width in ch or em). Lead paragraphs one sentence. Body paragraphs two or three.

## Layout and rhythm
- Mobile first: single column, then widen with grid at 720px and 1024px. Use `clamp()` for type and spacing so the page scales without breakpoints everywhere. Never let anything overflow horizontally.
- A consistent container width (1200 to 1320px) and gutter. Section padding in one scale (for example 56px mobile, 96px desktop) multiplied by the brand's density. Equal gaps within a section; bigger gaps between sections than inside them.
- Align to a grid. Left-align text in editorial brands, centre only when the homepage centres. Do not centre everything.
- Vary section shapes: a full-bleed image, a two-column split, a three-up grid, a dark band, a narrow text column. Two similar sections in a row read as filler.

## Colour
- Background, foreground, one primary, one accent: the kit. Roughly 60% background, 30% surface and text, 10% primary. Primary goes on the main button, the eyebrow and one or two highlights, nowhere else.
- Contrast: body text 4.5:1, large headings 3:1. Text over photographs needs a gradient scrim or a solid panel. Check light text on light photos.
- Dark bands use the brand foreground as background, not pure black, unless the brand uses black.

## Imagery
- Prefer the brand's own photographs (site photos) over stock. Stock only to fill a gap, in the brand's imagery style (light, setting, subject, grade) from the kit and anatomy.
- Match the brand's framing: full-bleed or framed, corner radius, aspect ratios, captions or none. Use `object-fit: cover` with fixed aspect ratios so layouts never jump.
- Every image has meaningful alt text. No text baked into images. No obvious stock clichés (handshakes, laptops with coffee, pointing at screens).

## Components
- Buttons: the kit's shape and casing. One primary style, one secondary (outline or text). Minimum 44px tap height. Arrows and icons only if the brand uses them.
- Cards: border or surface colour from the kit, radius from the kit, no drop shadows unless the brand uses them. Price and name on one line when possible.
- Forms: one column on mobile, labels above fields, one required field minimum, a clear submit label that says what happens ("Join the waitlist", not "Submit").
- Navigation: 2 to 4 anchor links to sections plus the primary button. Footer: one line and a couple of links.

## Motion
- CSS only, subtle: a fade and 12px rise on first paint for hero copy, hover states on buttons and cards, nothing that loops. Respect `prefers-reduced-motion`.

## Avoid the generic AI page
- No purple or blue gradients, no glassmorphism, no emoji as icons, no three identical icon-and-blurb cards as the second section by default, no "Welcome to", no lorem, no placeholder numbers, no invented reviews or logos.
- No em dashes or exclamation marks in copy. Sentence case unless the brand's labels are uppercase.
- Fewer, better sections: 5 to 8 that each do one job beats 12 that repeat.
