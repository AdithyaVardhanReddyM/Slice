"use client";

import { Fingerprint } from "lucide-react";
import type { Brand, ProfileTag } from "@/lib/pages/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemographicsBars, TagsByGroup } from "./profile-view";
import { EntityStrip, Hint, SectionLabel } from "./shared";

/** "What Qloo knows": the brand's own entity or its proxies, tags, similar brands, demographics. */
export function QlooCard({ brand, compact }: { brand: Brand; compact?: boolean }) {
  const q = brand.qloo;
  const pending = brand.status === "extracting" && !q;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-muted-foreground" />
          <CardTitle>What Qloo knows</CardTitle>
        </div>
        <CardDescription>
          {pending
            ? "Waiting for the brand lookup."
            : !q
              ? "No Qloo read yet. It runs after the brief is written."
              : q.matched
                ? `Qloo knows ${q.entityName ?? brand.name} directly. Tags, brands and demographics below come from its own entity.`
                : q.proxies.length
                  ? `Qloo has no entity for ${brand.name}, so the read uses ${q.proxies.length} related brand${q.proxies.length === 1 ? "" : "s"} as proxies.`
                  : `Qloo has no entity for ${brand.name} and no related brands to use as proxies.`}
        </CardDescription>
      </CardHeader>
      {q && (
        <CardContent className="space-y-5">
          {!q.matched && q.proxies.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Proxies</SectionLabel>
              <EntityStrip items={q.proxies} />
            </div>
          )}
          <div className="space-y-2">
            <SectionLabel>Taste tags</SectionLabel>
            <TagsByGroup tags={q.tags as ProfileTag[]} perGroup={compact ? 5 : 8} />
          </div>
          <div className={compact ? "space-y-5" : "grid gap-5 lg:grid-cols-2"}>
            <div className="space-y-2">
              <SectionLabel>Similar brands</SectionLabel>
              {q.similarBrands.length ? <EntityStrip items={q.similarBrands} max={10} /> : <Hint>None returned.</Hint>}
            </div>
            <div className="space-y-2">
              <SectionLabel>Demographics</SectionLabel>
              <DemographicsBars demographics={q.demographics ?? null} />
              <Hint>Skew against the Qloo baseline. Right of centre means over-indexed.</Hint>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
