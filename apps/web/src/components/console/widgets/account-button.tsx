"use client";

import { UserButton } from "@clerk/nextjs";

export function AccountButton() {
  return (
    <UserButton appearance={{ elements: { avatarBox: "size-7 rounded-md" } }} />
  );
}
