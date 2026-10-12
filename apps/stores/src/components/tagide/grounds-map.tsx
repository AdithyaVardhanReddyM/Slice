import { cn } from "cn";

const INK = "#121212";
const CREAM = "#f4eee2";
const CREAM_DEEP = "#e6dcc8";
const ORANGE = "#f04f1f";
const ORANGE_DEEP = "#cf3d12";
const LILAC = "#cdb9ee";
const LILAC_DEEP = "#b59de3";

/** A stylised site plan of Parque Tejo: the river along the bottom, the four stages, the campsite, the gates and the bridge. */
export function GroundsMap({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 520"
      className={cn("w-full", className)}
      role="img"
      aria-label="Site plan of Parque Tejo: the Tejo main stage on the river, the Ponte tent by the east gate, the Armazém warehouse on the west side, the Jardim garden between them, Campo Tejo campsite to the north, and the Vasco da Gama bridge to the east"
      style={{ fontFamily: "Manrope, Helvetica Neue, Arial, sans-serif" }}
    >
      <defs>
        <pattern id="tg-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill={CREAM_DEEP} />
        </pattern>
        <pattern id="tg-tents" width="40" height="30" patternUnits="userSpaceOnUse" x="8">
          <path d="M6 24 L18 8 L30 24 Z" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </pattern>
      </defs>

      <rect width="800" height="520" rx="22" fill={CREAM} />
      <rect width="800" height="520" rx="22" fill="url(#tg-dots)" />

      {/* paths: a loop around the site and the spine down to the river gate */}
      <g fill="none" stroke={CREAM_DEEP} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
        <rect x="100" y="140" width="600" height="230" rx="40" />
        <path d="M400 140 V 404" />
        <path d="M100 255 H 48" />
        <path d="M700 255 H 752" />
      </g>

      {/* river */}
      <path d="M0 404 C 90 388, 160 420, 260 410 S 440 384, 540 406 S 720 428, 800 404 L800 498 Q800 520 778 520 L22 520 Q0 520 0 498 Z" fill={LILAC} />
      <path d="M0 436 C 90 420, 160 452, 260 442 S 440 416, 540 438 S 720 460, 800 436" fill="none" stroke={CREAM} strokeWidth="2.5" strokeDasharray="8 10" opacity="0.8" />
      <path d="M0 470 C 90 454, 160 486, 260 476 S 440 450, 540 472 S 720 494, 800 470" fill="none" stroke={CREAM} strokeWidth="2" strokeDasharray="4 12" opacity="0.6" />
      <Label x="26" y="500" fill={INK}>
        Rio Tejo
      </Label>

      {/* bridge: deck across the river at the east end, with piers */}
      <g stroke={INK} strokeLinecap="round">
        <path d="M640 520 L800 372" strokeWidth="8" />
        <path d="M640 520 L800 372" stroke={CREAM} strokeWidth="2" strokeDasharray="10 8" />
        <path d="M690 474 v 30 M740 428 v 30 M782 389 v 30" strokeWidth="5" />
      </g>
      <Label x="626" y="506" fill={INK} anchor="end" size="11">
        Ponte Vasco da Gama
      </Label>

      {/* campsite */}
      <rect x="150" y="28" width="500" height="80" rx="20" fill="none" stroke={INK} strokeWidth="2.5" strokeDasharray="9 9" />
      <rect x="300" y="38" width="340" height="60" rx="12" fill="url(#tg-tents)" />
      <Label x="172" y="60" fill={INK}>
        Campo Tejo
      </Label>
      <text x="172" y="80" fontSize="11" fontWeight="600" fill="#6b665e">
        Campsite · 5 min walk
      </text>

      {/* Armazém: warehouse with a sawtooth roof */}
      <path d="M126 196 L156 170 L156 196 L186 170 L186 196 L216 170 L216 196 L246 170 L246 196 L276 170 L276 196 L306 170 L306 196 V 236 H 126 Z" fill={INK} />
      <Label x="216" y="221" fill={CREAM} anchor="middle" size="14">
        Armazém
      </Label>

      {/* food court */}
      <g fill={ORANGE} opacity="0.9">
        <circle cx="386" cy="188" r="13" />
        <circle cx="414" cy="188" r="13" />
        <circle cx="400" cy="212" r="13" />
      </g>
      <Label x="400" y="248" fill={INK} anchor="middle" size="11">
        Food court
      </Label>

      {/* Ponte: the big tent */}
      <path d="M520 220 L600 150 L680 220 Z" fill={LILAC_DEEP} />
      <rect x="528" y="220" width="144" height="36" fill={LILAC} />
      <Label x="600" y="245" fill={INK} anchor="middle" size="14">
        Ponte
      </Label>

      {/* Tejo: stage on the river with a fan of crowd in front */}
      <path d="M260 390 A 110 110 0 0 1 480 390 Z" fill={ORANGE} opacity="0.88" />
      <rect x="250" y="378" width="240" height="22" rx="5" fill={ORANGE_DEEP} />
      <Label x="370" y="346" fill="#fff" anchor="middle" size="16">
        Tejo
      </Label>
      <text x="370" y="363" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.08em">
        MAIN STAGE
      </text>

      {/* Jardim: the garden */}
      <circle cx="600" cy="320" r="46" fill={CREAM} stroke={INK} strokeWidth="2.5" />
      <g fill={LILAC_DEEP}>
        <circle cx="574" cy="300" r="6" />
        <circle cx="630" cy="296" r="5" />
        <circle cx="636" cy="338" r="6" />
        <circle cx="568" cy="340" r="5" />
      </g>
      <Label x="600" y="325" fill={INK} anchor="middle" size="14">
        Jardim
      </Label>

      {/* gates */}
      <Gate x={34} y={255} dir="left" />
      <Label x="60" y="290" fill={INK} anchor="middle" size="11">
        West gate
      </Label>
      <Gate x={766} y={255} dir="right" />
      <Label x="740" y="290" fill={INK} anchor="middle" size="11">
        East gate
      </Label>
      <circle cx="400" cy="404" r="12" fill={ORANGE} stroke={CREAM} strokeWidth="3" />
      <rect x="330" y="420" width="140" height="22" rx="11" fill={INK} />
      <text x="400" y="435" textAnchor="middle" fontSize="11" fontWeight="800" fill={CREAM} letterSpacing="0.06em">
        SHUTTLE · RIVER GATE
      </text>

      {/* compass */}
      <g transform="translate(748 48)">
        <circle r="18" fill="none" stroke={INK} strokeWidth="2" />
        <path d="M0 -12 L5 4 L0 1 L-5 4 Z" fill={ORANGE} />
        <text y="27" textAnchor="middle" fontSize="10" fontWeight="800" fill={INK}>
          N
        </text>
      </g>
    </svg>
  );
}

function Label({ x, y, fill, anchor, size = 13, children }: { x: string | number; y: string | number; fill: string; anchor?: "middle" | "end"; size?: string | number; children: React.ReactNode }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight="800" fill={fill} letterSpacing="0.06em" style={{ textTransform: "uppercase" }}>
      {children}
    </text>
  );
}

function Gate({ x, y, dir }: { x: number; y: number; dir: "left" | "right" }) {
  const d = dir === "left" ? `M${x + 10} ${y - 12} L${x - 10} ${y} L${x + 10} ${y + 12}` : `M${x - 10} ${y - 12} L${x + 10} ${y} L${x - 10} ${y + 12}`;
  return <path d={d} fill="none" stroke={ORANGE} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />;
}
