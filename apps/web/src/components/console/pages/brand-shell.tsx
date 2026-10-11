"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Palette,
  Plus,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { Fragment, type ComponentType, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { Brand } from "@/lib/pages/types";
import { brandDomain, faviconOf, hostOf } from "@/lib/pages/urls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SliceWordmark } from "@/components/console/logo";
import { PageSkeleton } from "@/components/console/primitives";
import { BrandProvider } from "./brand-context";
import { Thumb } from "./shared";

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }>; count?: number; exact?: boolean };

const SECTION_LABELS: Record<string, string> = {
  audiences: "Audiences",
  pages: "Pages",
  analytics: "Analytics",
  kit: "Brand kit",
  settings: "Settings",
};

export function BrandGlyph({ brand, size = "md" }: { brand: Brand; size?: "sm" | "md" }) {
  const logo = brand.kit?.logo?.src ?? faviconOf(brand.url);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
        size === "sm" ? "size-5" : "size-8",
      )}
    >
      {logo ? (
        <Thumb src={logo} className={size === "sm" ? "size-4" : "size-6"} rounded="rounded-none [&_img]:object-contain" />
      ) : (
        <Globe className={cn("text-muted-foreground", size === "sm" ? "size-3" : "size-4")} />
      )}
    </span>
  );
}

function BrandSwitcher({ current }: { current: Brand }) {
  const brands = useQuery(api.pagesBrands.list, {}) ?? [];
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="bg-background shadow-xs ring-1 ring-sidebar-border data-popup-open:bg-sidebar-accent" />}
          >
            <BrandGlyph brand={current} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{current.name}</span>
              <span className="truncate text-xs text-muted-foreground">{hostOf(current.url)}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start" sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Brands</DropdownMenuLabel>
              {brands.map((b: Brand) => (
                <DropdownMenuItem key={b._id} render={<Link href={`/dashboard/pages/${b.slug}`} />}>
                  <BrandGlyph brand={b} size="sm" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {b._id === current._id && <Check className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/pages/new" />}>
              <Plus className="size-4" />
              New brand
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUser() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const name = user?.fullName ?? user?.username ?? "Account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = name
    .split(" ")
    .map((p) => p.charAt(0))
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
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}>
            {identity}
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" side="right" align="end" sideOffset={8}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 px-1 py-1.5 font-normal text-foreground">{identity}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openUserProfile()}>
              <UserRound />
              Account
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard/pages" />}>
              <LayoutGrid />
              All brands
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/dashboard" />}>
              <LayoutDashboard />
              All services
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

function BrandSidebar({ brand }: { brand: Brand }) {
  const pathname = usePathname();
  const base = `/dashboard/pages/${brand.slug}`;
  const audiences = useQuery(api.pagesAudiences.list, { brandId: brand._id });
  const pages = useQuery(api.pages.list, { brandId: brand._id });
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Build",
      items: [
        { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
        { href: `${base}/audiences`, label: "Audiences", icon: Users, count: audiences?.length },
        { href: `${base}/pages`, label: "Pages", icon: FileText, count: pages?.length },
        { href: `${base}/analytics`, label: "Analytics", icon: BarChart3 },
      ],
    },
    {
      label: "Configure",
      items: [
        { href: `${base}/kit`, label: "Brand kit", icon: Palette },
        { href: `${base}/settings`, label: "Settings", icon: Settings },
      ],
    },
  ];
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="gap-3">
        <Link href="/dashboard" className="px-2 pt-1.5">
          <SliceWordmark />
        </Link>
        <BrandSwitcher current={brand} />
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
                      <SidebarMenuButton isActive={isActive(item)} render={<Link href={item.href} />}>
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.count !== undefined && <SidebarMenuBadge>{item.count}</SidebarMenuBadge>}
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

function BrandTopbar({ brand }: { brand: Brand }) {
  const pathname = usePathname();
  const base = `/dashboard/pages/${brand.slug}`;
  const parts = pathname.split("/").slice(4).filter(Boolean);
  const pages = useQuery(api.pages.list, { brandId: brand._id });
  const crumbs: { label: string; href?: string }[] = [
    { label: "Pages", href: "/dashboard/pages" },
    { label: brand.name, href: base },
  ];
  if (parts.length === 0) crumbs.push({ label: "Overview" });
  else if (SECTION_LABELS[parts[0]]) {
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      crumbs.push({ label: SECTION_LABELS[part] ?? part, href: last ? undefined : `${base}/${parts.slice(0, i + 1).join("/")}` });
    });
  } else {
    // A page builder: /dashboard/pages/[brand]/[page]
    const page = (pages ?? []).find((p: { slug: string }) => p.slug === parts[0]);
    crumbs.push({ label: "Pages", href: `${base}/pages` });
    crumbs.push({ label: page?.title ?? parts[0] });
  }
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 rounded-t-xl border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {c.href ? <BreadcrumbLink render={<Link href={c.href} />}>{c.label}</BreadcrumbLink> : <BreadcrumbPage>{c.label}</BreadcrumbPage>}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">{brandDomain(brand.slug)}</span>
        <Button variant="ghost" nativeButton={false} render={<a href={brand.url} target="_blank" rel="noreferrer" />}>
          Visit site
          <ExternalLink />
        </Button>
      </div>
    </header>
  );
}

/** Resolves the brand from the URL slug and wraps the hub in sidebar + topbar. */
export function BrandShell({ children }: { children: ReactNode }) {
  const { brand: slug } = useParams<{ brand: string }>();
  const brand = useQuery(api.pagesBrands.bySlug, { slug });
  if (brand === undefined) return <PageSkeleton />;
  if (brand === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">No brand called “{slug}”</h1>
        <p className="text-sm text-muted-foreground">It may have been renamed or deleted.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/pages" />}>
          All brands
        </Button>
      </div>
    );
  }
  return (
    <BrandProvider value={brand}>
      <SidebarProvider>
        <BrandSidebar brand={brand} />
        <SidebarInset className="border md:peer-data-[variant=inset]:shadow-none">
          <BrandTopbar brand={brand} />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </BrandProvider>
  );
}
