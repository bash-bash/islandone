import type { Item } from "./items";
import type { ThingKind } from "./island";

/**
 * How well a piece helps with a food source, computed from physical
 * properties only (Handoff §4, §5). There is no list of "correct tools":
 * a heavy hard stone cracks a hard shell because of mass and hardness,
 * a long sharp piece reaches and pierces a darting fish because of length
 * and sharpness. Bad but understandable ideas simply get low chances.
 *
 * Returns the success chance for one attempt (bare hands: tool = null).
 */
export function attemptChance(kind: ThingKind, tool: Item | null): number | null {
  const mass = tool?.mass ?? 0;
  const hardness = tool?.hardness ?? 0;
  const sharp = tool?.sharpness ?? 0;
  const reach = tool ? clamp01((tool.length - 0.3) / 1.4) : 0;
  switch (kind) {
    case "coconut_palm":
      // Cracking a hard shell needs a hard, heavy striking piece; an edge helps a little.
      return clamp01(0.03 + 0.55 * Math.min(1, mass / 0.9) * hardness + 0.2 * sharp * hardness);
    case "fish":
      // Darting fish: reach and a point.
      return clamp01(0.06 + 0.55 * reach * sharp + 0.06 * reach);
    case "shellfish":
      // Prying shells off rock: a thin hard edge helps.
      return clamp01(0.5 + 0.45 * Math.min(1, sharp * 1.6) * hardness);
    default:
      return null;
  }
}

/** Chance that a bound joint comes apart during one use. */
export function jointBreakChance(tool: Item): number {
  if (tool.jointStrength === undefined) return 0;
  return 0.15 * (1 - tool.jointStrength);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
