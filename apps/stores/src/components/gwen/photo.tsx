import { cn } from "cn";

export function Photo({
  src,
  alt,
  className,
  priority,
  position,
}: {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  position?: string;
}) {
  if (!src) return <div role="img" aria-label={alt} className={cn("h-full w-full bg-gw-mist", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      style={position ? { objectPosition: position } : undefined}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
