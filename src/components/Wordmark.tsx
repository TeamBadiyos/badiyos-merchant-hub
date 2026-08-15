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

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <img
      src={appIcon.url}
      alt="badiyos"
      className={`shadow-brand size-12 rounded-2xl select-none ${className}`}
      draggable={false}
    />
  );
}
