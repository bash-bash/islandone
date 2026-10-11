import type { SimResult } from "../sim";
import { WEATHER_KINDS, type WeatherKind } from "../world/weather";

/**
 * Per-run metrics (Handoff §30, §36). Metrics that later stages will
 * provide are listed in PENDING_METRICS instead of being faked.
 */
export interface RunMetrics {
  seed: number;
  days: number;
  fingerprint: string;
  eventCount: number;
  idleRate: number;
  weatherDays: Record<WeatherKind, number>;
}

export const PENDING_METRICS = [
  "survival",
  "hypotheses",
  "capabilityGaps",
  "strategyChanges",
  "learningEvents",
] as const;

export function computeMetrics(result: SimResult): RunMetrics {
  const weatherDays = Object.fromEntries(WEATHER_KINDS.map((k) => [k, 0])) as Record<WeatherKind, number>;
  for (const e of result.log.all()) {
    if (e.type === "weather.day") weatherDays[e.data!.weather as WeatherKind]++;
  }
  const idle = result.actionTicks.idle ?? 0;
  return {
    seed: result.seed,
    days: result.days,
    fingerprint: result.fingerprint,
    eventCount: result.eventCount,
    idleRate: idle / result.ticks,
    weatherDays,
  };
}
