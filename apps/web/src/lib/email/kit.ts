// The brand as the setup review and the brand kit edit it: one draft holding
// the kit, what the business does, the footer details and the sender, saved
// together. Defaults are a calm neutral kit for brands set up by hand.

import type { EmailAbout, EmailFont, EmailFooterInfo, EmailKit, EmailSender } from "@slice/backend/convex/emailTypes";
import { aboutOf, footerOf, kitOf, senderOf, slugify, type EmailBrand } from "./types";

export const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
export const SANS_FALLBACK = "Helvetica, Arial, sans-serif";

const font = (family: string, fallback: string): EmailFont => ({ family, fallback, google: true, weights: [400, 600, 700] });

export const EMPTY_KIT: EmailKit = {
  colors: {
    background: "#ffffff",
    foreground: "#1c1917",
    primary: "#1c1917",
    primaryForeground: "#ffffff",
    accent: "#f1ede4",
    muted: "#f5f5f4",
    surface: "#ffffff",
  },
  fonts: { heading: font("Inter", SANS_FALLBACK), body: font("Inter", SANS_FALLBACK) },
  buttonStyle: "rounded",
  radius: "md",
  uppercaseLabels: false,
  voice: { summary: "", do: [], avoid: [] },
};

export const EMPTY_ABOUT: EmailAbout = { summary: "", audience: "", categories: [] };
export const EMPTY_FOOTER: EmailFooterInfo = { address: "", website: "", socials: [] };

export interface BrandDraft {
  name: string;
  kit: EmailKit;
  about: EmailAbout;
  footer: EmailFooterInfo;
  sender: EmailSender;
}

/** A sender that reads like the brand when setup has not written one. */
export function defaultSender(name: string): EmailSender {
  return { fromName: name, fromLocal: "hello" };
}

export function draftOf(brand: EmailBrand): BrandDraft {
  const kit = kitOf(brand);
  return {
    name: brand.name,
    kit: kit ? { ...EMPTY_KIT, ...kit, colors: { ...EMPTY_KIT.colors, ...kit.colors }, fonts: { ...EMPTY_KIT.fonts, ...kit.fonts }, voice: { ...EMPTY_KIT.voice, ...kit.voice } } : EMPTY_KIT,
    about: { ...EMPTY_ABOUT, ...aboutOf(brand) },
    footer: { ...EMPTY_FOOTER, ...footerOf(brand), website: footerOf(brand)?.website ?? brand.url ?? "" },
    sender: senderOf(brand) ?? defaultSender(brand.name),
  };
}

/** The address part of a sender: what goes before the @. Letters, digits and . _ + - only. */
export const cleanLocal = (s: string) => s.toLowerCase().replace(/[^a-z0-9._+-]/g, "");

/** Where a brand's mail appears to come from, for previews: its domain, else its website's host. */
export function senderDomain(brand: Pick<EmailBrand, "url" | "slug" | "sender"> & { domain?: { name: string } | null }) {
  if (brand.domain?.name) return brand.domain.name;
  // A site on localhost (the demo shops) says nothing about the address; the reply-to inbox does (as emailBrands.sendingInfoFor).
  const replyDomain = brand.sender?.replyTo?.split("@")[1]?.trim().toLowerCase();
  if (replyDomain) return replyDomain;
  try {
    if (brand.url) {
      const host = new URL(brand.url.startsWith("http") ? brand.url : `https://${brand.url}`).hostname.replace(/^www\./, "");
      if (!/(^|\.)localhost$|^127\.|^\[?::1/.test(host)) return host;
    }
  } catch {
    // fall through
  }
  return `${slugify(brand.slug)}.com`;
}

/** Popular Google families that read well in email, offered as suggestions in the font fields. */
export const FONT_SUGGESTIONS = [
  "Inter",
  "DM Sans",
  "Work Sans",
  "Karla",
  "Manrope",
  "Nunito Sans",
  "Poppins",
  "Montserrat",
  "Space Grotesk",
  "Fraunces",
  "Playfair Display",
  "Lora",
  "Libre Baskerville",
  "Source Serif 4",
  "EB Garamond",
  "Cormorant Garamond",
  "Merriweather",
  "DM Serif Display",
];
