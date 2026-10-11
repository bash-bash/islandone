import { EventLog } from "./core/eventLog";
import { RngStreams } from "./core/rng";
import { TICKS_PER_DAY } from "./core/time";
import { PlaceholderMind } from "./mind/mind";
import type { Action, Mind } from "./mind/types";
import { perceive } from "./perception/perceive";
import { WORLD_SYSTEMS } from "./world/systems";
import { createWorld, type WorldState } from "./world/world";

export interface SimOptions {
  seed: number;
  days: number;
  /** Keep every event in memory (for inspection). The fingerprint is computed either way. */
  keepEvents?: boolean;
}

export interface TickContext {
  tick: number;
  world: WorldState;
  rng: RngStreams;
  log: EventLog;
}

export interface SimResult {
  seed: number;
  days: number;
  ticks: number;
  /** Hash over the full event log. Same seed and code => same fingerprint. */
  fingerprint: string;
  eventCount: number;
  log: EventLog;
  world: WorldState;
  /** Ticks the character spent on each action kind. */
  actionTicks: Record<string, number>;
}

/**
 * Runs one deterministic simulation. Per tick:
 *   1. world systems advance the objective world
 *   2. perception turns world changes into observations
 *   3. the mind decides on an action
 *   4. (stage 2+) the world resolves the action
 */
export function runSimulation(options: SimOptions): SimResult {
  const { seed, days } = options;
  if (!Number.isInteger(seed) || seed < 0) throw new Error(`seed must be a non-negative integer, got ${seed}`);
  if (!Number.isInteger(days) || days < 1) throw new Error(`days must be a positive integer, got ${days}`);

  const rng = new RngStreams(seed);
  const log = new EventLog(options.keepEvents ?? false);
  const world = createWorld();
  const mind: Mind = new PlaceholderMind(rng.get("mind"));
  const actionTicks: Record<string, number> = {};
  const ticks = days * TICKS_PER_DAY;

  log.push({ tick: 0, source: "sim", type: "sim.start", data: { seed, days } });
  let lastSeenWeather: WorldState["weather"] | null = null;

  for (let tick = 0; tick < ticks; tick++) {
    const ctx: TickContext = { tick, world, rng, log };
    for (const system of WORLD_SYSTEMS) system.tick(ctx);

    const observations = perceive(tick, world, lastSeenWeather);
    lastSeenWeather = world.weather;

    const action: Action = mind.decide(tick, observations);
    actionTicks[action.kind] = (actionTicks[action.kind] ?? 0) + 1;
  }

  log.push({ tick: ticks, source: "sim", type: "sim.end", data: { actionTicks } });

  return { seed, days, ticks, fingerprint: log.fingerprint(), eventCount: log.count, log, world, actionTicks };
}
