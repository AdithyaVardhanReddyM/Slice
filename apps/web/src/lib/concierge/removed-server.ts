import { cookies } from "next/headers";
import { widgets } from "@/lib/mock/widgets";
import { parseRemoved, REMOVED_WIDGETS_COOKIE } from "./removed";

/** Ids of the widgets this browser has deleted. */
export async function removedWidgetIds() {
  const store = await cookies();
  return new Set(parseRemoved(store.get(REMOVED_WIDGETS_COOKIE)?.value));
}

/** Every widget that hasn't been deleted. */
export async function visibleWidgets() {
  const removed = await removedWidgetIds();
  return widgets.filter((w) => !removed.has(w.id));
}
