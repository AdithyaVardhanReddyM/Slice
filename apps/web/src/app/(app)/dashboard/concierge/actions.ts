"use server";

import { cookies } from "next/headers";
import { parseRemoved, REMOVED_WIDGETS_COOKIE } from "@/lib/concierge/removed";

async function updateRemoved(change: (ids: Set<string>) => void) {
  const store = await cookies();
  const ids = new Set(parseRemoved(store.get(REMOVED_WIDGETS_COOKIE)?.value));
  change(ids);
  if (ids.size === 0) store.delete(REMOVED_WIDGETS_COOKIE);
  else
    store.set(REMOVED_WIDGETS_COOKIE, [...ids].join(","), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
}

/** Brings a deleted widget back; creating a widget does this for the one it opens. */
export async function restoreWidget(id: string) {
  await updateRemoved((ids) => ids.delete(id));
}
