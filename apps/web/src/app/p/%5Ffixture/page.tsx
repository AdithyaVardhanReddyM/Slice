import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { HeroSection } from "@slice/backend/convex/pagesTypes";
import { PageRenderer } from "@/components/pages/render-doc";
import { QuizBar } from "@/components/pages/quiz-bar";
import { fixtureBrand, fixtureDoc, fixtureKit, fixtureQuiz } from "@/components/pages/fixture";

// Dev-only visual check of the renderer at /p/_fixture (no Convex).
// ?hero=split|centered flips the hero layout; ?quiz=0 hides the quiz bar;
// ?dark=1 previews an inverted brand palette.

export const metadata = { title: "Pages fixture", robots: { index: false } };

export default function FixturePage(props: PageProps<"/p/_fixture">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <Fixture {...props} />
    </Suspense>
  );
}

async function Fixture({ searchParams }: PageProps<"/p/_fixture">) {
  const sp = await searchParams;
  const heroLayout = sp.hero === "split" || sp.hero === "centered" ? sp.hero : undefined;
  const doc = heroLayout
    ? { ...fixtureDoc, sections: fixtureDoc.sections.map((s) => (s.type === "hero" ? ({ ...s, layout: heroLayout } as HeroSection) : s)) }
    : fixtureDoc;
  const kit =
    sp.dark === "1"
      ? { ...fixtureKit, colors: { ...fixtureKit.colors, background: "#1C1411", foreground: "#F4EBDD", surface: "#271C17", muted: "#2E221C", accent: "#C98A4B" } }
      : fixtureKit;

  return (
    <PageRenderer
      brand={fixtureBrand}
      kit={kit}
      doc={doc}
      variantId="fixture-variant"
      pageId="fixture"
      trackingMeta={{ resolvedBy: "preview", disabled: true }}
      quiz={sp.quiz === "0" ? null : <QuizBar pageId="fixture" quiz={fixtureQuiz} audienceIds={["austin", "portland", "seattle"]} />}
    />
  );
}
