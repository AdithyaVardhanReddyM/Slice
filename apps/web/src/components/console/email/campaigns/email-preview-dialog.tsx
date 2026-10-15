"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PillTabs } from "@/components/console/home/ui";
import { Spinner } from "@/components/console/setup/atoms";
import { EmailFrame } from "@/components/console/email/email-frame";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * An email at full size, desktop or phone width, under its inbox line
 * (subject and preheader). Used for template previews and for one person's
 * version of a campaign. `html` null shows a loading state.
 */
export function EmailPreviewDialog({
  open,
  onOpenChange,
  title,
  description,
  html,
  subject,
  preheader,
  from,
  aside,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  html: string | null | undefined;
  subject?: string;
  preheader?: string;
  from?: string;
  /** Beside the email on wide screens: who it is for, why it changed. */
  aside?: ReactNode;
  footer?: ReactNode;
}) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const width = device === "desktop" ? 600 : 375;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-semibold">{title}</DialogTitle>
            {description && <DialogDescription className="truncate">{description}</DialogDescription>}
          </div>
          <PillTabs
            label="Device"
            size="sm"
            value={device}
            onChange={setDevice}
            options={[
              {
                value: "desktop",
                label: (
                  <>
                    <Monitor className="size-3.5" /> Desktop
                  </>
                ),
              },
              {
                value: "phone",
                label: (
                  <>
                    <Smartphone className="size-3.5" /> Phone
                  </>
                ),
              },
            ]}
          />
        </div>
        <div className={cn("grid min-h-0 flex-1 overflow-hidden", aside && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
          <div className="min-h-0 overflow-y-auto bg-neutral-100 px-4 py-6">
            {(subject || preheader) && (
              <div className="mx-auto mb-4 rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-black/[0.05]" style={{ maxWidth: width }}>
                {from && <div className="truncate text-xs font-semibold text-neutral-950">{from}</div>}
                <div className="truncate font-medium text-neutral-950">{subject || "No subject"}</div>
                {preheader && <div className="truncate text-muted-foreground">{preheader}</div>}
              </div>
            )}
            <div className={cn("mx-auto overflow-hidden bg-white shadow-sm ring-1 ring-black/[0.05]", device === "phone" ? "rounded-[28px]" : "rounded-lg")} style={{ maxWidth: width }}>
              {html ? (
                <EmailFrame key={device} html={html} width={width} scale={1} lazy={false} title="Email preview" />
              ) : (
                <div className="flex h-96 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> Rendering
                </div>
              )}
            </div>
          </div>
          {aside && <aside className="hidden min-h-0 overflow-y-auto border-l p-5 lg:block">{aside}</aside>}
        </div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
