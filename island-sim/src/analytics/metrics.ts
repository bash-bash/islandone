import { TICKS_PER_DAY } from "../core/time";
import { CHANGES } from "../mind/thinking";
import type { SimResult } from "../sim";
import { WEATHER_KINDS, type WeatherKind } from "../world/weather";

/** Per-run metrics (Handoff §30, §36). */
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
  problemsCreated: number;
  problemsSolved: number;
  problemsReopened: number;
  hypothesesProposed: number;
  /** Hypotheses with at least one experiment result. */
  hypothesesTested: number;
  hypothesesSupported: number;
  hypothesesRefuted: number;
  hypothesesDropped: number;
  /** Switches to another hypothesis for the same problem. */
  strategyChanges: number;
  /** Pieces tied together and things built (Handoff §13). */
  constructions: number;
  /** Successful meals obtained with a tool. */
  toolMeals: number;
  /** Hours spent soaked (wetness > 0.5). */
  soakedHours: number;
  /** Thoughts the character had (stage 5; 0 with the built-in rules). */
  thoughts: number;
  /** Times something glowing flared up into a flame. */
  firesLit: number;
  /** Hours until the first flame; null if never. */
  hoursToFirstFire: number | null;
  /** Times the thinker said it was stuck with an approach (Handoff §5), and what it changed. */
  strategyFatigue: number;
  fatigueChanges: Record<string, number>;
  /** Capability gaps the thinker named (Handoff §7): opened, later met, still open at the end. */
  capabilityGapsOpened: number;
  capabilityGapsClosed: number;
  capabilityGapsOpen: number;
  /**
   * The most times one planned step was done again without bringing any result
   * it had not brought before. Measured, never shown to the character: it tells whether the
   * thinker noticed being stuck (strategyFatigue) or kept going regardless.
   */
  longestSameTry: number;
  weatherDays: Record<WeatherKind, number>;
}

const PURPOSES = ["sleep", "drink", "eat", "explore", "shelter", "rest", "idle", "experiment", "work", "plan"] as const;

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
  const count: Record<string, number> = {};
  const tested = new Set<unknown>();
  const solved = new Set<unknown>();
  let toolMeals = 0;
  let firesLit = 0;
  let hoursToFirstFire: number | null = null;
  const fatigueChanges = Object.fromEntries(CHANGES.map((c) => [c, 0])) as Record<string, number>;
  let longestSameTry = 0;
  const sameTry = new Map<string, { results: Set<string>; sinceNew: number }>();

  for (const e of result.log.all()) {
    const d = e.data ?? {};
    if (e.type === "weather.day") weatherDays[d.weather as WeatherKind]++;
    if (e.type === "category.discovered") categoriesDiscovered++;
    if (e.type === "belief.formed") beliefsFormed++;
    count[e.type] = (count[e.type] ?? 0) + 1;
    if (e.type === "experiment.result") tested.add(d.hypothesis);
    if (e.type === "problem.solved") solved.add(d.problem);
    if (e.type === "action.end" && d.kind === "eat" && d.success && e.data && "tool" in e.data && e.data.tool) toolMeals++;
    if (e.type === "learning.applied") {
      decisionsShapedByLearning++;
      learning.add(`${d.use}|${d.chosen}|${d.instead}`);
    }
    if (e.type === "strategy.fatigue") fatigueChanges[d.change as string]! += 1;
    if (e.type !== "action.end") continue;
    if (typeof d.step === "string" && d.kind !== "move" && d.kind !== "idle") {
      const outcome = String(d.rub ?? d.put ?? d.success);
      const tried = sameTry.get(d.step) ?? { results: new Set<string>(), sinceNew: 0 };
      tried.sinceNew = tried.results.has(outcome) ? tried.sinceNew + 1 : 0;
      tried.results.add(outcome);
      sameTry.set(d.step, tried);
      longestSameTry = Math.max(longestSameTry, tried.sinceNew);
    }
    if (d.put === "flared up") {
      firesLit++;
      if (hoursToFirstFire === null) hoursToFirstFire = round(e.tick / 60, 1);
    }
    if (d.kind === "move" && d.success) visited.add(d.place as string);
    if (d.kind === "bind" && d.success) count["action.end.bind"] = (count["action.end.bind"] ?? 0) + 1;
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
    problemsCreated: count["problem.created"] ?? 0,
    problemsSolved: solved.size,
    problemsReopened: count["problem.reopened"] ?? 0,
    hypothesesProposed: count["hypothesis.proposed"] ?? 0,
    hypothesesTested: tested.size,
    hypothesesSupported: count["hypothesis.supported"] ?? 0,
    hypothesesRefuted: count["hypothesis.refuted"] ?? 0,
    hypothesesDropped: count["hypothesis.dropped"] ?? 0,
    strategyChanges: count["strategy.changed"] ?? 0,
    constructions: (count["action.end.bind"] ?? 0) + (count["construction.built"] ?? 0),
    toolMeals,
    soakedHours: round(result.soakedTicks / 60, 1),
    thoughts: count["thought"] ?? 0,
    firesLit,
    hoursToFirstFire,
    strategyFatigue: count["strategy.fatigue"] ?? 0,
    fatigueChanges,
    capabilityGapsOpened: count["gap.opened"] ?? 0,
    capabilityGapsClosed: count["gap.closed"] ?? 0,
    capabilityGapsOpen: (count["gap.opened"] ?? 0) - (count["gap.closed"] ?? 0),
    longestSameTry,
    weatherDays,
  };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/**
 * What the thinker said in its own words over a run, for the report and the
 * Creator Backlog (Handoff §9): the capability gaps it named and the lessons
 * it drew. Kept out of RunMetrics because it is text, not a number.
 */
export interface RunWords {
  gaps: { id: string; day: number; problem: string; wants: string[]; closed: boolean }[];
  lessons: { id: string; day: number; learned: string; used: boolean }[];
  firstThoughts: string[];
}

export function runWords(result: SimResult): RunWords {
  const gaps: RunWords["gaps"] = [];
  const lessons: RunWords["lessons"] = [];
  const firstThoughts: string[] = [];
  for (const e of result.log.all()) {
    const d = e.data ?? {};
    if (e.type === "gap.opened") gaps.push({ id: d.id as string, day: d.day as number, problem: d.problem as string, wants: d.wants as string[], closed: false });
    if (e.type === "gap.closed") for (const g of gaps) if (g.id === d.id) g.closed = true;
    if (e.type === "lesson") lessons.push({ id: d.id as string, day: d.day as number, learned: d.learned as string, used: false });
    if (e.type === "learning.applied") for (const l of lessons) if (l.id === d.chosen) l.used = true;
    if (e.type === "thought" && firstThoughts.length < 3) firstThoughts.push(d.text as string);
  }
  return { gaps, lessons, firstThoughts };
}
