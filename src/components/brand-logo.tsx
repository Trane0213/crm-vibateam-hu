import logoAsset from "@/assets/viba-team-logo.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * VIBA-TEAM brand logo. The PNG has dark glyphs on a transparent
 * background — on dark surfaces we invert it to white. Set a height via
 * className; width auto-scales to preserve the aspect ratio.
 */
export function BrandLogo({
  className,
  onDark = false,
  alt = "VIBA-TEAM Kft",
}: {
  className?: string;
  /** Force the white treatment regardless of the current theme. */
  onDark?: boolean;
  alt?: string;
}) {
  return (
    <img
      src={logoAsset.url}
      alt={alt}
      draggable={false}
      className={cn(
        "select-none object-contain w-auto",
        onDark
          ? "[filter:invert(1)_brightness(2)]"
          : "dark:[filter:invert(1)_brightness(2)]",
        className,
      )}
    />
  );
}