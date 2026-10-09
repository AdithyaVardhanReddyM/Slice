"use client";

import { useId, useState } from "react";
import { Badge } from "@/components/console/primitives";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt } from "@/lib/format";
import {
  initials,
  roleMeta,
  type Invite,
  type Member,
  type Role,
} from "@/lib/mock/team";

const ROLES: Role[] = ["admin", "analyst", "viewer"];
const ROLE_ITEMS = Object.fromEntries(
  ROLES.map((r) => [r, roleMeta[r].label]),
) as Record<Role, string>;

function RoleSelect({
  value,
  onChange,
  id,
  label,
  className,
}: {
  value: Role;
  onChange: (role: Role) => void;
  id?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Select
      items={ROLE_ITEMS}
      value={value}
      onValueChange={(v) => v && onChange(v as Role)}
    >
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {roleMeta[r].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Members table. Role edits flow into the page's unsaved-changes state. */
export function TeamTable({
  members,
  roles,
  onRoleChange,
}: {
  members: Member[];
  roles: Record<string, Role>;
  onRoleChange: (id: string, role: Role) => void;
}) {
  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Member</TableHead>
          <TableHead className="w-40">Role</TableHead>
          <TableHead className="w-32 pr-4 text-right">Last active</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="py-3 pl-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="text-xs font-medium">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="truncate text-muted-foreground">
                    {m.email}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              {m.role === "owner" ? (
                <Badge>Owner</Badge>
              ) : (
                <RoleSelect
                  label={`Role for ${m.name}`}
                  value={roles[m.id] ?? m.role}
                  onChange={(role) => onRoleChange(m.id, role)}
                  className="w-32"
                />
              )}
            </TableCell>
            <TableCell className="num pr-4 text-right text-muted-foreground">
              {fmt.ago(m.lastActive)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Invite form plus pending invites. Sends immediately; not part of Save. */
export function Invites({ initial }: { initial: Invite[] }) {
  const emailId = useId();
  const roleId = useId();
  const [invites, setInvites] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("analyst");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          setInvites((xs) => [{ email, role, sentAt: "" }, ...xs]);
          setEmail("");
        }}
      >
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div className="w-40 space-y-2">
          <Label htmlFor={roleId}>Role</Label>
          <RoleSelect
            id={roleId}
            value={role}
            onChange={setRole}
            className="w-full"
          />
        </div>
        <Button type="submit" disabled={!valid}>
          Send invite
        </Button>
        <p className="w-full text-sm text-muted-foreground">
          {roleMeta[role].description}.
        </p>
      </form>
      {invites.length > 0 && (
        <ul className="divide-y border-t">
          {invites.map((inv) => (
            <li key={inv.email} className="flex h-12 items-center gap-3 px-4">
              <span className="min-w-0 flex-1 truncate">{inv.email}</span>
              <Badge tone="outline">{roleMeta[inv.role].label}</Badge>
              <span className="num w-28 text-right text-muted-foreground">
                {inv.sentAt ? `Sent ${fmt.ago(inv.sentAt)}` : "Sent just now"}
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  setInvites((xs) => xs.filter((x) => x.email !== inv.email))
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
