import { cn } from "@/lib/utils";

/** Product image by URL. ProductThumb needs a full Product; rows only carry the src. */
export function Thumb({
  src,
  size = 32,
  className,
}: {
  src: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative block flex-none overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src && (
        // Merchant-hosted images; next/image would need every merchant CDN allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      )}
    </span>
  );
}
