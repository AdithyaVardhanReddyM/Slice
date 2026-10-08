import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClerkProvider } from "@/components/providers/convex-clerk-provider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <ConvexClerkProvider>{children}</ConvexClerkProvider>
    </ClerkProvider>
  );
}
