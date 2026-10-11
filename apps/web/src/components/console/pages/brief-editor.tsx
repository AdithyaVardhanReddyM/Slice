"use client";

import { Plus, Trash2 } from "lucide-react";
import type { BrandBrief, BrandItem } from "@/lib/pages/types";
import { Field, Input, Textarea } from "@/components/console/form";
import { FieldGroup, TokenInput } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function ItemRow({ item, onChange, onRemove }: { item: BrandItem; onChange: (i: BrandItem) => void; onRemove: () => void }) {
  return (
    <li className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[4rem_1fr_auto]">
      <Thumb src={item.image} className="size-16" />
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_7rem]">
        <Input value={item.name} aria-label="Item name" onChange={(e) => onChange({ ...item, name: e.target.value })} />
        <Input value={item.price ?? ""} placeholder="Price" aria-label="Price" onChange={(e) => onChange({ ...item, price: e.target.value || undefined })} />
        <Input value={item.kind} placeholder="Kind" aria-label="Kind" onChange={(e) => onChange({ ...item, kind: e.target.value })} />
        <Textarea
          rows={2}
          value={item.description}
          aria-label="Description"
          className="sm:col-span-3"
          onChange={(e) => onChange({ ...item, description: e.target.value })}
        />
        <Input value={item.image ?? ""} placeholder="Image URL" aria-label="Image URL" className="sm:col-span-2" onChange={(e) => onChange({ ...item, image: e.target.value || undefined })} />
        <Input value={item.url ?? ""} placeholder="Link" aria-label="Link" onChange={(e) => onChange({ ...item, url: e.target.value || undefined })} />
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </li>
  );
}

/** Edits the brand brief: what the business sells, its proof and its items. */
export function BriefEditor({ brief, onChange }: { brief: BrandBrief; onChange: (b: BrandBrief) => void }) {
  const set = <K extends keyof BrandBrief>(key: K, value: BrandBrief[K]) => onChange({ ...brief, [key]: value });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Brand brief</CardTitle>
          <CardDescription>What the intake understood about the business. Correct anything the site got across badly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Summary">
            <Textarea rows={4} value={brief.summary} onChange={(e) => set("summary", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Positioning">
              <Textarea rows={2} value={brief.positioning} onChange={(e) => set("positioning", e.target.value)} />
            </Field>
            <Field label="Who the site sells to">
              <Textarea rows={2} value={brief.audience} onChange={(e) => set("audience", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Categories">
              <TokenInput values={brief.categories} onChange={(v) => set("categories", v)} placeholder="Add a category" />
            </FieldGroup>
            <FieldGroup label="Calls to action on the site">
              <TokenInput values={brief.ctas} onChange={(v) => set("ctas", v)} placeholder="Add a CTA" />
            </FieldGroup>
            <FieldGroup label="Proof" hint="Press, numbers and guarantees as written on the site.">
              <TokenInput values={brief.proof} onChange={(v) => set("proof", v)} placeholder="Add a proof point" />
            </FieldGroup>
            <FieldGroup label="Locations">
              <TokenInput values={brief.locations} onChange={(v) => set("locations", v)} placeholder="Add a city or address" />
            </FieldGroup>
            <FieldGroup label="Comparable brands" hint="Well-known brands with the same customer. Qloo reads the brand through these when it is not a Qloo entity itself." className="sm:col-span-2">
              <TokenInput values={brief.comparableBrands ?? []} onChange={(v) => set("comparableBrands", v)} placeholder="Add a brand" />
            </FieldGroup>
            <FieldGroup label="Related brands" hint="Partners, suppliers and stockists mentioned on the site." className="sm:col-span-2">
              <TokenInput values={brief.relatedBrands} onChange={(v) => set("relatedBrands", v)} placeholder="Add a brand" />
            </FieldGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>
            {brief.items.length} product{brief.items.length === 1 ? "" : "s"}, rooms, plans or experiences the pages can feature.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-3">
            {brief.items.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                onChange={(it) => set("items", brief.items.map((x, j) => (j === i ? it : x)))}
                onRemove={() => set("items", brief.items.filter((_, j) => j !== i))}
              />
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("items", [
                ...brief.items,
                { id: `item-${Date.now().toString(36)}`, name: "New item", kind: "product", description: "", tags: [] },
              ])
            }
          >
            <Plus data-icon="inline-start" /> Add item
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
