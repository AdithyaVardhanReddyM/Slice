import { Suspense } from "react";
import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import {
  AuthShell,
  clerkAppearance,
} from "@/components/console/auth/auth-shell";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell>
      {/* SignUp reads the URL at request time, so it streams in after the static shell. */}
      <Suspense>
        <SignUp
          appearance={clerkAppearance}
          fallbackRedirectUrl="/dashboard/new"
        />
      </Suspense>
    </AuthShell>
  );
}
