import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { SliceWordmark } from "../logo";

// Clerk appearance mapped onto the shadcn theme.
export const clerkAppearance = {
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
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
  },
};

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh flex-1 lg:grid-cols-2">
      <section className="flex flex-col px-6 py-8 sm:px-10">
        <Link href="/">
          <SliceWordmark />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </section>

      <section className="relative hidden overflow-hidden bg-muted lg:block">
        <Image
          src="/illustrations/no-widget-card.svg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </section>
    </main>
  );
}
