import { Suspense } from "react";
import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import {
  AuthShell,
  clerkAppearance,
} from "@/components/console/auth/auth-shell";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell>
      {/* SignIn reads the URL at request time, so it streams in after the static shell. */}
      <Suspense>
        <SignIn appearance={clerkAppearance} fallbackRedirectUrl="/dashboard" />
      </Suspense>
    </AuthShell>
  );
}
