/**
 * Centralized colour tokens for the whole site.
 *
 * Two layers, deliberately separated:
 *
 *  1. SIGNATURE — the site's single identity colour, a warm copper/amber
 *     (AuraEyez's knob + PCB-trace origin tone). Every cross-cutting UI
 *     element that isn't tied to a project uses this and only this: nav
 *     hover/active, generic links, buttons, the Contact dock, the world-map
 *     highlights, the Experience timeline, the hero.
 *
 *  2. SECTION_COLORS — the five Designs sections, one *matched* jewel-toned
 *     family. Every hue is generated at the same soft register (S ≈ 52–60%,
 *     L ≈ 60–66%) so they read as siblings, arranged warm → cool down the
 *     page. None is fully saturated/neon; none is greyed out. Each is applied
 *     within its section to the model's accent points, the ambient glow, the
 *     tag pill, and the "View case study" link — one hue per section.
 *
 * Neutrals (graphite bodies in materials.tsx, the bg/fg in globals.css) are
 * NOT here — they're shared and unchanged. `rgb` is the space-free triplet
 * for `rgba(var(--glow-rgb), …)` and canvas fills.
 *
 * All six pass WCAG AA (≥4.5:1) as small text on the #060607 background:
 * amber 8.7, moss 9.9, teal 9.2, periwinkle 6.0, rose 6.6.
 */

export const SIGNATURE = "#D89E64"; // copper/amber — the site identity colour
export const SIGNATURE_RGB = "216,158,100";

export interface SectionColor {
  accent: string; // hex
  rgb: string; // "r,g,b" for rgba() glow + canvas
}

export const SECTION_COLORS: Record<
  "auraeyez" | "landrover" | "hxkeysair" | "corelink" | "arx",
  SectionColor
> = {
  auraeyez: { accent: "#D89E64", rgb: "216,158,100" }, // 01 · warm amber (anchor — the signature)
  landrover: { accent: "#83C25D", rgb: "131,194,93" }, // 02 · soft moss green
  hxkeysair: { accent: "#51BEC8", rgb: "81,190,200" }, // 03 · soft teal
  corelink: { accent: "#917EDD", rgb: "145,126,221" }, // 04 · soft periwinkle violet
  arx: { accent: "#DC7482", rgb: "220,116,130" }, // 05 · soft warm rose
};
