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
          ? "invert brightness-200"
          : "dark:invert dark:brightness-200",
        className,
      )}
    />
  );
}