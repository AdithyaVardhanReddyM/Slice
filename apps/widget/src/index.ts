// Loader skeleton: finds its <script data-slice-key>, mounts a launcher inside a
// shadow root (so host-page CSS can't leak in), and lazily iframes the concierge
// UI from apps/web. Host-page context, events and personalization come later.

const APP_URL = import.meta.env.VITE_SLICE_APP_URL ?? "http://localhost:3000";

const styles = `
  :host { all: initial; }
  .launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
    width: 56px; height: 56px; border: 0; border-radius: 9999px; cursor: pointer;
    background: #111; display: grid; place-items: center;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
  }
  .panel {
    position: fixed; right: 20px; bottom: 88px; z-index: 2147483647;
    width: min(400px, calc(100vw - 40px)); height: min(640px, calc(100vh - 120px));
    border: 0; border-radius: 16px; background: #fff;
    box-shadow: 0 16px 48px rgb(0 0 0 / 0.2);
  }
  .panel[hidden] { display: none; }
`;

const logo = `<svg viewBox="0 0 49 34" width="28" height="20" aria-hidden="true"><path d="M15.4992 0H36.5808L21.0816 22.9729H0L15.4992 0Z" fill="#FFE642"/><path d="M16.4224 25.102L10.4192 34H32.5008L48 11.0271H31.7024L22.2064 25.102H16.4224Z" fill="#FF7900"/></svg>`;

function boot() {
  if (document.getElementById("slice-root")) return;

  const script = document.querySelector<HTMLScriptElement>(
    "script[data-slice-key]",
  );
  const key = script?.dataset.sliceKey;
  if (!key) {
    console.warn("[slice] add data-slice-key to the slice.js script tag");
    return;
  }

  const host = document.createElement("div");
  host.id = "slice-root";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${styles}</style>
    <iframe class="panel" title="Slice concierge" hidden></iframe>
    <button class="launcher" type="button" aria-label="Open Slice concierge" aria-expanded="false">${logo}</button>
  `;

  const panel = shadow.querySelector("iframe")!;
  const launcher = shadow.querySelector("button")!;

  launcher.addEventListener("click", () => {
    if (!panel.src) {
      panel.src = `${APP_URL}/embed/concierge?key=${encodeURIComponent(key)}`;
    }
    panel.hidden = !panel.hidden;
    launcher.setAttribute("aria-expanded", String(!panel.hidden));
  });

  document.body.append(host);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
