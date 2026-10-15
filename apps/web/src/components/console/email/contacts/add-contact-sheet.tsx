"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { AGE_LABEL } from "@/lib/pages/types";
import { Field, Input, Select } from "@/components/console/form";
import { FieldGroup, Spinner } from "@/components/console/setup/atoms";
import { InterestPicker, type PickedEntity } from "@/components/console/pages/interest-picker";
import { errorText } from "@/lib/email/labels";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEW_LIST = "new";

/**
 * One contact by hand. Interests are picked from Qloo (real authors, films,
 * artists) so the profile starts from things Qloo knows. With no list chosen
 * the backend files them under an "Added by hand" list kept one by one.
 */
export function AddContactSheet({
  open,
  onOpenChange,
  defaultListId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultListId?: Id<"emailLists">;
}) {
  const brand = useEmailBrand();
  const lists = useQuery(api.emailLists.list, open ? { brandId: brand._id } : "skip");
  const add = useMutation(api.emailContacts.add);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [interests, setInterests] = useState<PickedEntity[]>([]);
  const [listId, setListId] = useState<string>(defaultListId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the hand-added list when there is one, so people added by hand stay together.
  const byHand = lists?.find((l) => l.source === "manual");
  const target = listId || byHand?._id || NEW_LIST;
  const validEmail = EMAIL_RE.test(email.trim());

  function reset() {
    setEmail("");
    setName("");
    setCity("");
    setAge("");
    setGender("");
    setInterests([]);
    setListId(defaultListId ?? "");
    setError(null);
  }

  async function submit() {
    if (!validEmail || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await add({
        brandId: brand._id,
        ...(target !== NEW_LIST ? { listId: target as Id<"emailLists"> } : {}),
        email: email.trim().toLowerCase(),
        name: name.trim(),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(age ? { age } : {}),
        ...(gender ? { gender } : {}),
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
          <SheetDescription>Their taste profile is read from what they like, so a campaign can write to them as a person.</SheetDescription>
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
          <div className="grid gap-4 sm:grid-cols-3">
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
          <FieldGroup label="What they like" hint="Authors, books, films, artists, places. The more you add, the more personal their emails get." aside={interests.length ? `${interests.length} picked` : undefined}>
            <InterestPicker value={interests} onChange={setInterests} autoFocus={false} placeholder="Search authors, books, films, artists…" />
          </FieldGroup>
          <Field label="Add to">
            <Select value={target} onChange={(e) => setListId(e.target.value)} disabled={lists === undefined}>
              {!byHand && <option value={NEW_LIST}>A new list: Added by hand</option>}
              {(lists ?? []).map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name} · {l.mode === "groups" ? "joins the nearest taste group" : "kept one by one"}
                </option>
              ))}
            </Select>
          </Field>

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
