"use client";

import { UserButton, useClerk, useUser } from "@clerk/nextjs";
import { LogOut, UserPlus } from "lucide-react";
import { isGuest } from "@/lib/guest";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountButton() {
  const { user } = useUser();
  if (isGuest(user)) return <GuestAccountButton />;
  return (
    <UserButton
      appearance={{
        elements: { avatarBox: "size-8 rounded-full ring-1 ring-black/10" },
      }}
    />
  );
}

/** Clerk's own menu would show the guest's placeholder email, so guests get this one. */
function GuestAccountButton() {
  const { signOut } = useClerk();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Guest workspace" className="rounded-full">
        <Avatar className="size-8 rounded-full ring-1 ring-black/10">
          <AvatarFallback className="rounded-full">G</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="grid px-1.5 py-1.5 text-sm leading-tight font-normal text-foreground">
            <span className="font-medium">Guest</span>
            <span className="text-xs text-muted-foreground">Guest workspace</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/sign-up" })}>
          <UserPlus />
          Create an account
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
