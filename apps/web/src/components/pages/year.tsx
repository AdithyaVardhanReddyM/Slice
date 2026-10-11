"use client";

// The footer's year is request-time data; rendering it on the client keeps the
// server renderer free of `new Date()` (Next's prerender check flags it).
export function Year() {
  return <>{new Date().getFullYear()}</>;
}
