import type { Observation } from "../mind/types";
import type { WorldState } from "../world/world";

/**
 * The only channel from the objective world to the character.
 * Translates world truth into perceivable features (Handoff §5).
 * Stage 1 only perceives the sky; stage 3 adds objects and places.
 */
export function perceive(tick: number, world: WorldState, previous: WorldState["weather"] | null): Observation[] {
  if (world.weather === previous) return [];
  return [{ tick, kind: "sky", features: SKY_FEATURES[world.weather] }];
}

const SKY_FEATURES: Record<WorldState["weather"], Observation["features"]> = {
  clear: { sky: "bright", wet: false, wind: "calm" },
  cloudy: { sky: "grey", wet: false, wind: "light" },
  rain: { sky: "grey", wet: true, wind: "light" },
  storm: { sky: "dark", wet: true, wind: "strong" },
  heat: { sky: "bright", wet: false, wind: "calm", hot: true },
};
