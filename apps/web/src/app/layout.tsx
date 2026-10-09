import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Only for code snippets (the install embed).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Slice", template: "%s · Slice" },
  description:
    "Taste-aware concierge agents for every storefront, powered by Qloo.",
};

// Providers live in the route-group layouts: (app) gets Clerk + Convex,
// embed gets anonymous Convex only (it runs inside merchants' iframes).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
