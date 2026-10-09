"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  Activity,
  BookOpen,
  Check,
  ChevronsUpDown,
  Code,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Plus,
  Settings,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { getWidget, widgets } from "@/lib/mock/widgets";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SliceWordmark } from "./logo";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  exact?: boolean;
};

export function WidgetSidebar({
  conversationCounts,
}: {
  /** Computed on the server so the catalog JSON stays out of the client bundle. */
  conversationCounts: Record<string, number>;
}) {
  const { widget: widgetId } = useParams<{ widget: string }>();
  const pathname = usePathname();
  const widget = getWidget(widgetId) ?? widgets[0];
  const base = `/dashboard/${widget.id}`;
  const setupLeft = 6 - widget.completedSteps.length;

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Monitor",
      items: [
        { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
        {
          href: `${base}/conversations`,
          label: "Conversations",
          icon: MessagesSquare,
          count: conversationCounts[widget.id] ?? 0,
        },
        { href: `${base}/taste`, label: "Taste insights", icon: Sparkles },
        { href: `${base}/activity`, label: "Signal log", icon: Activity },
      ],
    },
    {
      label: "Configure",
      items: [
        ...(setupLeft > 0
          ? [
              {
                href: `${base}/setup`,
                label: "Setup",
                icon: Wand2,
                count: setupLeft,
              },
            ]
          : []),
        { href: `${base}/catalog`, label: "Catalog", icon: BookOpen },
        { href: `${base}/install`, label: "Install", icon: Code },
        { href: `${base}/settings`, label: "Settings", icon: Settings },
      ],
    },
  ];

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="gap-3">
        <Link href="/dashboard" className="px-2 pt-1.5">
          <SliceWordmark />
        </Link>
        <WidgetSwitcher currentId={widget.id} />
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(item)}
                        render={<Link href={item.href} />}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.count !== undefined && (
                        <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

/** Signed-in merchant, with account actions. */
function NavUser() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const name = user?.fullName ?? user?.username ?? "Account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const identity = (
    <>
      <Avatar className="size-8 rounded-lg">
        {user?.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </div>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent"
              />
            }
          >
            {identity}
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-60"
            side="right"
            align="end"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 px-1 py-1.5 font-normal text-foreground">
                {identity}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openUserProfile()}>
              <UserRound />
              Account
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard" />}>
              <LayoutGrid />
              All widgets
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function WidgetSwitcher({ currentId }: { currentId: string }) {
  const current = getWidget(currentId) ?? widgets[0];
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="bg-background shadow-xs ring-1 ring-sidebar-border data-popup-open:bg-sidebar-accent"
              />
            }
          >
            <WidgetGlyph name={current.name} accent={current.accent} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{current.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {current.domain}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" align="start" sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Widgets</DropdownMenuLabel>
              {widgets.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  render={<Link href={`/dashboard/${w.id}`} />}
                >
                  <WidgetGlyph name={w.name} accent={w.accent} size="sm" />
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === current.id && <Check className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/new" />}>
              <Plus className="size-4" />
              New widget
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function WidgetGlyph({
  name,
  accent,
  size = "md",
}: {
  name: string;
  accent: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md font-semibold text-white",
        size === "sm" && "size-5 text-[10px]",
        size === "md" && "size-8 text-sm",
        size === "lg" && "size-10 text-base",
      )}
      style={{ background: accent }}
    >
      {name.charAt(0)}
    </span>
  );
}

export function StatusText({
  status,
}: {
  status: "live" | "setup" | "paused";
}) {
  const meta = {
    live: { label: "Live", className: "bg-emerald-50 text-emerald-700" },
    setup: { label: "In setup", className: "bg-amber-50 text-amber-700" },
    paused: { label: "Paused", className: "bg-muted text-muted-foreground" },
  }[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
