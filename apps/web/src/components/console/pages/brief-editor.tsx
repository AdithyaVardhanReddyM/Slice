"use client";

import { Package, Plus, Trash2 } from "lucide-react";
import type { BrandBrief, BrandItem } from "@/lib/pages/types";
import { Input, Textarea } from "@/components/console/form";
import { TokenInput } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { EditorField, EditorSection } from "./editor-layout";
import { Thumb } from "./shared";

export const EMPTY_BRIEF: BrandBrief = {
  summary: "",
  categories: [],
  positioning: "",
  audience: "",
  proof: [],
  ctas: [],
  locations: [],
  items: [],
  relatedBrands: [],
  comparableBrands: [],
};

type BriefProps = { brief: BrandBrief; onChange: (b: BrandBrief) => void };

/** What the business is, sells and can prove. */
export function BriefFieldsEditor({ brief, onChange }: BriefProps) {
  const set = <K extends keyof BrandBrief>(key: K, value: BrandBrief[K]) => onChange({ ...brief, [key]: value });
  return (
    <div>
      <EditorSection title="Overview" description="What the intake understood about the business. Correct anything the site got across badly.">
        <EditorField label="Summary">
          <Textarea rows={4} value={brief.summary} onChange={(e) => set("summary", e.target.value)} />
        </EditorField>
        <div className="grid gap-4 sm:grid-cols-2">
          <EditorField label="Positioning">
            <Textarea rows={3} value={brief.positioning} onChange={(e) => set("positioning", e.target.value)} />
          </EditorField>
          <EditorField label="Who the site sells to">
            <Textarea rows={3} value={brief.audience} onChange={(e) => set("audience", e.target.value)} />
          </EditorField>
        </div>
      </EditorSection>

      <EditorSection title="Offer" description="What the brand sells and the actions its site asks for.">
        <EditorField label="Categories">
          <TokenInput values={brief.categories} onChange={(v) => set("categories", v)} placeholder="Add a category" />
        </EditorField>
        <EditorField label="Calls to action" hint="Button labels as they appear on the site.">
          <TokenInput values={brief.ctas} onChange={(v) => set("ctas", v)} placeholder="Add a call to action" />
        </EditorField>
      </EditorSection>

      <EditorSection title="Proof and places" description="Facts the builder may quote, and where the brand operates.">
        <EditorField label="Proof" hint="Press, numbers and guarantees exactly as written on the site.">
          <TokenInput values={brief.proof} onChange={(v) => set("proof", v)} placeholder="Add a proof point" />
        </EditorField>
        <EditorField label="Locations">
          <TokenInput values={brief.locations} onChange={(v) => set("locations", v)} placeholder="Add a city or address" />
        </EditorField>
      </EditorSection>

      <EditorSection title="Brands" description="How Qloo places the brand. Comparable brands stand in when the brand is not a Qloo entity itself.">
        <EditorField label="Comparable brands" hint="Well-known brands with the same customer.">
          <TokenInput values={brief.comparableBrands ?? []} onChange={(v) => set("comparableBrands", v)} placeholder="Add a brand" />
        </EditorField>
        <EditorField label="Related brands" hint="Partners, suppliers and stockists mentioned on the site.">
          <TokenInput values={brief.relatedBrands} onChange={(v) => set("relatedBrands", v)} placeholder="Add a brand" />
        </EditorField>
      </EditorSection>
    </div>
  );
}

function ItemCard({ item, onChange, onRemove }: { item: BrandItem; onChange: (i: BrandItem) => void; onRemove: () => void }) {
  return (
    <li className="flex gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <Thumb src={item.image} className="size-20" rounded="rounded-lg" />
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
        <EditorField label="Name">
          <Input value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} />
        </EditorField>
        <EditorField label="Kind">
          <Input value={item.kind} placeholder="product" onChange={(e) => onChange({ ...item, kind: e.target.value })} />
        </EditorField>
        <EditorField label="Price">
          <Input value={item.price ?? ""} placeholder="None" onChange={(e) => onChange({ ...item, price: e.target.value || undefined })} />
        </EditorField>
        <EditorField label="Description" className="sm:col-span-3">
          <Textarea rows={2} value={item.description} onChange={(e) => onChange({ ...item, description: e.target.value })} />
        </EditorField>
        <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
          <EditorField label="Image URL">
            <Input value={item.image ?? ""} placeholder="https://…" onChange={(e) => onChange({ ...item, image: e.target.value || undefined })} />
          </EditorField>
          <EditorField label="Link">
            <Input value={item.url ?? ""} placeholder="https://…" onChange={(e) => onChange({ ...item, url: e.target.value || undefined })} />
          </EditorField>
        </div>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" className="-mt-1 -mr-1 text-muted-foreground" aria-label={`Remove ${item.name}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </li>
  );
}

/** Products, rooms, plans or experiences the pages can feature. */
export function BriefItemsEditor({ brief, onChange }: BriefProps) {
  const setItems = (items: BrandItem[]) => onChange({ ...brief, items });
  const add = () => setItems([...brief.items, { id: `item-${Date.now().toString(36)}`, name: "New item", kind: "product", description: "", tags: [] }]);
  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">
            {brief.items.length} item{brief.items.length === 1 ? "" : "s"}
          </h2>
          <p className="text-sm text-muted-foreground">Products, rooms, plans or experiences the pages can feature. The builder picks from these per audience.</p>
        </div>
        <Button type="button" variant="outline" onClick={add}>
          <Plus data-icon="inline-start" /> Add item
        </Button>
      </div>
      {brief.items.length ? (
        <ul className="space-y-3">
          {brief.items.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              onChange={(it) => setItems(brief.items.map((x, j) => (j === i ? it : x)))}
              onRemove={() => setItems(brief.items.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
          <Package className="size-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No items yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">The intake found nothing to feature. Add what the pages should be able to show.</p>
        </div>
      )}
    </div>
  );
}
