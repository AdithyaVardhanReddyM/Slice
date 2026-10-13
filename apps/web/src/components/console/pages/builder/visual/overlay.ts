// The visual editor's layer over the canvas page: a hover outline, the
// selection box with its name and a small toolbar, the padding and margin of
// the selected element, and its size. Lives in a shadow root on the canvas
// document's <html> (outside the page body, so it is never saved) and follows
// the elements every frame, which keeps it right through scrolling, loading
// images and animations.

export type OverlayAction = "parent" | "up" | "down" | "duplicate" | "remove" | "text";

const BLUE = "#2563eb";

const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; font: 500 11px/1 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
.box { position: absolute; box-sizing: border-box; display: none; }
.hover { border: 1px solid ${BLUE}; }
.sel { border: 1.5px solid ${BLUE}; }
.sel.editing { border-style: dashed; }
.pad, .mar { position: absolute; display: none; }
.pad { background: rgba(34, 197, 94, 0.16); }
.mar { background: rgba(249, 115, 22, 0.14); }
.chip { position: absolute; display: none; align-items: center; height: 20px; padding: 0 7px; border-radius: 5px; white-space: nowrap;
  background: ${BLUE}; color: #fff; letter-spacing: 0; box-shadow: 0 1px 2px rgba(0,0,0,.18); max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.chip.ghost { background: rgba(37, 99, 235, 0.9); }
.size { position: absolute; display: none; height: 18px; padding: 0 6px; border-radius: 4px; background: rgba(17,17,17,.82); color: #fff;
  font-variant-numeric: tabular-nums; align-items: center; white-space: nowrap; }
.bar { position: absolute; display: none; align-items: center; gap: 1px; padding: 2px; border-radius: 7px; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.08); pointer-events: auto; }
.bar button { all: unset; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 22px; border-radius: 5px; color: #3f3f46; cursor: pointer; }
.bar button:hover { background: #f4f4f5; color: #09090b; }
.bar button[disabled] { opacity: .35; pointer-events: none; }
.bar button.danger:hover { background: #fef2f2; color: #dc2626; }
.bar svg { width: 14px; height: 14px; }
.bar .sep { width: 1px; height: 14px; background: #e4e4e7; margin: 0 2px; }
`;

const ICON: Record<OverlayAction, string> = {
  parent: '<polyline points="14 9 9 4 4 9"/><path d="M20 20h-7a4 4 0 0 1-4-4V4"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  duplicate: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  remove: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
};

const TITLE: Record<OverlayAction, string> = {
  parent: "Select the parent (Esc)",
  up: "Move up (Alt ↑)",
  down: "Move down (Alt ↓)",
  duplicate: "Duplicate (⌘D)",
  remove: "Delete (⌫)",
  text: "Edit the text (Enter)",
};

export interface SelectionInfo {
  label: string;
  editing: boolean;
  textual: boolean;
  canUp: boolean;
  canDown: boolean;
  canParent: boolean;
}

export class EditOverlay {
  readonly host: HTMLElement;
  private hoverEl: Element | null = null;
  private hoverLabel = "";
  private selEl: Element | null = null;
  private info: SelectionInfo | null = null;
  private showSpacing = false;
  private raf = 0;
  private parts: Record<string, HTMLElement> = {};
  private buttons: Partial<Record<OverlayAction, HTMLButtonElement>> = {};
  private win: Window;

  constructor(
    private doc: Document,
    onAction: (a: OverlayAction) => void,
  ) {
    this.win = doc.defaultView as Window;
    this.host = doc.createElement("slice-edit-layer");
    doc.documentElement.appendChild(this.host);
    const root = this.host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = CSS;
    const layer = doc.createElement("div");
    layer.className = "layer";
    root.append(style, layer);
    const make = (cls: string) => {
      const el = doc.createElement("div");
      el.className = cls;
      layer.appendChild(el);
      return el;
    };
    for (const side of ["t", "r", "b", "l"]) {
      this.parts[`mar-${side}`] = make("mar");
      this.parts[`pad-${side}`] = make("pad");
    }
    this.parts.hover = make("box hover");
    this.parts.hoverChip = make("chip ghost");
    this.parts.sel = make("box sel");
    this.parts.chip = make("chip");
    this.parts.size = make("size");
    const bar = make("bar");
    this.parts.bar = bar;
    const actions: (OverlayAction | "|")[] = ["text", "|", "parent", "up", "down", "|", "duplicate", "remove"];
    for (const a of actions) {
      if (a === "|") {
        const sep = doc.createElement("span");
        sep.className = "sep";
        bar.appendChild(sep);
        continue;
      }
      const b = doc.createElement("button");
      b.type = "button";
      b.title = TITLE[a];
      b.setAttribute("aria-label", TITLE[a]);
      if (a === "remove") b.className = "danger";
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[a]}</svg>`;
      b.addEventListener("pointerdown", (e) => e.preventDefault());
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction(a);
      });
      bar.appendChild(b);
      this.buttons[a] = b;
    }
    this.raf = this.win.requestAnimationFrame(this.frame);
  }

  /** Did this event start on the overlay (its toolbar)? */
  owns(e: Event) {
    return e.composedPath().includes(this.host);
  }

  setHover(el: Element | null, label = "") {
    this.hoverEl = el;
    this.hoverLabel = label;
  }

  setSelection(el: Element | null, info: SelectionInfo | null) {
    this.selEl = el;
    this.info = info;
    if (info) {
      this.buttons.text!.style.display = info.textual && !info.editing ? "" : "none";
      this.buttons.up!.disabled = !info.canUp;
      this.buttons.down!.disabled = !info.canDown;
      this.buttons.parent!.disabled = !info.canParent;
    }
  }

  setSpacing(show: boolean) {
    this.showSpacing = show;
  }

  destroy() {
    this.win.cancelAnimationFrame(this.raf);
    this.host.remove();
  }

  private place(el: HTMLElement, x: number, y: number, w?: number, h?: number) {
    el.style.display = el.classList.contains("chip") || el.classList.contains("bar") || el.classList.contains("size") ? "inline-flex" : "block";
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    if (w !== undefined) el.style.width = `${Math.max(0, Math.round(w))}px`;
    if (h !== undefined) el.style.height = `${Math.max(0, Math.round(h))}px`;
  }

  private hide(...names: string[]) {
    for (const n of names) this.parts[n].style.display = "none";
  }

  private frame = () => {
    this.raf = this.win.requestAnimationFrame(this.frame);
    const vw = this.win.innerWidth;
    const p = this.parts;
    const sel = this.selEl?.isConnected ? this.selEl : null;
    const hover = this.hoverEl?.isConnected && this.hoverEl !== sel ? this.hoverEl : null;

    if (hover) {
      const r = hover.getBoundingClientRect();
      this.place(p.hover, r.left, r.top, r.width, r.height);
      if (this.hoverLabel) {
        p.hoverChip.textContent = this.hoverLabel;
        this.place(p.hoverChip, Math.max(2, r.left), r.top > 24 ? r.top - 22 : r.top + 2);
      } else this.hide("hoverChip");
    } else this.hide("hover", "hoverChip");

    if (!sel || !this.info) {
      this.hide("sel", "chip", "bar", "size", ...["t", "r", "b", "l"].flatMap((s) => [`mar-${s}`, `pad-${s}`]));
      return;
    }
    const r = sel.getBoundingClientRect();
    this.place(p.sel, r.left, r.top, r.width, r.height);
    p.sel.classList.toggle("editing", this.info.editing);
    p.chip.textContent = this.info.editing ? "Editing text · Enter to finish" : this.info.label;
    const above = r.top > 26;
    const chipY = above ? r.top - 24 : Math.min(r.bottom + 4, this.win.innerHeight - 24);
    this.place(p.chip, Math.max(2, r.left), chipY);
    // The toolbar sits on the right of the same line, inside the viewport.
    const bar = p.bar;
    bar.style.display = this.info.editing ? "none" : "inline-flex";
    if (!this.info.editing) {
      const bw = bar.offsetWidth || 180;
      this.place(bar, Math.min(Math.max(2, r.right - bw), vw - bw - 4), above ? r.top - 30 : chipY);
    }
    p.size.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
    if (r.height > 40 && r.width > 80) this.place(p.size, r.left + r.width / 2 - (p.size.offsetWidth || 60) / 2, r.bottom - 22);
    else this.hide("size");

    if (this.showSpacing && !this.info.editing) {
      const cs = this.win.getComputedStyle(sel);
      const n = (v: string) => parseFloat(v) || 0;
      const [mt, mr, mb, ml] = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].map(n);
      const [pt, pr, pb, pl] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(n);
      this.place(p["mar-t"], r.left - ml, r.top - mt, r.width + ml + mr, mt);
      this.place(p["mar-b"], r.left - ml, r.bottom, r.width + ml + mr, mb);
      this.place(p["mar-l"], r.left - ml, r.top, ml, r.height);
      this.place(p["mar-r"], r.right, r.top, mr, r.height);
      this.place(p["pad-t"], r.left, r.top, r.width, pt);
      this.place(p["pad-b"], r.left, r.bottom - pb, r.width, pb);
      this.place(p["pad-l"], r.left, r.top + pt, pl, r.height - pt - pb);
      this.place(p["pad-r"], r.right - pr, r.top + pt, pr, r.height - pt - pb);
    } else this.hide(...["t", "r", "b", "l"].flatMap((s) => [`mar-${s}`, `pad-${s}`]));
  };
}
