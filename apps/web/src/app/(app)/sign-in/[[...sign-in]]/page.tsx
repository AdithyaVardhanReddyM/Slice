import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      {/* SignIn reads the URL at request time, so it streams in after the static shell. */}
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}
