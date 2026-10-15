"use client";

// The iPhone 16 Pro frame (components/ui/iphone-16-pro) with live content on
// its screen: the email opened in Mail. The frame is drawn over the content
// with its glass left clear, so the Dynamic Island and the bezel sit on top
// the way they do on a real phone.

import type { ReactNode } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/console/setup/atoms";
import { EmailFrame } from "@/components/console/email/email-frame";
import { SenderMark } from "@/components/console/email/sender-mark";
import { Iphone16Pro } from "@/components/ui/iphone-16-pro";

/** The screen inside the 200×400 frame: the SVG's rect at (14.08, 12.81), 171.98 × 374.37, corner 24.62. */
const SCREEN = { left: 14.08 / 200, top: 12.81 / 400, width: 171.98 / 200, height: 374.37 / 400, rx: 24.62 / 171.98, ry: 24.62 / 374.37 };
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/** One iPhone point at this phone width (the screen is 390 points wide). */
const pointAt = (width: number) => (width * SCREEN.width) / 390;

/** An iPhone 16 Pro `width` px wide (twice as tall) with `children` on its screen. */
export function PhoneFrame({ width = 320, children, className }: { width?: number; children: ReactNode; className?: string }) {
  const pt = pointAt(width);
  return (
    <div className={cn("relative shrink-0 drop-shadow-[0_24px_32px_rgba(20,20,20,0.18)]", className)} style={{ width, height: width * 2 }}>
      <div
        className="absolute overflow-hidden bg-white"
        style={{ left: pct(SCREEN.left), top: pct(SCREEN.top), width: pct(SCREEN.width), height: pct(SCREEN.height), borderRadius: `${pct(SCREEN.rx)} / ${pct(SCREEN.ry)}` }}
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-neutral-950"
          style={{ bottom: 8 * pt, width: 134 * pt, height: 5 * pt }}
        />
      </div>
      <Iphone16Pro aria-hidden className="pointer-events-none absolute inset-0 size-full text-transparent" />
    </div>
  );
}

/** Time on the left of the Dynamic Island, signal and battery on the right. */
function StatusBar({ pt }: { pt: number }) {
  return (
    <div className="flex shrink-0 items-center justify-between font-semibold text-neutral-950" style={{ height: 54 * pt, padding: `0 ${30 * pt}px 0 ${36 * pt}px`, fontSize: 16 * pt }}>
      <span className="num">9:41</span>
      <span className="flex items-center" style={{ gap: 6 * pt }}>
        <span className="flex items-end" style={{ gap: 1.5 * pt, height: 11 * pt }}>
          {[0.4, 0.6, 0.8, 1].map((h) => (
            <span key={h} className="rounded-[1px] bg-neutral-950" style={{ width: 3 * pt, height: `${h * 100}%` }} />
          ))}
        </span>
        <span className="relative rounded-[3px] ring-1 ring-neutral-950/40" style={{ width: 24 * pt, height: 11.5 * pt, padding: 1.5 * pt }}>
          <span className="block size-full rounded-[1.5px] bg-neutral-950" />
        </span>
      </span>
    </div>
  );
}

export interface InboxMail {
  from: string;
  subject: string;
  preheader: string;
  /** The brand's icon or logo, for the sender's circle. */
  mark?: string;
  color?: string;
}

/** Mail's inbox with this brand's email on top, unread, and the rest of the inbox drawn as quiet placeholders. */
export function PhoneInbox({ width = 320, mail }: { width?: number; mail: InboxMail }) {
  const pt = pointAt(width);
  const bar = (w: number, h: number, className: string) => <span className={cn("block rounded-full", className)} style={{ width: w * pt, height: h * pt }} />;
  return (
    <PhoneFrame width={width}>
      <div className="flex h-full flex-col bg-white">
        <StatusBar pt={pt} />
        <div className="flex shrink-0 items-center text-sky-600" style={{ padding: `${2 * pt}px ${12 * pt}px`, fontSize: 16 * pt, gap: 2 * pt }}>
          <ChevronLeft style={{ width: 20 * pt, height: 20 * pt }} /> Mailboxes
        </div>
        <div className="font-bold tracking-tight text-neutral-950" style={{ padding: `${4 * pt}px ${16 * pt}px ${8 * pt}px`, fontSize: 32 * pt }}>
          Inbox
        </div>
        <div className="flex items-center rounded-full bg-neutral-100 text-neutral-400" style={{ margin: `0 ${16 * pt}px ${10 * pt}px`, height: 36 * pt, padding: `0 ${12 * pt}px`, gap: 6 * pt, fontSize: 16 * pt }}>
          <Search style={{ width: 16 * pt, height: 16 * pt }} /> Search
        </div>
        <div className="flex items-start border-b border-black/[0.06]" style={{ padding: `${12 * pt}px ${16 * pt}px`, gap: 12 * pt }}>
          <SenderMark name={mail.from} mark={mail.mark} color={mail.color} size={40 * pt} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between" style={{ gap: 6 * pt }}>
              <span className="truncate font-semibold text-neutral-950" style={{ fontSize: 16 * pt }}>
                {mail.from}
              </span>
              <span className="shrink-0 text-neutral-400" style={{ fontSize: 14 * pt }}>
                9:41
              </span>
            </div>
            <div className="truncate text-neutral-950" style={{ fontSize: 15 * pt, marginTop: 1 * pt }}>
              {mail.subject || "No subject"}
            </div>
            <div className="line-clamp-2 text-neutral-500" style={{ fontSize: 15 * pt, lineHeight: 1.3 }}>
              {mail.preheader}
            </div>
          </div>
        </div>
        {[0.62, 0.48, 0.7, 0.55].map((w, i) => (
          <div key={i} className="flex items-start border-b border-black/[0.04]" style={{ padding: `${14 * pt}px ${16 * pt}px`, gap: 12 * pt }}>
            <span className="shrink-0 rounded-full bg-neutral-100" style={{ width: 40 * pt, height: 40 * pt }} />
            <div className="min-w-0 flex-1" style={{ display: "grid", gap: 7 * pt, paddingTop: 3 * pt }}>
              {bar(120 * w + 40, 9, "bg-neutral-200")}
              {bar(260 * w, 8, "bg-neutral-100")}
              {bar(300 * w, 8, "bg-neutral-100")}
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/** The email opened in Mail: the sender and subject, then the email itself, scrolling under the status bar. */
export function PhoneEmail({ width = 320, mail, html }: { width?: number; mail: InboxMail; html: string | null | undefined }) {
  const pt = pointAt(width);
  return (
    <PhoneFrame width={width}>
      <div className="flex h-full flex-col bg-white">
        <StatusBar pt={pt} />
        <div className="flex shrink-0 items-center border-b border-black/[0.06]" style={{ padding: `${2 * pt}px ${12 * pt}px ${8 * pt}px` }}>
          <span className="flex items-center text-sky-600" style={{ fontSize: 16 * pt, gap: 2 * pt }}>
            <ChevronLeft style={{ width: 20 * pt, height: 20 * pt }} /> Inbox
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
          <div className="flex items-start" style={{ padding: `${12 * pt}px ${16 * pt}px`, gap: 10 * pt }}>
            <SenderMark name={mail.from} mark={mail.mark} color={mail.color} size={36 * pt} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between" style={{ gap: 6 * pt }}>
                <span className="truncate font-semibold text-neutral-950" style={{ fontSize: 15 * pt }}>
                  {mail.from}
                </span>
                <span className="shrink-0 text-neutral-400" style={{ fontSize: 13 * pt }}>
                  9:41
                </span>
              </div>
              <div className="text-neutral-500" style={{ fontSize: 13 * pt }}>
                To: you
              </div>
            </div>
          </div>
          <div className="font-semibold text-neutral-950" style={{ padding: `0 ${16 * pt}px ${12 * pt}px`, fontSize: 19 * pt, lineHeight: 1.25 }}>
            {mail.subject || "No subject"}
          </div>
          {html ? (
            <EmailFrame html={html} width={375} scale="fit" lazy={false} title="Phone preview" />
          ) : (
            <div className="flex items-center justify-center gap-2 text-neutral-500" style={{ height: 300 * pt, fontSize: 14 * pt }}>
              <Spinner className="size-4" /> Rendering
            </div>
          )}
          <div style={{ height: 30 * pt }} />
        </div>
      </div>
    </PhoneFrame>
  );
}
