import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// "Continue as guest": makes a Clerk user flagged as a guest and answers with a
// one-time sign-in token the browser signs in with. The console home then
// copies every service's demo brands into it, as for any new account. A signed
// cookie brings the same browser back to the same guest, so signing out and
// coming back doesn't use up another user. Guests stay until
// `npx convex run guests:purge`.

const COOKIE = "slice_guest";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
// The Clerk dev instance holds 100 users in all; leave room for real sign-ups.
const MAX_USERS = 95;
// New guests per address per hour, per server instance.
const PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

const recent = new Map<string, number[]>();

function allowed(address: string) {
  const now = Date.now();
  const times = (recent.get(address) ?? []).filter((t) => now - t < HOUR_MS);
  if (times.length >= PER_HOUR) return false;
  recent.set(address, [...times, now]);
  return true;
}

const mac = (userId: string) =>
  createHmac("sha256", `slice-guest:${process.env.CLERK_SECRET_KEY}`)
    .update(userId)
    .digest("base64url");

/** The guest this browser had before, if the cookie is ours. */
function remembered(value: string | undefined) {
  const [userId, signature] = value?.split(".") ?? [];
  if (!userId || !signature) return null;
  const want = Buffer.from(mac(userId));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}

const refuse = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: NextRequest) {
  if (!process.env.CLERK_SECRET_KEY) return refuse("Guest access isn't set up here.", 503);
  const clerk = await clerkClient();
  const jar = await cookies();

  try {
    let userId = remembered(jar.get(COOKIE)?.value);
    if (userId) {
      const user = await clerk.users.getUser(userId).catch(() => null);
      if (user?.publicMetadata?.guest !== true) userId = null;
    }

    if (!userId) {
      const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      if (!allowed(address))
        return refuse("Too many guest workspaces from here. Try again in an hour, or sign up.", 429);
      if ((await clerk.users.getCount()) >= MAX_USERS)
        return refuse("Guest spots are full right now. Sign up to get your own workspace.", 503);
      const user = await clerk.users.createUser({
        firstName: "Guest",
        emailAddress: [`guest-${randomBytes(5).toString("hex")}@example.com`],
        skipPasswordRequirement: true,
        skipLegalChecks: true,
        publicMetadata: { guest: true },
      });
      userId = user.id;
    }

    const { token } = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 120 });
    jar.set(COOKIE, `${userId}.${mac(userId)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return Response.json({ token });
  } catch (err) {
    console.error("[guest] could not start a guest workspace", err);
    return refuse("Couldn't start a guest workspace. Try again, or sign up.", 502);
  }
}
