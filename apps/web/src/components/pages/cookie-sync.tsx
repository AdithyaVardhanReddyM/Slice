"use client";

// Remembers the audience the server resolved (param, lead, utm, geo) so the
// next visit can be served from the cookie without the original signal.

import { useEffect } from "react";
import { audienceCookieName } from "./types";

const YEAR = 60 * 60 * 24 * 365;

export function setAudienceCookie(pageId: string, audienceId: string, how: string) {
  const name = audienceCookieName(pageId);
  const value = encodeURIComponent(`${audienceId}:${how}`);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; SameSite=Lax${secure}`;
}

export function readAudienceCookie(pageId: string): string | null {
  const name = audienceCookieName(pageId);
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

export function CookieSync({ pageId, audienceId, how }: { pageId: string; audienceId?: string; how: string }) {
  useEffect(() => {
    if (!audienceId) return;
    if (readAudienceCookie(pageId) === `${audienceId}:${how}`) return;
    setAudienceCookie(pageId, audienceId, how);
  }, [pageId, audienceId, how]);
  return null;
}
