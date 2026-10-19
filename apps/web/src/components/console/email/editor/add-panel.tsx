"use client";

// Add: everything that can go into the email, drawn in its own theme. A
// sub-nav on the left (Quick add, Made for you, Create your own) and one
// scrolling column of previews. Click adds after the selection; drag drops it
// where the line shows. "Generate a section" asks the agent for one.

import { ArrowUp, Columns2, LayoutPanelTop, MessagesSquare, Shapes } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { findBlock, findSection } from "@slice/backend/convex/emailDoc";
import type { BlockInput } from "@slice/backend/convex/emailPresets";
import type { EmailDoc } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditorEnv } from "./context";
import { sectionName } from "./model";
import { GroupLabel, PanelHeader } from "./panel-ui";
import { BLOCK_PRESETS, BlockPreview, LAYOUT_PRESETS, PresetCard, SECTION_GROUPS, SECTION_PRESETS, SectionPreview, addPreset, fillItems, usePreviewContext } from "./section-picker";

/** Single elements, grouped the way a merchant looks for them. */
const ELEMENT_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Text", ids: ["heading", "subheading", "paragraph"] },
  { label: "Image", ids: ["image"] },
  { label: "Button", ids: ["button", "button-outline"] },
  { label: "Dividers and space", ids: ["divider", "divider-short", "spacer"] },
  { label: "Items", ids: ["items"] },
  { label: "More", ids: ["quote", "coupon", "video", "social", "logo", "footer"] },
];

type NavId = "elements" | "layouts" | (typeof SECTION_GROUPS)[number]["group"] | "generate";

const NAV: { title: string; items: { id: NavId; label: string }[] }[] = [
  {
    title: "Quick add",
    items: [
      { id: "elements", label: "Single elements" },
      { id: "layouts", label: "Column layouts" },
    ],
  },
  { title: "Made for you", items: SECTION_GROUPS.map((g) => ({ id: g.group, label: g.label })) },
  { title: "Create your own", items: [{ id: "generate", label: "Generate a section" }] },
];

function Anchor({ id, children }: { id: NavId; children: ReactNode }) {
  return (
    <section data-add-group={id} className="scroll-mt-3 space-y-2.5">
      {children}
    </section>
  );
}

/** Ask the agent for a section in plain words. */
function GenerateSection() {
  const { agent, editor, setPanel } = useEditorEnv();
  const [text, setText] = useState("");
  const doc = editor.doc as EmailDoc;
  const sel = editor.selection;
  const after = sel?.kind === "section" ? findSection(doc, sel.id) : sel?.kind === "block" ? (() => {
    const f = findBlock(doc, sel.id);
    return f ? { section: f.section, index: doc.sections.indexOf(f.section) } : null;
  })() : null;
  const go = () => {
    const ask = text.trim();
    if (!ask || agent.busy) return;
    const where = after ? ` Put it after the "${sectionName(after.section, after.index)}" section.` : "";
    void agent.send(`Add a section: ${ask}.${where}`);
    setText("");
    setPanel("chat");
  };
  return (
    <div className="rounded-xl bg-neutral-50 p-3 ring-1 ring-black/[0.06]">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <MessagesSquare className="size-4 text-neutral-500" /> Describe a section
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
        }}
        placeholder="Three staff picks for readers who loved Normal People, with a line on each"
        className="min-h-20 resize-none bg-white text-sm"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{after ? `Goes after ${sectionName(after.section, after.index)}` : "Goes above the footer"}</p>
        <Button size="sm" onClick={go} disabled={!text.trim() || agent.busy} className="bg-neutral-900 text-white hover:bg-neutral-800">
          Generate <ArrowUp data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

export function AddPanel() {
  const { editor, items } = useEditorEnv();
  const { ctx, theme } = usePreviewContext();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<NavId>("elements");
  // Previews fill the column, whatever width the panel has.
  const [previewW, setPreviewW] = useState(260);
  const doc = editor.doc as EmailDoc;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPreviewW(Math.max(200, Math.floor(el.clientWidth - 32))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Follow the scroll: the group at the top of the column is the current one.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.getBoundingClientRect().top + 24;
      let current: NavId = "elements";
      for (const s of el.querySelectorAll<HTMLElement>("[data-add-group]")) if (s.getBoundingClientRect().top <= top) current = s.dataset.addGroup as NavId;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) current = "generate";
      setActive(current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const jump = (id: NavId) => {
    setActive(id);
    scroller.current?.querySelector(`[data-add-group="${id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const addBlock = (block: BlockInput) => addPreset(editor, doc, editor.selection, { block }, items);
  const addSection = (section: (typeof SECTION_PRESETS)[number]["section"]) => addPreset(editor, doc, editor.selection, { section }, items);
  const locked = editor.locked;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Add" subtitle={locked ? "Available when Slice has finished writing." : "Click to add after the selection, or drag into place."} />
      <div className={cn("flex min-h-0 flex-1 border-t", locked && "pointer-events-none opacity-50")}>
        <nav className="scrollbar-thin w-[8.5rem] shrink-0 space-y-4 overflow-y-auto border-r px-2 py-3">
          {NAV.map((g) => (
            <div key={g.title} className="space-y-0.5">
              <GroupLabel className="px-2 pb-1">{g.title}</GroupLabel>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => jump(it.id)}
                  className={cn("block w-full rounded-lg px-2 py-1.5 text-left text-[13px] leading-5 transition-colors", active === it.id ? "bg-neutral-900 font-medium text-white" : "text-neutral-700 hover:bg-neutral-100")}
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-4 py-3">
          <Anchor id="elements">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shapes className="size-4 text-neutral-500" /> Single elements
            </div>
            {ELEMENT_GROUPS.map((g) => (
              <div key={g.label} className="space-y-2">
                <GroupLabel>{g.label}</GroupLabel>
                {g.ids.map((id) => {
                  const p = BLOCK_PRESETS.find((x) => x.id === id);
                  if (!p) return null;
                  const block = fillItems(p.block, items);
                  return (
                    <PresetCard key={p.id} id={`block-${p.id}`} label={p.label} data={{ kind: "preset-block", label: p.label, block }} onAdd={() => addBlock(p.block)}>
                      <BlockPreview block={p.block} width={previewW} ctx={ctx} theme={theme} items={items} />
                    </PresetCard>
                  );
                })}
              </div>
            ))}
          </Anchor>
          <Anchor id="layouts">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Columns2 className="size-4 text-neutral-500" /> Column layouts
            </div>
            {LAYOUT_PRESETS.map((p) => (
              <div key={p.id} className="space-y-1.5">
                <PresetCard id={`layout-${p.id}`} label={p.label} data={{ kind: "preset-section", label: p.label, section: fillItems(p.section, items) }} onAdd={() => addSection(p.section)}>
                  <SectionPreview section={p.section} width={previewW} ctx={ctx} theme={theme} items={items} />
                </PresetCard>
                <p className="text-xs text-neutral-500">{p.label}</p>
              </div>
            ))}
          </Anchor>
          {SECTION_GROUPS.map((g) => {
            const list = SECTION_PRESETS.filter((p) => p.group === g.group);
            if (!list.length) return null;
            return (
              <Anchor key={g.group} id={g.group}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <LayoutPanelTop className="size-4 text-neutral-500" /> {g.label}
                </div>
                {list.map((p) => (
                  <div key={p.id} className="space-y-1.5">
                    <PresetCard id={`section-${p.id}`} label={p.label} data={{ kind: "preset-section", label: `${g.label}: ${p.label}`, section: fillItems(p.section, items) }} onAdd={() => addSection(p.section)}>
                      <SectionPreview section={p.section} width={previewW} ctx={ctx} theme={theme} items={items} />
                    </PresetCard>
                    <p className="text-xs text-neutral-500">{p.label}</p>
                  </div>
                ))}
              </Anchor>
            );
          })}
          <Anchor id="generate">
            <GroupLabel>Create your own</GroupLabel>
            <GenerateSection />
            <div className="h-[30vh]" aria-hidden />
          </Anchor>
        </div>
      </div>
    </div>
  );
}
