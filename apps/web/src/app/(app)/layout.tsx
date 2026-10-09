import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClerkProvider } from "@/components/providers/convex-clerk-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <ConvexClerkProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </ConvexClerkProvider>
    </ClerkProvider>
  );
}
