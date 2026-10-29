// Guests are real Clerk users made by /api/guest and flagged in their public
// metadata, so a judge gets a workspace (with every service's demo brands)
// without signing up. Their email is a placeholder nobody reads.

type MaybeUser = { publicMetadata?: Record<string, unknown> } | null | undefined;

export const isGuest = (user: MaybeUser) => user?.publicMetadata?.guest === true;
