"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Boxes, UsersRound } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { AGE_LABEL } from "@/lib/pages/types";
import { Field, Input, Select } from "@/components/console/form";
import { ChoiceCard, ChoiceCardGroup, FieldGroup, Spinner } from "@/components/console/setup/atoms";
import { InterestPicker, type PickedEntity } from "@/components/console/pages/interest-picker";
import { errorText } from "@/lib/email/labels";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { PurchasePicker } from "./purchase-picker";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Keep = "group" | "individual";

/**
 * One contact by hand. Interests are picked from Qloo (real authors, films,
 * artists) so their taste starts from things Qloo knows. They join the taste
 * group closest to it (or start a new one), or become an individual contact.
 */
export function AddContactSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const brand = useEmailBrand();
  const audiences = useQuery(api.emailAudiences.list, open ? { brandId: brand._id } : "skip");
  const add = useMutation(api.emailContacts.add);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [purchases, setPurchases] = useState<string[]>([]);
  const [interests, setInterests] = useState<PickedEntity[]>([]);
  const [chosen, setChosen] = useState<Keep | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Into a taste group when the brand has some; the first contacts start as individuals.
  const hasGroups = (audiences ?? []).some((a) => a.kind === "group");
  const keep: Keep = chosen ?? (hasGroups ? "group" : "individual");
  const validEmail = EMAIL_RE.test(email.trim());

  function reset() {
    setEmail("");
    setName("");
    setNeighborhood("");
    setCity("");
    setAge("");
    setGender("");
    setPurchases([]);
    setInterests([]);
    setChosen(null);
    setError(null);
  }

  async function submit() {
    if (!validEmail || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await add({
        brandId: brand._id,
        keep,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        ...(neighborhood.trim() ? { neighborhood: neighborhood.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(age ? { age } : {}),
        ...(gender ? { gender } : {}),
        ...(purchases.length ? { purchases } : {}),
        ...(interests.length ? { interests: interests.map((i) => i.name) } : {}),
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader className="gap-1.5 border-b p-6">
          <SheetTitle>Add a contact</SheetTitle>
          <SheetDescription>Qloo reads their taste from what they bought, and what they like if you know it, so campaigns can follow it.</SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col gap-5 px-6 pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maya@example.com" autoFocus required />
            </Field>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya Okafor" required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Neighbourhood" optional>
              <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Park Slope" />
            </Field>
            <Field label="City" optional>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Brooklyn" />
            </Field>
            <Field label="Age" optional>
              <Select value={age} onChange={(e) => setAge(e.target.value)}>
                <option value="">Not given</option>
                {Object.entries(AGE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Gender" optional>
              <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Not given</option>
                <option value="female">Woman</option>
                <option value="male">Man</option>
              </Select>
            </Field>
          </div>
          <FieldGroup
            label="What they bought or booked"
            hint="Their recent orders or bookings, newest first. Items from your catalog count as those items; anything else is read by Qloo."
            aside={purchases.length ? `${purchases.length} added` : undefined}
          >
            <PurchasePicker value={purchases} onChange={setPurchases} />
          </FieldGroup>
          <FieldGroup label="What they like" hint="Only if you know it: favourite authors, artists, films, places." aside={interests.length ? `${interests.length} picked` : "Optional"}>
            <InterestPicker value={interests} onChange={setInterests} autoFocus={false} placeholder="Search authors, books, films, artists…" />
          </FieldGroup>
          <FieldGroup label="Add them as">
            <ChoiceCardGroup value={keep} onValueChange={(v) => setChosen(v as Keep)} className="sm:grid-cols-2" aria-label="Add them as">
              <ChoiceCard
                value="group"
                icon={<Boxes className="size-4" />}
                title="Part of a taste group"
                description={
                  hasGroups
                    ? "They join the group closest to their taste, or start a new one if none fits."
                    : "They start your first taste group. People with similar taste join it later."
                }
              />
              <ChoiceCard
                value="individual"
                icon={<UsersRound className="size-4" />}
                title="Individual contact"
                description="Their own taste profile. Tick them on a campaign and they get a version written for them."
              />
            </ChoiceCardGroup>
          </FieldGroup>

          <div className="sticky bottom-0 -mx-6 mt-auto flex items-center justify-between gap-4 border-t bg-popover px-6 py-4">
            <p className="text-xs text-muted-foreground">
              {error ? <span className="text-destructive">{error}</span> : "Qloo reads their taste in about 15 seconds."}
            </p>
            <Button type="submit" disabled={busy || !validEmail || !name.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              Add contact
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
