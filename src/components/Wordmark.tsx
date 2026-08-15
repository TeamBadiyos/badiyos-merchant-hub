import appIcon from "@/assets/badiyos-app-icon.png.asset.json";
import wordmarkOnDark from "@/assets/badiyos-logo-on-dark.png.asset.json";
import wordmarkOnLight from "@/assets/badiyos-logo-on-light.png.asset.json";

/**
 * The badiyos wordmark. `on` picks the variant that reads correctly against the
 * background it sits on: white text on dark/green surfaces, green text on light ones.
 */
export function Wordmark({
  className = "",
  on = "dark",
}: {
  className?: string;
  on?: "dark" | "light";
}) {
  return (
    <img
      src={on === "dark" ? wordmarkOnDark.url : wordmarkOnLight.url}
      alt="badiyos"
      className={`h-7 w-auto select-none ${className}`}
      draggable={false}
    />
  );
}

export function BrandMark({
  className = "",
  on = "dark",
}: {
  className?: string;
  /** On green/dark surfaces the icon sits on a white chip so the mark keeps contrast. */
  on?: "dark" | "light";
}) {
  return (
    <span
      className={`shadow-brand inline-flex size-12 items-center justify-center overflow-hidden rounded-2xl ${
        on === "dark" ? "bg-primary-foreground p-1" : ""
      } ${className}`}
    >
      <img
        src={appIcon.url}
        alt="badiyos"
        className="size-full rounded-xl select-none"
        draggable={false}
      />
    </span>
  );
}
