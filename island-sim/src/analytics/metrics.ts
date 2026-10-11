import { TICKS_PER_DAY } from "../core/time";
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
  /** 1 if alive at the end, else 0. */
  survived: number;
  /** Days lived (fractional). */
  survivalDays: number;
  deathCause: string | null;
  minHealth: number;
  /** Awake ticks without any goal / all awake ticks. */
  idleRate: number;
  /** Share of all ticks per purpose. */
  timeShare: Record<string, number>;
  placesVisited: number;
  /** Hours until the first drink of fresh water; null if never. */
  hoursToFreshWater: number | null;
  seawaterDrinks: number;
  redBerryMeals: number;
  foodAttempts: number;
  foodSuccesses: number;
  /** Categories of things the character distinguished by look. */
  categoriesDiscovered: number;
  /** Beliefs (category × action × effect) with at least one piece of evidence. */
  beliefsFormed: number;
  /**
   * Learning events (plan §8): distinct pieces of learning that changed at least
   * one later decision, counted as distinct (need, chosen category, category
   * instinct would have chosen) combinations.
   */
  learningEvents: number;
  /** Decisions that came out differently than instinct alone would have chosen. */
  decisionsShapedByLearning: number;
  weatherDays: Record<WeatherKind, number>;
}

export const PENDING_METRICS = ["hypotheses", "capabilityGaps", "strategyChanges"] as const;

const PURPOSES = ["sleep", "drink", "eat", "explore", "shelter", "rest", "idle"] as const;

export function computeMetrics(result: SimResult): RunMetrics {
  const weatherDays = Object.fromEntries(WEATHER_KINDS.map((k) => [k, 0])) as Record<WeatherKind, number>;
  const visited = new Set<string>(["p1"]);
  let hoursToFreshWater: number | null = null;
  let seawaterDrinks = 0;
  let redBerryMeals = 0;
  let foodAttempts = 0;
  let foodSuccesses = 0;
  let categoriesDiscovered = 0;
  let beliefsFormed = 0;
  let decisionsShapedByLearning = 0;
  const learning = new Set<string>();

  for (const e of result.log.all()) {
    const d = e.data ?? {};
    if (e.type === "weather.day") weatherDays[d.weather as WeatherKind]++;
    if (e.type === "category.discovered") categoriesDiscovered++;
    if (e.type === "belief.formed") beliefsFormed++;
    if (e.type === "learning.applied") {
      decisionsShapedByLearning++;
      learning.add(`${d.use}|${d.chosen}|${d.instead}`);
    }
    if (e.type !== "action.end") continue;
    if (d.kind === "move" && d.success) visited.add(d.place as string);
    if (d.kind === "drink" && d.success) {
      if (d.thingKind === "spring" && hoursToFreshWater === null) hoursToFreshWater = round(e.tick / 60, 1);
      if (d.thingKind === "sea") seawaterDrinks++;
    }
    if (d.kind === "eat") {
      foodAttempts++;
      if (d.success) foodSuccesses++;
      if (d.success && d.thingKind === "red_berry_bush") redBerryMeals++;
    }
  }

  const ticks = result.ticks;
  const sleep = result.purposeTicks.sleep ?? 0;
  const awake = Math.max(1, ticks - sleep);
  const timeShare: Record<string, number> = {};
  for (const p of PURPOSES) timeShare[p] = round((result.purposeTicks[p] ?? 0) / Math.max(1, ticks), 4);
  const death = result.world.death;

  return {
    seed: result.seed,
    days: result.days,
    fingerprint: result.fingerprint,
    eventCount: result.eventCount,
    survived: death ? 0 : 1,
    survivalDays: round((death ? death.tick : ticks) / TICKS_PER_DAY, 2),
    deathCause: death?.cause ?? null,
    minHealth: round(result.minHealth, 1),
    idleRate: round((result.purposeTicks.idle ?? 0) / awake, 4),
    timeShare,
    placesVisited: visited.size,
    hoursToFreshWater,
    seawaterDrinks,
    redBerryMeals,
    foodAttempts,
    foodSuccesses,
    categoriesDiscovered,
    beliefsFormed,
    learningEvents: learning.size,
    decisionsShapedByLearning,
    weatherDays,
  };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
