"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, RotateCw } from "lucide-react";
import { Badge } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/format";
import { hash } from "@/lib/mock/random";
import { ConfirmDialog } from "./confirm-dialog";

export interface KeyInfo {
  publicKey: string;
  secretKey: string;
  createdAt: string;
  secretLastUsed: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={copied ? "Copied" : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard blocked (insecure context); nothing to do in the mock.
        }
      }}
    >
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
    </Button>
  );
}

const mask = (key: string) =>
  `${key.slice(0, 12)}${"•".repeat(16)}${key.slice(-4)}`;

export function ApiKeys({ keys }: { keys: KeyInfo }) {
  const [reveal, setReveal] = useState(false);
  const [secret, setSecret] = useState(keys.secretKey);
  const [rotatedAt, setRotatedAt] = useState<string | null>(null);
  const [rotations, setRotations] = useState(0);

  const rotate = () => {
    const n = rotations + 1;
    const tail = hash(`${keys.secretKey}:${n}`).toString(36).padStart(7, "0");
    const head = hash(`${keys.publicKey}:${n}`).toString(36);
    setSecret(
      `${keys.secretKey.slice(0, 12)}${head}${tail}`.slice(
        0,
        keys.secretKey.length,
      ),
    );
    setRotations(n);
    setRotatedAt("just now");
    setReveal(true);
  };

  return (
    <div className="divide-y">
      <KeyRow
        label="Publishable key"
        hint="Safe to ship in the embed snippet. Identifies the widget, nothing more."
        value={keys.publicKey}
        badge={<Badge tone="outline">Public</Badge>}
        meta={`Created ${fmt.date(keys.createdAt)}`}
        actions={<CopyButton value={keys.publicKey} label="publishable key" />}
      />
      <KeyRow
        label="Secret key"
        hint="Server-to-server only: catalog sync and conversation export. Never put it in client code."
        value={reveal ? secret : mask(secret)}
        badge={
          <>
            <Badge tone="warn">Secret</Badge>
            {rotatedAt && <Badge tone="ok">New key</Badge>}
          </>
        }
        meta={
          rotatedAt
            ? `Rotated ${rotatedAt}, old key revoked`
            : `Created ${fmt.date(keys.createdAt)}, last used ${fmt.ago(keys.secretLastUsed)}`
        }
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={reveal ? "Hide secret key" : "Reveal secret key"}
              onClick={() => setReveal((r) => !r)}
            >
              {reveal ? <EyeOff /> : <Eye />}
            </Button>
            <CopyButton value={secret} label="secret key" />
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  <RotateCw />
                  Rotate
                </Button>
              }
              title="Rotate the secret key?"
              description="The current key stops working immediately. Anything that syncs your catalog or exports conversations needs the new key before its next run."
              actionLabel="Rotate key"
              onConfirm={rotate}
            />
          </>
        }
      />
    </div>
  );
}

function KeyRow({
  label,
  hint,
  value,
  badge,
  meta,
  actions,
}: {
  label: string;
  hint: string;
  value: string;
  badge: ReactNode;
  meta: string;
  actions: ReactNode;
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {badge}
      </div>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={value}
          aria-label={label}
          className="min-w-0 flex-1 bg-muted/50"
        />
        <div className="flex flex-none items-center gap-2">{actions}</div>
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{hint}</span>
        <span className="num">{meta}</span>
      </div>
    </div>
  );
}
