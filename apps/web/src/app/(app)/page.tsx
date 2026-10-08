import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <Image
        src="/brand/slice_logo_blktext.svg"
        alt="Slice"
        width={167}
        height={39}
        priority
      />
      <div className="max-w-md space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          A concierge with taste, for every storefront.
        </h1>
        <p className="text-muted-foreground">
          Recommendations grounded in Qloo&apos;s cultural graph. Works on a
          shopper&apos;s first visit, with no history and no personal data.
        </p>
      </div>
      <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
        Open dashboard
      </Link>
    </main>
  );
}
