import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { Landing } from "@/components/landing/landing";

// Headlines only; body copy stays on the app's Inter.
const serif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { absolute: "Slice: agents, with taste" },
  description:
    "Five AI agents for ads, landing pages, email, in-store shopping and your Mac. Every pick starts from what people love, through Qloo's taste graph.",
};

export default function Home() {
  return (
    <div className={serif.variable}>
      <Landing />
    </div>
  );
}
