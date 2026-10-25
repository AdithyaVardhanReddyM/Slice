"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { parseRemoved, REMOVED_WIDGETS_COOKIE } from "@/lib/concierge/removed";
import { SAMPLE_COOKIE } from "@/lib/concierge/sample";

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

/** Switches the console between sample data and the widget's own. */
export async function setSampleData(on: boolean) {
  (await cookies()).set(SAMPLE_COOKIE, on ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/dashboard/concierge", "layout");
}
