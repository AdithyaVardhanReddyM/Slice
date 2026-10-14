"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { brandDomain, publicPageUrl } from "@/lib/pages/urls";
import { Field, Input } from "@/components/console/form";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { PageHeader } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrand } from "./brand-context";

export function BrandSettings() {
  const brand = useBrand();
  const router = useRouter();
  const rename = useMutation(api.pagesBrands.rename);
  const remove = useMutation(api.pagesBrands.remove);
  const [name, setName] = useState(brand.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      await rename({ id: brand._id, name: name.trim() });
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <PageHeader title="Settings" description="Name, address and the one irreversible action." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Name</CardTitle>
            <CardDescription>Shown in the console and as the default wordmark on pages without a logo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Brand name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={saveName} disabled={busy || !name.trim() || name.trim() === brand.name}>
              Save
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Domain</CardTitle>
            <CardDescription>The slug is fixed once pages are published, because it is part of every public link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="num">{brand.slug}</dd>
              <dt className="text-muted-foreground">Subdomain</dt>
              <dd className="num">{brandDomain(brand.slug)}</dd>
              <dt className="text-muted-foreground">Page address</dt>
              <dd className="num break-all">{publicPageUrl(brand.slug, "your-page")}</dd>
              <dt className="text-muted-foreground">Also at</dt>
              <dd className="num">/p/{brand.slug}/your-page on this app</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              Set NEXT_PUBLIC_PAGES_HOST to change the base host. In development it is pages.localhost:3000, served over http.
            </p>
          </CardContent>
        </Card>

        {brand.demo ? (
          <Card>
            <CardHeader>
              <CardTitle>Delete brand</CardTitle>
              <CardDescription>This is a demo brand. Demo brands come with every account and can&apos;t be deleted.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Delete brand</CardTitle>
              <CardDescription>Removes the brand with all its audiences, uploads, pages, versions and analytics. Published pages stop resolving at once.</CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <ConfirmDialog
                trigger={
                  <Button variant="destructive">
                    <Trash2 data-icon="inline-start" /> Delete {brand.name}
                  </Button>
                }
                title={`Delete ${brand.name}?`}
                description="This cannot be undone. Every page under this brand goes offline and its analytics are gone."
                actionLabel="Delete brand"
                confirmText={brand.slug}
                onConfirm={async () => {
                  await remove({ id: brand._id });
                  router.push("/dashboard/pages");
                }}
              />
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
