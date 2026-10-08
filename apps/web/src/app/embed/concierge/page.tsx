import Image from "next/image";

export default function ConciergePage() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Image src="/brand/slice_logo.svg" alt="" width={24} height={17} />
        <span className="font-medium">Concierge</span>
      </header>
      <main className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Concierge coming soon.
      </main>
    </div>
  );
}
