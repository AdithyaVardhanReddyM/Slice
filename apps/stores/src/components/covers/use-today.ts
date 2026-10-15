import { useSyncExternalStore } from "react";
import { londonMinutes, londonToday } from "@/lib/covers/booking";

const subscribe = () => () => {};

/**
 * Today's date in London, read in the browser. Null while rendering on the
 * server (and during hydration), so a page built yesterday never offers
 * yesterday as a booking date.
 */
export const useToday = () => useSyncExternalStore(subscribe, londonToday, () => null);

/** Minutes past midnight in London, read in the browser (null on the server), so today's earlier sittings can be hidden. */
export const useLondonMinutes = () => useSyncExternalStore(subscribe, londonMinutes, () => null);
