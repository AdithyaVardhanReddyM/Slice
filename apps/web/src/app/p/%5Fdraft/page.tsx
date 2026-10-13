import { DraftPreview } from "@/components/pages/draft-preview";

// /p/_draft: the console's live view of a page while the builder writes it.
// Empty until the builder canvas posts the draft (kit, css, html so far).

export const metadata = { title: "Draft", robots: { index: false, follow: false } };

export default function DraftPage() {
  return <DraftPreview />;
}
