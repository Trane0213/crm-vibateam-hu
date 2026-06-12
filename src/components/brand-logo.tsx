import logoAsset from "@/assets/viba-team-logo.png.asset.json";
import { cn } from "@/lib/utils";

type Variant = "full" | "mark";

/**
 * VIBA-TEAM brand logo. The source PNG is dark glyphs on transparent
 * background, so on dark surfaces we invert it. Wrap in a flex container
 * and set a height — width auto-scales to preserve aspect ratio.
 */
export function BrandLogo({
  variant = "full",
  className,
  onDark = false,
  alt = "VIBA-TEAM Kft",
}: {
  variant?: Variant;
  className?: string;
  /** Force the light (inverted) treatment regardless of theme. */
  onDark?: boolean;
  alt?: string;
}) {
  return (
    <img
      src={logoAsset.url}
      alt={alt}
      draggable={false}
      className={cn(
        "select-none object-contain",
        onDark ? "invert brightness-0" : "dark:invert dark:brightness-0",
        variant === "mark" && "aspect-square",
        className,
      )}
      style={onDark ? { filter: "invert(1) brightness(2)" } : undefined}
    />
  );
}