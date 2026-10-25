import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import type { FunctionReturnType } from "convex/server";
import { api } from "@slice/backend/convex/_generated/api";

// The signed-in account's own concierge data, read on the server with the
// merchant's Convex token. Used when the console's sample data is off.

export type LiveData = NonNullable<
  FunctionReturnType<typeof api.conciergeConsole.data>
>;
export type LiveConversation = NonNullable<
  FunctionReturnType<typeof api.conciergeConsole.conversation>
>;

async function token() {
  const { getToken } = await auth();
  return (await getToken({ template: "convex" })) ?? undefined;
}

/** Conversations, profiles and visits for the account's widget on a store; `catalog` adds its products. */
export async function liveData(storeKey: string, catalog = false) {
  try {
    return await fetchQuery(
      api.conciergeConsole.data,
      { storeKey, catalog },
      { token: await token() },
    );
  } catch (err) {
    console.error("[concierge] could not load live data", err);
    return null;
  }
}

export async function liveConversation(storeKey: string, id: string) {
  try {
    return await fetchQuery(
      api.conciergeConsole.conversation,
      { storeKey, id },
      { token: await token() },
    );
  } catch (err) {
    console.error("[concierge] could not load conversation", err);
    return null;
  }
}

export async function liveCount(storeKey: string) {
  try {
    return await fetchQuery(
      api.conciergeConsole.count,
      { storeKey },
      { token: await token() },
    );
  } catch {
    return 0;
  }
}
