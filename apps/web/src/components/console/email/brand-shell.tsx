"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  Check,
  ChevronsUpDown,
  ExternalLink,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Mail,
  Palette,
  Plus,
  Send,
  UserRound,
  Users,
} from "lucide-react";
import { Fragment, useState, type ComponentType, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { domainOf, kitOf, type EmailBrand } from "@/lib/email/types";
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
import { Badge, PageSkeleton } from "@/components/console/primitives";
import {
  ServiceMark,
  insetClass,
  navBadgeClass,
  navButtonClass,
  navGroupLabelClass,
  switcherClass,
  topbarClass,
  topbarPillClass,
} from "@/components/console/shell-ui";
import { EmailBrandProvider } from "./brand-context";

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }>; count?: number; exact?: boolean };

const SECTION_LABELS: Record<string, string> = {
  campaigns: "Campaigns",
  contacts: "Contacts",
  brand: "Brand kit",
  sending: "Sending",
};

/** A brand row from emailBrands.list carries its counts beside the document. */
export type BrandRow = EmailBrand & { counts?: { campaigns?: number; contacts?: number }; campaigns?: number; contacts?: number };

export function countsOf(row: BrandRow | undefined) {
  return {
    campaigns: row?.counts?.campaigns ?? row?.campaigns,
    contacts: row?.counts?.contacts ?? row?.contacts,
  };
}

export function hostOf(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * A square brand tile: the kit's icon, else its logo when it is square,
 * else a monogram on the brand's primary colour. A wide wordmark is
 * unreadable at this size, so it passes to the next source.
 */
export function EmailBrandGlyph({ brand, size = "md", className }: { brand: Pick<EmailBrand, "name" | "kit">; size?: "sm" | "md" | "lg"; className?: string }) {
  const kit = kitOf(brand as EmailBrand);
  const sources = [kit?.icon, kit?.logo?.src].filter((s): s is string => !!s);
  const key = sources.join(" ");
  const [skipped, setSkipped] = useState({ key, n: 0 });
  const n = skipped.key === key ? skipped.n : 0;
  const logo = sources[n];
  const next = () => setSkipped({ key, n: n + 1 });
  const box = { sm: "size-5 text-[10px] rounded-md", md: "size-8 text-sm rounded-lg", lg: "size-11 text-base rounded-xl" }[size];
  const img = { sm: "size-4", md: "size-6", lg: "size-8" }[size];
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden font-semibold", box, logo ? "bg-white ring-1 ring-black/[0.08]" : !kit && "bg-neutral-900 text-white", className)}
      style={logo || !kit ? undefined : { background: kit.colors.primary, color: kit.colors.primaryForeground }}
    >
      {logo ? (
        // Merchant logos live on arbitrary hosts; next/image would need every one allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={logo}
          src={logo}
          alt=""
          className={cn("object-contain", img)}
          onLoad={(e) => e.currentTarget.naturalWidth > e.currentTarget.naturalHeight * 1.5 && next()}
          onError={next}
        />
      ) : (
        brand.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function BrandSwitcher({ current }: { current: EmailBrand }) {
  const brands = (useQuery(api.emailBrands.list, {}) ?? []) as BrandRow[];
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className={switcherClass} />}>
            <EmailBrandGlyph brand={current} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{current.name}</span>
              <span className="truncate text-xs text-muted-foreground">{hostOf(current.url) || "Email brand"}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start" sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Brands</DropdownMenuLabel>
              {brands.map((b) => (
                <DropdownMenuItem key={b._id} render={<Link href={b.status === "ready" ? `/dashboard/email/${b.slug}` : `/dashboard/email/new?brand=${b._id}`} />}>
                  <EmailBrandGlyph brand={b} size="sm" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.demo && <Badge tone="outline">Demo</Badge>}
                  {b._id === current._id && <Check className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard/email/new" />}>
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
      <Avatar className="size-8 rounded-full">
        {user?.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
        <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
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
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="rounded-2xl hover:bg-neutral-100 data-popup-open:bg-neutral-100" />}>
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
            <DropdownMenuItem render={<Link href="/dashboard/email" />}>
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

function BrandSidebar({ brand }: { brand: EmailBrand }) {
  const pathname = usePathname();
  const base = `/dashboard/email/${brand.slug}`;
  const rows = useQuery(api.emailBrands.list, {}) as BrandRow[] | undefined;
  const counts = countsOf(rows?.find((r) => r._id === brand._id));
  const domain = domainOf(brand);
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Send",
      items: [
        { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
        { href: `${base}/campaigns`, label: "Campaigns", icon: Mail, count: counts.campaigns },
        { href: `${base}/contacts`, label: "Contacts", icon: Users, count: counts.contacts },
      ],
    },
    {
      label: "Configure",
      items: [
        { href: `${base}/brand`, label: "Brand kit", icon: Palette },
        { href: `${base}/sending`, label: "Sending", icon: Send },
      ],
    },
  ];
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="gap-5 px-3 pt-3">
        <Link href="/dashboard" aria-label="Home">
          <ServiceMark wordmark={<SliceWordmark />} service="Email" />
        </Link>
        <BrandSwitcher current={brand} />
      </SidebarHeader>
      <SidebarContent className="px-1">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className={navGroupLabelClass}>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton isActive={isActive(item)} className={navButtonClass} render={<Link href={item.href} />}>
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.count !== undefined && <SidebarMenuBadge className={navBadgeClass}>{item.count}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-3 p-3">
        {!brand.demo && domain?.status !== "verified" && (
          <Link
            href={`${base}/sending`}
            className="block rounded-2xl bg-neutral-50 p-3 text-xs leading-relaxed text-muted-foreground ring-1 ring-black/[0.05] transition-colors hover:bg-neutral-100 hover:text-foreground"
          >
            <span className="block text-sm font-medium text-foreground">{domain ? "Finish your domain" : "Connect a domain"}</span>
            Campaigns go to real inboxes once your sending domain is verified.
          </Link>
        )}
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

function BrandTopbar({ brand }: { brand: EmailBrand }) {
  const pathname = usePathname();
  const base = `/dashboard/email/${brand.slug}`;
  const parts = pathname.split("/").slice(4).filter(Boolean);
  const crumbs: { label: string; href?: string }[] = [
    { label: "Email", href: "/dashboard/email" },
    { label: brand.name, href: base },
  ];
  if (parts.length === 0) crumbs.push({ label: "Overview" });
  else {
    crumbs.push({ label: SECTION_LABELS[parts[0]] ?? parts[0], href: parts.length > 1 ? `${base}/${parts[0]}` : undefined });
    if (parts[0] === "campaigns" && parts[1] === "new") crumbs.push({ label: "New campaign" });
  }
  return (
    <header className={topbarClass}>
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
        {brand.url && (
          <Button
            variant="ghost"
            nativeButton={false}
            className={cn(topbarPillClass, "hidden sm:inline-flex")}
            render={<a href={brand.url} target="_blank" rel="noreferrer" />}
          >
            {hostOf(brand.url)}
            <ExternalLink data-icon="inline-end" />
          </Button>
        )}
        {!(parts[0] === "campaigns" && parts[1] === "new") && (
          <Button nativeButton={false} className="h-9 rounded-full bg-neutral-900 px-3.5 text-white hover:bg-neutral-800" render={<Link href={`${base}/campaigns/new`} />}>
            <Plus data-icon="inline-start" />
            New campaign
          </Button>
        )}
      </div>
    </header>
  );
}

/** Resolves the brand from the URL slug and wraps its screens in sidebar + topbar. */
export function EmailBrandShell({ children }: { children: ReactNode }) {
  const { brand: slug } = useParams<{ brand: string }>();
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const brand = useQuery(api.emailBrands.mineBySlug, isAuthenticated ? { slug } : "skip");
  // The campaign editor (/campaigns/[campaign]) is full screen; /campaigns/new keeps the chrome.
  const [, , , , section, sub] = pathname.split("/");
  const editor = section === "campaigns" && !!sub && sub !== "new";
  if (brand === undefined) return <PageSkeleton />;
  if (brand === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">No brand called “{slug}”</h1>
        <p className="text-sm text-muted-foreground">It may have been renamed or deleted.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/email" />}>
          All brands
        </Button>
      </div>
    );
  }
  if (editor) return <EmailBrandProvider value={brand}>{children}</EmailBrandProvider>;
  return (
    <EmailBrandProvider value={brand}>
      {/* The window never scrolls: the inset card does, so its scrollbar sits inside the card. */}
      <SidebarProvider className="h-svh overflow-hidden">
        <BrandSidebar brand={brand} />
        <SidebarInset className={cn("min-h-0 overflow-x-hidden overflow-y-auto", insetClass)}>
          <BrandTopbar brand={brand} />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </EmailBrandProvider>
  );
}
