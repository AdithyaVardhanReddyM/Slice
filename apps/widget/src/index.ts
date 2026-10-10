// slice.js: the script merchants paste. Mounts a launcher in a shadow root (so
// host-page CSS can't leak in), iframes the concierge UI from apps/web, and
// bridges what only the host page knows: which page the shopper is on, the
// product they're looking at, and the shopper's profile and transcript, which
// live in the host page's storage because third-party iframe storage is
// partitioned per site.

const APP_URL = import.meta.env.VITE_SLICE_APP_URL ?? "http://localhost:3000";

type PageContext = {
  url: string;
  path: string;
  title: string;
  product: { id?: string; sku?: string; name?: string; brand?: string; price?: number; url?: string } | null;
  category?: string;
  query?: string;
};

const styles = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
    height: 52px; padding: 0 18px 0 14px; border: 0; border-radius: 999px; cursor: pointer;
    background: #141414; color: #fff; display: flex; align-items: center; gap: 10px;
    font: 500 14px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.22);
    transition: transform .2s ease, box-shadow .2s ease, opacity .15s ease, visibility 0s;
  }
  .launcher:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgb(0 0 0 / 0.26); }
  /* The open panel takes the launcher's spot; the panel's own header closes it. */
  .launcher[aria-expanded="true"] {
    opacity: 0; transform: scale(.85); visibility: hidden; pointer-events: none;
    transition: transform .15s ease, opacity .15s ease, visibility 0s .15s;
  }
  .teaser {
    position: fixed; right: 20px; bottom: 84px; z-index: 2147483646;
    max-width: 280px; padding: 12px 14px; border-radius: 14px; background: #fff; color: #141414;
    font: 400 13.5px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.16); border: 1px solid rgb(0 0 0 / 0.06);
    cursor: pointer; opacity: 0; transform: translateY(6px); transition: opacity .3s ease, transform .3s ease;
  }
  .teaser.show { opacity: 1; transform: none; }
  .teaser[hidden] { display: none; }
  .teaser strong { display: block; font-weight: 600; margin-bottom: 2px; }
  .teaser .x { position: absolute; top: 6px; right: 8px; border: 0; background: none; cursor: pointer; color: #888; font-size: 14px; }
  .panel {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    width: min(440px, calc(100vw - 32px));
    height: min(900px, calc(100vh - 32px));
    height: min(900px, calc(100dvh - 32px));
    border: 0; border-radius: 22px; background: #fff;
    box-shadow: 0 24px 64px rgb(0 0 0 / 0.24), 0 0 0 1px rgb(0 0 0 / 0.06);
    transform-origin: bottom right;
    opacity: 1; transform: none; transition: opacity .2s ease, transform .25s cubic-bezier(.22, 1, .36, 1);
  }
  .panel[hidden] { display: block; opacity: 0; transform: translateY(12px) scale(.96); pointer-events: none; }
  @media (max-width: 640px) {
    .panel { right: 0; bottom: 0; width: 100vw; height: 100dvh; border-radius: 0; }
  }
`;

const logo = `<svg viewBox="0 0 49 34" width="24" height="17" aria-hidden="true"><path d="M15.4992 0H36.5808L21.0816 22.9729H0L15.4992 0Z" fill="#FFE642"/><path d="M16.4224 25.102L10.4192 34H32.5008L48 11.0271H31.7024L22.2064 25.102H16.4224Z" fill="#FF7900"/></svg>`;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** What the host page says about itself: JSON-LD first (Shopify, Woo and most themes emit it), then meta tags. */
function readPage(): PageContext {
  const ctx: PageContext = {
    url: location.href,
    path: location.pathname,
    title: document.title,
    product: null,
  };
  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent ?? "null");
      const nodes: unknown[] = Array.isArray(data) ? data : data?.["@graph"] ? data["@graph"] : [data];
      for (const node of nodes as Record<string, unknown>[]) {
        if (!node || typeof node !== "object") continue;
        const type = node["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (types.includes("Product")) {
          const offers = (Array.isArray(node.offers) ? node.offers[0] : node.offers) as Record<string, unknown> | undefined;
          const brand = node.brand as Record<string, unknown> | string | undefined;
          ctx.product = {
            id: (node.productID as string) ?? (node.sku as string),
            sku: node.sku as string,
            name: node.name as string,
            brand: typeof brand === "string" ? brand : (brand?.name as string | undefined),
            price: offers?.price !== undefined ? Number(offers.price) : undefined,
            url: (node.url as string) ?? location.href,
          };
        }
        if (types.includes("BreadcrumbList") && !ctx.category) {
          const items = (node.itemListElement as Record<string, unknown>[] | undefined) ?? [];
          const last = items[items.length - 1];
          if (last && typeof last.name === "string" && !ctx.product) ctx.category = last.name;
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  const meta = (name: string) =>
    document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? undefined;
  ctx.category ??= meta("slice:category");
  const q = new URLSearchParams(location.search).get("q");
  if (q) ctx.query = q;
  return ctx;
}

function boot() {
  if (document.getElementById("slice-root")) return;

  const script = document.querySelector<HTMLScriptElement>("script[data-slice-key]");
  const key = script?.dataset.sliceKey;
  if (!key) {
    console.warn("[slice] add data-slice-key to the slice.js script tag");
    return;
  }

  const storage = {
    profile: `slice:${key}:profile`,
    session: `slice:${key}:session`,
    transcript: `slice:${key}:transcript`,
    open: `slice:${key}:open`,
    teased: `slice:${key}:teased`,
  };
  const get = (k: string, store: Storage = localStorage) => {
    try {
      return store.getItem(k);
    } catch {
      return null;
    }
  };
  const set = (k: string, v: string | null, store: Storage = localStorage) => {
    try {
      if (v === null) store.removeItem(k);
      else store.setItem(k, v);
    } catch {
      /* private mode */
    }
  };

  let sessionId = get(storage.session, sessionStorage);
  if (!sessionId) {
    sessionId = uid();
    set(storage.session, sessionId, sessionStorage);
  }

  const host = document.createElement("div");
  host.id = "slice-root";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${styles}</style>
    <iframe class="panel" title="Slice concierge" hidden allow="clipboard-write"></iframe>
    <div class="teaser" hidden role="button" tabindex="0">
      <button class="x" type="button" aria-label="Dismiss">×</button>
      <strong>Can't decide?</strong>
      <span>Tell me three things you love and I'll pick what matches your taste.</span>
    </div>
    <button class="launcher" type="button" aria-label="Open Slice concierge" aria-expanded="false">
      ${logo}<span class="label">Shop by taste</span>
    </button>
  `;

  const panel = shadow.querySelector<HTMLIFrameElement>("iframe")!;
  const launcher = shadow.querySelector<HTMLButtonElement>(".launcher")!;
  const teaser = shadow.querySelector<HTMLDivElement>(".teaser")!;
  const embedOrigin = new URL(APP_URL).origin;

  const sendContext = () => {
    let messages: unknown[] = [];
    try {
      messages = JSON.parse(get(storage.transcript, sessionStorage) ?? "[]");
    } catch {
      messages = [];
    }
    panel.contentWindow?.postMessage(
      {
        type: "slice:context",
        key,
        sessionId,
        profileId: get(storage.profile),
        page: readPage(),
        messages,
        mobile: window.matchMedia("(max-width: 640px)").matches,
      },
      embedOrigin,
    );
  };

  const hideTeaser = () => {
    teaser.classList.remove("show");
    teaser.hidden = true;
  };

  const setOpen = (open: boolean) => {
    if (open && !panel.src) {
      panel.src = `${APP_URL}/embed/concierge?key=${encodeURIComponent(key)}`;
    }
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    set(storage.open, open ? "1" : null, sessionStorage);
    if (open) hideTeaser();
  };

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  teaser.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).classList.contains("x")) {
      hideTeaser();
      set(storage.teased, "1");
      return;
    }
    setOpen(true);
  });

  window.addEventListener("message", (ev: MessageEvent) => {
    if (ev.origin !== embedOrigin || ev.source !== panel.contentWindow) return;
    const msg = ev.data as { type?: string } & Record<string, unknown>;
    switch (msg?.type) {
      case "slice:ready":
        sendContext();
        break;
      case "slice:state":
        set(storage.profile, (msg.profileId as string | null) ?? null);
        set(storage.transcript, JSON.stringify((msg.messages as unknown[]) ?? []).slice(0, 400_000), sessionStorage);
        break;
      case "slice:navigate":
        if (typeof msg.url === "string") location.href = msg.url;
        break;
      case "slice:close":
        setOpen(false);
        launcher.focus({ preventScroll: true });
        break;
    }
  });

  document.body.append(host);

  // Stay open across page loads within the session; otherwise nudge once.
  if (get(storage.open, sessionStorage) === "1") {
    setOpen(true);
  } else if (!get(storage.teased) && !get(storage.profile)) {
    setTimeout(() => {
      if (!panel.hidden) return;
      teaser.hidden = false;
      requestAnimationFrame(() => teaser.classList.add("show"));
      setTimeout(hideTeaser, 14000);
    }, 6000);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
