import wordmarkOnDark from "@/assets/badiyos-wordmark-white.png.asset.json";
import wordmarkOnLight from "@/assets/badiyos-wordmark-purple.png.asset.json";

/**
 * The badiyos wordmark. `on` picks the variant that reads correctly against the
 * background it sits on: white text on dark/purple surfaces, purple text on light ones.
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
