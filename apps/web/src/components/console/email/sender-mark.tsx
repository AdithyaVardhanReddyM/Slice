"use client";

import { useState } from "react";

/**
 * The sender's circle in an inbox: the brand's icon or logo on white, or its
 * first letter on the brand colour when there is no mark (or it fails to load).
 */
export function SenderMark({ name, mark, color, size }: { name: string; mark?: string; color?: string; size: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-1 ring-black/[0.06]"
      style={{ width: size, height: size, fontSize: size * 0.42, background: mark && !broken ? "#fff" : (color ?? "#171717") }}
    >
      {mark && !broken ? (
        // The brand's own logo host; next/image would need it allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mark} alt="" className="size-full object-contain p-[14%]" onError={() => setBroken(true)} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
