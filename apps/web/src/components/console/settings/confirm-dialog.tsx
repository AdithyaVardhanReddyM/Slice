"use client";

import { useId, useState, type ReactElement, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Confirmation for irreversible actions. With `confirmText`, the merchant has
 * to type it before the action unlocks.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  actionLabel,
  confirmText,
  destructive = true,
  onConfirm,
}: {
  trigger: ReactElement;
  title: ReactNode;
  description: ReactNode;
  actionLabel: string;
  confirmText?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const locked = Boolean(confirmText) && typed !== confirmText;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmText && (
          <div className="space-y-2">
            <Label
              htmlFor={inputId}
              className="block leading-normal font-normal"
            >
              Type <span className="font-medium">{confirmText}</span> to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={locked}
            onClick={() => {
              onConfirm();
              setOpen(false);
              setTyped("");
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
