import type { ReactNode } from "react";
import Link from "next/link";
import { SliceWordmark } from "../logo";
import { GuestButton } from "./guest-button";
import { ParticleField } from "./particle-field";

// Clerk appearance mapped onto the shadcn theme, flattened to sit inside the auth card.
export const clerkAppearance = {
  options: { logoPlacement: "none" as const },
  variables: {
    colorPrimary: "#ea580c",
    colorText: "#0a0a0a",
    colorTextSecondary: "#737373",
    colorBackground: "#ffffff",
    colorDanger: "#dc2626",
    fontFamily: "var(--font-inter)",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", border: "none", borderRadius: 0 },
    card: { boxShadow: "none", border: "none", background: "transparent" },
    footer: { background: "transparent" },
  },
};

/** Under the Clerk card: a workspace with every demo brand, no email needed. */
function GuestEntry() {
  return (
    <div className="px-8 pt-5 pb-6">
      <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <GuestButton
        wide
        className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.625rem] border bg-background text-sm font-medium transition-colors hover:bg-muted disabled:opacity-70"
      >
        Continue as guest
      </GuestButton>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Two demo brands in every service, no email needed.
      </p>
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-canvas p-4 sm:p-6 lg:p-8">
      <div className="grid w-full max-w-[1040px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:min-h-[640px] lg:grid-cols-2">
        <section className="relative hidden lg:block">
          <ParticleField className="absolute inset-0" />
          <Link href="/" className="absolute top-7 left-7">
            <SliceWordmark />
          </Link>
        </section>

        <section className="flex flex-col items-center justify-center px-2 py-8 sm:px-8">
          <Link href="/" className="lg:hidden">
            <SliceWordmark />
          </Link>
          <div className="w-full max-w-[400px]">
            {children}
            <GuestEntry />
          </div>
        </section>
      </div>
    </main>
  );
}
