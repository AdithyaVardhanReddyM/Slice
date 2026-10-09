// Color helpers for the shopper widget theme (accent contrast).

/** WCAG relative-luminance contrast between two hex colors. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(full.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Readable text color (white or near-black) for a filled accent. */
export function onAccent(hex: string) {
  return contrast(hex, "#ffffff") >= contrast(hex, "#17150f")
    ? "#ffffff"
    : "#17150f";
}

export const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
