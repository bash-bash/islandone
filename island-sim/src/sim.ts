import { EventLog, type SimEvent } from "./core/eventLog";
import { RngStreams, type Rng } from "./core/rng";
import { TICKS_PER_DAY, timeOf } from "./core/time";
import { RoutineMind, type ThinkingPace } from "./mind/routineMind";
import { describeStep, type PlanStep, type Thinker, type ThinkRequest, type Thought } from "./mind/thinking";
import type { Action, Mind, Purpose } from "./mind/types";
import { Perception } from "./perception/perceive";
import { actionDuration, completeAction } from "./world/actions";
import { WORLD_SYSTEMS } from "./world/systems";
import { createWorld, isDark, type WorldState } from "./world/world";

export interface SimOptions {
  seed: number;
  days: number;
  /** Keep every event in memory (for inspection). The fingerprint is computed either way. */
  keepEvents?: boolean;
  /** Replaces the character's mind (tests). Default: RoutineMind. */
  createMind?: (rng: Rng) => Mind;
  /**
   * Who does the thinking in free time (stage 5). Without one, the built-in
   * rules of stage 4 run. With one, the character stops to think at moments
   * worth thinking about and follows the plans it comes up with.
   */
  thinker?: Thinker;
  /** How often the character stops to think with a thinker (default: EAGER_PACE). */
  pace?: ThinkingPace;
  /** Stop before this tick (the live island computes only up to "now"). Default: days × 1440. */
  untilTick?: number;
  /** Sees every event as it is logged (the live feed). Does not change the run. */
  onEvent?: (event: SimEvent, world: Readonly<WorldState>) => void;
  /** Called at the end of every simulated tick (the live feed). Must not change the world. */
  onTick?: (tick: number, world: Readonly<WorldState>) => void;
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
  /** Ticks actually simulated (fewer than days × 1440 if the character died). */
  ticks: number;
  /** Hash over the full event log. Same seed and code => same fingerprint. */
  fingerprint: string;
  eventCount: number;
  log: EventLog;
  world: WorldState;
  /** Ticks spent per purpose (sleep, drink, idle, …). */
  purposeTicks: Record<string, number>;
  /** Lowest health reached. */
  minHealth: number;
  /** Minutes spent soaked (wetness > 0.5). */
  soakedTicks: number;
}

/**
 * Runs one deterministic simulation. Per tick:
 *   1. world systems advance weather, regrowth and the body
 *   2. a finished action is resolved by the world
 *   3. perception turns world state into observations for the mind
 *   4. if the character is free, the mind picks the next action
 */
export function runSimulation(options: SimOptions): SimResult {
  const run = simulate(options);
  let step = run.next();
  while (!step.done) {
    const thought = options.thinker!.think(step.value.view);
    if (thought instanceof Promise) throw new Error(`thinker "${options.thinker!.name}" is asynchronous: use runSimulationAsync`);
    step = run.next(thought);
  }
  return step.value;
}

/** Same as runSimulation, for thinkers that answer asynchronously (an LLM). */
export async function runSimulationAsync(options: SimOptions): Promise<SimResult> {
  const run = simulate(options);
  let step = run.next();
  while (!step.done) step = run.next(await options.thinker!.think(step.value.view));
  return step.value;
}

/** The simulation as a generator: it pauses whenever the character wants to think. */
export function* simulate(options: SimOptions): Generator<ThinkRequest, SimResult, Thought> {
  const { seed, days } = options;
  if (!Number.isInteger(seed) || seed < 0) throw new Error(`seed must be a non-negative integer, got ${seed}`);
  if (!Number.isInteger(days) || days < 1) throw new Error(`days must be a positive integer, got ${days}`);

  const rng = new RngStreams(seed);
  const world = createWorld(rng.get("world-setup"));
  const onEvent = options.onEvent;
  const log = new EventLog(options.keepEvents ?? false, onEvent && ((event) => onEvent(event, world)));
  const thinker = options.thinker;
  const mind: Mind = (options.createMind ?? ((r) => new RoutineMind(r, thinker ? "external" : "rules", options.pace)))(rng.get("mind"));
  const perception = new Perception();
  const purposeTicks: Record<string, number> = {};
  const total = Math.min(days * TICKS_PER_DAY, options.untilTick ?? Infinity);
  let minHealth = world.body.health;
  let soakedTicks = 0;
  let arrived = true;
  let tick = 0;

  log.push({ tick: 0, source: "sim", type: "sim.start", data: { seed, days } });

  for (; tick < total; tick++) {
    const ctx: TickContext = { tick, world, rng, log };
    for (const system of WORLD_SYSTEMS) system.tick(ctx);
    if (world.body.health < minHealth) minHealth = world.body.health;
    if (world.body.wetness > 0.5) soakedTicks++;
    if (world.death) break;
    const hour = timeOf(tick).hour;

    const current = world.character.current;
    if (current && (current.endsAt !== null ? tick >= current.endsAt : shouldWake(world, hour))) {
      const result = completeAction(world, current.action, rng.get("world"), tick);
      world.body.asleep = false;
      world.character.current = null;
      arrived = current.action.kind === "move" && result.success;
      log.push({
        tick,
        source: "world",
        type: "action.end",
        data: {
          kind: current.action.kind,
          purpose: current.action.purpose,
          ...("tool" in current.action && current.action.tool ? { tool: current.action.tool } : {}),
          ...(current.action.purpose === "plan" ? { step: describeStep(current.action as unknown as PlanStep).replace(/ purpose=\S+/, "") } : {}),
          ...result,
          place: world.character.place,
        },
      });
      mind.observe([perception.outcome(tick, current.action, tick - current.startedAt, result)]);
    }

    mind.observe(perception.perceive(world, tick, hour, arrived));
    arrived = false;
    logMindEvents(mind, log);

    if (!world.character.current) {
      const request = thinker ? mind.wantsThought?.() : null;
      if (request) {
        const thought = yield request;
        mind.receiveThought?.(thought, thinker!.name);
        logMindEvents(mind, log);
      }
      const action = mind.decide(tick);
      const minutes = actionDuration(world, action, hour);
      world.character.current = { action, startedAt: tick, endsAt: minutes === null ? null : tick + minutes };
      if (action.kind === "sleep") world.body.asleep = true;
      log.push({ tick, source: "mind", type: "action.start", data: describe(action) });
      logMindEvents(mind, log);
    }
    const purpose: Purpose = world.character.current!.action.purpose;
    purposeTicks[purpose] = (purposeTicks[purpose] ?? 0) + 1;
    options.onTick?.(tick, world);
  }

  log.push({ tick, source: "sim", type: "sim.end", data: { alive: !world.death, purposeTicks } });

  return {
    seed,
    days,
    ticks: tick,
    fingerprint: log.fingerprint(),
    eventCount: log.count,
    log,
    world,
    purposeTicks,
    minHealth,
    soakedTicks,
  };
}

/** Sleep ends when rested and light, or when the body wakes the character. */
function shouldWake(world: WorldState, hour: number): boolean {
  const b = world.body;
  if (!b.asleep) return true;
  if (b.energy >= 95 && !isDark(hour)) return true;
  if (b.thirst > 85 || b.warmth < 30 || b.sickness > 60) return true;
  const cover = world.places.get(world.character.place)!.cover;
  return world.raining && cover < 0.3 && b.energy > 50;
}

function logMindEvents(mind: Mind, log: EventLog): void {
  if (!mind.drainEvents) return;
  for (const e of mind.drainEvents()) log.push({ tick: e.tick, source: "mind", type: e.type, data: e.data });
}

function describe(action: Action): Record<string, unknown> {
  return { ...action };
}
