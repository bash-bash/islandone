import type { Rng } from "../core/rng";

/**
 * Daily weather (Handoff §11). Placeholder for stage 2: chance decides the
 * weather of a day; consequences (driftwood, wet wood, fire going out)
 * will be computed from it causally, never spawned directly.
 */
export const WEATHER_KINDS = ["clear", "cloudy", "rain", "storm", "heat"] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** Day-to-day transition weights: weather tends to persist. Order is fixed for determinism. */
const TRANSITIONS: Record<WeatherKind, ReadonlyArray<readonly [WeatherKind, number]>> = {
  clear: [["clear", 5], ["cloudy", 3], ["rain", 1], ["storm", 0.2], ["heat", 1.5]],
  cloudy: [["clear", 3], ["cloudy", 3], ["rain", 2.5], ["storm", 0.6], ["heat", 0.5]],
  rain: [["clear", 2], ["cloudy", 3], ["rain", 3], ["storm", 0.8], ["heat", 0.2]],
  storm: [["clear", 1], ["cloudy", 3], ["rain", 3], ["storm", 0.5], ["heat", 0]],
  heat: [["clear", 3], ["cloudy", 1.5], ["rain", 0.5], ["storm", 0.4], ["heat", 3]],
};

export function nextWeather(current: WeatherKind, rng: Rng): WeatherKind {
  return rng.weighted(TRANSITIONS[current]);
}
