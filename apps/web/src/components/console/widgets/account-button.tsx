"use client";

import { UserButton } from "@clerk/nextjs";

export function AccountButton() {
  return (
    <UserButton
      appearance={{
        elements: { avatarBox: "size-8 rounded-full ring-1 ring-black/10" },
      }}
    />
  );
}
