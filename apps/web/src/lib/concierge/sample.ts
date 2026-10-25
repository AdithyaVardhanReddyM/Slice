import { cookies } from "next/headers";

// The Concierge console's "Sample data" switch, kept per browser in a cookie
// so the server-rendered Overview, Conversations and Taste insights all agree.
// On by default: the demo widgets show the sample until it's switched off.

export const SAMPLE_COOKIE = "slice-concierge-sample";

/** Whether the console shows sample data instead of the widget's own. */
export async function showsSample() {
  return (await cookies()).get(SAMPLE_COOKIE)?.value !== "0";
}
