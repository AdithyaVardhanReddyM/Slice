// Visitor and session ids for the tracker and the form. Visitor id lives in
// localStorage; session id in sessionStorage and rolls over after 30 idle
// minutes. Both degrade to in-memory ids when storage is unavailable.

const VID_KEY = "pg_vid";
const SID_KEY = "pg_sid";
const IDLE_MS = 30 * 60 * 1000;

let memoVid: string | null = null;
let memoSid: { id: string; last: number } | null = null;

function rand(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getVisitorId(): string {
  try {
    let v = localStorage.getItem(VID_KEY);
    if (!v) {
      v = rand();
      localStorage.setItem(VID_KEY, v);
    }
    return v;
  } catch {
    memoVid ??= rand();
    return memoVid;
  }
}

/** Returns the current session id, refreshing its last-activity stamp. */
export function getSessionId(): string {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(SID_KEY);
    if (raw) {
      const i = raw.lastIndexOf("|");
      const id = raw.slice(0, i);
      const last = Number(raw.slice(i + 1));
      if (id && now - last < IDLE_MS) {
        sessionStorage.setItem(SID_KEY, `${id}|${now}`);
        return id;
      }
    }
    const id = rand();
    sessionStorage.setItem(SID_KEY, `${id}|${now}`);
    return id;
  } catch {
    if (!memoSid || now - memoSid.last >= IDLE_MS) memoSid = { id: rand(), last: now };
    memoSid.last = now;
    return memoSid.id;
  }
}
