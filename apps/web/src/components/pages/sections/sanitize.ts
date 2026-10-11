// Sanitiser for the `custom` section. Runs on the server (no DOM), so it is
// regex based and deliberately conservative: anything that can run script is
// removed, everything else passes through.

const DROP_WITH_CONTENT = ["script", "iframe", "object", "embed", "style", "noscript", "template", "svg", "math"];
const DROP_TAG_ONLY = ["link", "meta", "base", "form", "input", "button", "textarea", "select", "frame", "frameset", "applet"];

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  let html = input;

  // Comments and CDATA can hide markup from naive parsers.
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }
  for (const tag of DROP_TAG_ONLY) {
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  // Attributes: remove event handlers and script-bearing URLs inside any remaining tag.
  html = html.replace(/<([a-z][\w:-]*)([^>]*)>/gi, (_m, name: string, attrs: string) => {
    let a = attrs;
    a = a.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    a = a.replace(
      /\s+(href|src|xlink:href|action|formaction|poster|background|data|srcset)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
      (full: string, attr: string, value: string) => {
        const v = value.replace(/^["']|["']$/g, "").replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
        if (v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("data:text/html") || v.startsWith("data:application")) {
          return "";
        }
        void attr;
        return full;
      },
    );
    // `style` with url(javascript:) or expression().
    a = a.replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, (full: string, value: string) =>
      /javascript:|expression\s*\(|behavior\s*:/i.test(value) ? "" : full,
    );
    return `<${name}${a}>`;
  });

  return html;
}
