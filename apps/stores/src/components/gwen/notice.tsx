import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Mark } from "./logo";

/**
 * A push notification from the Gwen app, the way it would land on a lock
 * screen: app row, gold icon tile, title, detail and the amount.
 */
export function Notice({
  icon: Icon,
  title,
  detail,
  amount,
  when = "now",
  className,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  amount?: string;
  when?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-[300px] rounded-[24px] bg-white/[0.86] p-3 pr-4 ring-1 ring-white backdrop-blur-xl",
        "shadow-[0_1px_0_rgb(255_255_255/0.9)_inset,0_24px_48px_-20px_rgb(12_15_29/0.35),0_6px_14px_-8px_rgb(12_15_29/0.2)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 pl-1">
        <span className="grid size-[18px] place-items-center rounded-[5px] bg-gw-ink">
          <Mark size={11} />
        </span>
        <span className="text-[11.5px] font-semibold text-gw-ink/55">Gwen</span>
        <span className="ml-auto text-[11.5px] text-gw-soft">{when}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-[14px] text-[#8a6420]"
          style={{
            background: "linear-gradient(160deg, #fff8e6 0%, #f4e4b8 100%)",
            boxShadow: "inset 0 0 0 1px rgb(214 176 92 / 0.45), 0 1px 0 rgb(255 255 255 / 0.9) inset",
          }}
        >
          <Icon className="size-[18px]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[14.5px] font-semibold text-gw-ink">{title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-gw-mute">{detail}</span>
        </span>
        {amount && <span className="gw-num shrink-0 text-[15px] font-semibold text-gw-ink">{amount}</span>}
      </div>
    </div>
  );
}
