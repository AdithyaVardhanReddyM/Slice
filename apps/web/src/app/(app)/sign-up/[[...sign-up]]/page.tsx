import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      {/* SignUp reads the URL at request time, so it streams in after the static shell. */}
      <Suspense>
        <SignUp />
      </Suspense>
    </main>
  );
}
