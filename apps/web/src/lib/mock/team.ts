// Workspace members for the settings screen. Names are fictional.

export type Role = "owner" | "admin" | "analyst" | "viewer";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastActive: string;
}

export interface Invite {
  email: string;
  role: Role;
  sentAt: string;
}

export const members: Member[] = [
  {
    id: "usr_01",
    name: "Adithya Reddy",
    email: "adithya@slicedemo.co",
    role: "owner",
    lastActive: "2026-10-09T14:12:00Z",
  },
  {
    id: "usr_02",
    name: "Priya Natarajan",
    email: "priya@slicedemo.co",
    role: "admin",
    lastActive: "2026-10-09T11:40:00Z",
  },
  {
    id: "usr_03",
    name: "Tomás Ferreira",
    email: "tomas@slicedemo.co",
    role: "analyst",
    lastActive: "2026-10-08T17:05:00Z",
  },
  {
    id: "usr_04",
    name: "Hana Kobayashi",
    email: "hana@slicedemo.co",
    role: "viewer",
    lastActive: "2026-10-03T09:22:00Z",
  },
];

export const invites: Invite[] = [
  {
    email: "ops@slicedemo.co",
    role: "analyst",
    sentAt: "2026-10-08T10:00:00Z",
  },
];

export const roleMeta: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Billing, keys and deletion" },
  admin: { label: "Admin", description: "Everything except billing" },
  analyst: {
    label: "Analyst",
    description: "Insights, conversations and exports",
  },
  viewer: { label: "Viewer", description: "Read-only dashboards" },
};

/** Two-letter avatar fallback, e.g. "Priya Natarajan" → "PN". */
export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
