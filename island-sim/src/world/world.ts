import type { WeatherKind } from "./weather";

/**
 * Objective world state: the simulation's truth (Handoff §4, §5).
 * The character never reads this directly; it only gets observations
 * produced by src/perception.
 */
export interface WorldState {
  weather: WeatherKind;
}

export function createWorld(): WorldState {
  return { weather: "clear" };
}
