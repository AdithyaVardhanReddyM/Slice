import type { ReactNode } from "react";
import { Iphone16Pro } from "@/components/ui/iphone-16-pro";
import { MacbookPro } from "@/components/ui/macbook-pro";
import { cn } from "@/lib/utils";

/**
 * The iPhone 16 Pro frame with live content on its screen. The frame's own screen rect is
 * covered by an HTML layer at the same spot, and the Dynamic Island is drawn again on top.
 */
export function PhoneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[1/2]", className)}>
      <Iphone16Pro className="absolute inset-0 size-full text-white" />
      <div
        className="absolute overflow-hidden bg-white"
        style={{
          left: "7.04%",
          top: "3.2%",
          width: "85.99%",
          height: "93.59%",
          borderRadius: "14.3% / 6.58%",
        }}
      >
        {children}
      </div>
      <div
        className="absolute rounded-full bg-black"
        style={{ left: "36.35%", top: "4.47%", width: "27.45%", height: "3.99%" }}
      />
    </div>
  );
}

/** The MacBook Pro frame with HTML on its screen and the notch drawn over it. */
export function LaptopFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[650/400]", className)}>
      <MacbookPro className="absolute inset-0 size-full text-black" />
      <div
        className="absolute overflow-hidden rounded-[0.6%] [container-type:inline-size]"
        style={{ left: "11.465%", top: "5.33%", width: "77.11%", height: "80.96%" }}
      >
        {children}
      </div>
      <div
        className="absolute rounded-b-[30%] bg-black"
        style={{ left: "45.87%", top: "5.25%", width: "8.32%", height: "2.33%" }}
      />
    </div>
  );
}

const KEY_INSET =
  "rgb(13, 13, 15) 0px -0.5px 2px 0px inset, rgb(13, 13, 15) -0.5px 0px 2px 0px inset";

function Key({
  top,
  bottom,
  wide,
  press,
}: {
  top: ReactNode;
  bottom: ReactNode;
  wide?: boolean;
  press?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[9px] bg-white/[0.2] p-px shadow-md shadow-white/20",
        press && "landing-key",
      )}
    >
      <div
        className={cn(
          "landing-key-cap flex h-[52px] flex-col justify-between rounded-[8px] bg-[#0A090D] px-2 py-1.5 text-[10px] text-white sm:h-[60px] sm:text-[11px]",
          wide ? "w-[78px] sm:w-[92px]" : "w-[52px] sm:w-[60px]",
        )}
        style={{ boxShadow: KEY_INSET }}
      >
        <div className="flex justify-end">{top}</div>
        <div className="flex justify-start">{bottom}</div>
      </div>
    </div>
  );
}

function Globe() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
    >
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M3.6 9h16.8" />
      <path d="M3.6 15h16.8" />
      <path d="M11.5 3a17 17 0 0 0 0 18" />
      <path d="M12.5 3a17 17 0 0 1 0 18" />
    </svg>
  );
}

/**
 * The bottom-left corner of a MacBook keyboard (kaif-ui's MacBook Keyboard keys), with
 * fn and control pressing down on a loop next to a voice meter.
 */
export function TalkKeys({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <div className="flex gap-[3px] rounded-[14px] bg-zinc-800 p-[5px]">
        <Key press top="fn" bottom={<Globe />} />
        <Key press top="⌃" bottom="control" />
        <Key top="⌥" bottom="option" />
        <Key wide top="⌘" bottom="command" />
        <div className="w-[60px] rounded-l-[9px] bg-white/[0.12] p-px sm:w-[150px]">
          <div
            className="h-full rounded-l-[8px] bg-[#0A090D]"
            style={{ boxShadow: KEY_INSET }}
          />
        </div>
      </div>
      <div className="flex h-9 items-center gap-3 rounded-full bg-white/10 px-4 text-sm text-white/70 ring-1 ring-white/10">
        <span className="flex h-4 items-center gap-[3px]">
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="landing-wave h-full w-[3px] rounded-full bg-brand-yellow"
              style={{ animationDelay: `${(i % 5) * 0.11}s` }}
            />
          ))}
        </span>
        Hold fn and control, then talk
      </div>
    </div>
  );
}
