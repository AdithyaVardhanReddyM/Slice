"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Spinner } from "../setup/atoms";

/**
 * Signs in as a guest (api/guest makes the Clerk user, or finds this browser's
 * last one) and opens the console. Someone already signed in just goes there.
 */
export function GuestButton({
  className,
  wide,
  children,
}: {
  className?: string;
  /** Fill the row, as under the sign-in card. */
  wide?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (isSignedIn) return router.push("/dashboard");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guest", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !body.token) throw new Error(body.error ?? "Couldn't start a guest workspace. Try again, or sign up.");
      const signedIn = await signIn.ticket({ ticket: body.token });
      if (signedIn.error) throw signedIn.error;
      const done = await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/dashboard");
          if (url.startsWith("http")) window.location.href = url;
          else router.push(url);
        },
      });
      if (done.error) throw done.error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a guest workspace. Try again, or sign up.");
      setBusy(false);
    }
  }

  return (
    <span className={cn("relative flex-col items-center", wide ? "flex w-full" : "inline-flex")}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        aria-busy={busy}
        className={cn(wide && "w-full", busy && "cursor-wait", className)}
      >
        {busy ? (
          <>
            <Spinner />
            Setting up your workspace
          </>
        ) : (
          children
        )}
      </button>
      {error && (
        <span role="alert" className="absolute top-full mt-2 w-max max-w-xs text-center text-sm text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
