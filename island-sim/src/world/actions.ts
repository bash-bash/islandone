import type { Rng } from "../core/rng";
import type { Action } from "../mind/types";
import type { ThingKind } from "./island";
import { bindPieces, PIECE_SOURCES, spawnPiece, type Item } from "./items";
import { feed, GLOW_MINUTES, rub } from "./fire";
import { attemptChance, jointBreakChance } from "./tools";
import { CARRY_LIMIT, fireAt, isDark, structureAt, type WorldState } from "./world";

/**
 * Resolves what the character's actions actually do. All outcomes are
 * computed here from objective properties (Handoff §4): the mind only
 * proposes, the world decides.
 */

/** Objective result of a finished action. Perception turns it into what the character feels. */
export interface ActionResult {
  success: boolean;
  /** Why it failed, objectively (e.g. "too_hard", "too_fast", "none_left", "not_adjacent"). */
  reason?: string;
  thingKind?: ThingKind;
  thirst?: number;
  hunger?: number;
  sickness?: number;
  health?: number;
  /** Item created or picked up. */
  item?: string;
  /** A bound tool came apart during use. */
  toolBroke?: boolean;
  structure?: string;
  /** What rubbing produced. */
  rub?: string;
  /** What putting a piece onto something did. */
  put?: string;
  /** Food was held over a flame first. */
  cooked?: boolean;
}

interface Consumption {
  minutes: number;
  /** Probability that the attempt works with bare hands; overridden by tools.ts where tools matter. */
  chance: number;
  failReason?: string;
  /** Uses up one portion on success. */
  consumes: boolean;
  thirst?: number;
  hunger?: number;
  sickness?: number;
  /** Minutes until the sickness sets in (digestion). */
  sicknessDelay?: number;
  health?: number;
  active: boolean;
}

const DRINK: Partial<Record<ThingKind, Consumption>> = {
  spring: { minutes: 5, chance: 1, consumes: false, thirst: -60, active: false },
  sea: { minutes: 5, chance: 1, consumes: false, thirst: 12, sickness: 6, health: -1, active: false },
};

const EAT: Partial<Record<ThingKind, Consumption>> = {
  fruit_bush: { minutes: 10, chance: 1, consumes: true, hunger: -22, thirst: -3, active: false },
  red_berry_bush: { minutes: 10, chance: 1, consumes: true, hunger: -4, sickness: 45, sicknessDelay: 90, active: false },
  // Hard shell: bare hands almost never open it (problem chain "food", plan §3).
  coconut_palm: { minutes: 30, chance: 0.03, failReason: "too_hard", consumes: true, hunger: -25, thirst: -15, active: true },
  shellfish: { minutes: 20, chance: 0.5, failReason: "stuck", consumes: true, hunger: -12, active: true },
  fish: { minutes: 30, chance: 0.06, failReason: "too_fast", consumes: true, hunger: -30, active: true },
};

/** Minutes the action will take, or null for open-ended actions (sleep). Invalid actions take 1–2 minutes and fail. */
export function actionDuration(world: WorldState, action: Action, hour: number): number | null {
  switch (action.kind) {
    case "idle":
    case "rest":
      return Math.max(1, Math.round(action.minutes));
    case "sleep":
      return null;
    case "move": {
      const minutes = world.paths.get(world.character.place)?.get(action.to);
      if (minutes === undefined) return 1;
      return Math.round(minutes * (isDark(hour) ? 1.5 : 1));
    }
    case "drink":
    case "eat": {
      const spec = consumption(world, action);
      return spec ? spec.minutes : 2;
    }
    case "take":
      return 4;
    case "drop":
      return 1;
    case "bind":
      return 20;
    case "build":
      return action.binder ? 15 : 8;
    case "tie":
      return 10;
    case "rub":
      return 20;
    case "put":
      return 2;
  }
}

/** Whether the action counts as physical effort (raises needs faster). */
export function isActive(world: WorldState, action: Action): boolean {
  if (["move", "take", "build", "tie", "rub"].includes(action.kind)) return true;
  if (action.kind === "eat" || action.kind === "drink") return consumption(world, action)?.active ?? false;
  return false;
}

export function completeAction(world: WorldState, action: Action, rng: Rng, tick: number): ActionResult {
  switch (action.kind) {
    case "idle":
    case "rest":
    case "sleep":
      return { success: true };
    case "move": {
      if (!world.paths.get(world.character.place)?.has(action.to)) return { success: false, reason: "not_adjacent" };
      world.character.place = action.to;
      return { success: true };
    }
    case "drink":
    case "eat":
      return consume(world, action, rng, tick);
    case "take":
      return take(world, action.source, rng);
    case "drop": {
      const carried = world.character.carried;
      const i = carried.indexOf(action.item);
      if (i < 0) return { success: false, reason: "not_held" };
      carried.splice(i, 1);
      return { success: true, item: action.item };
    }
    case "bind":
      return bind(world, action.items, action.binder, rng);
    case "build":
      return build(world, action.item, action.binder);
    case "tie":
      return tieIn(world, action.binder);
    case "rub":
      return rubPieces(world, action.item, action.against, rng);
    case "put":
      return put(world, action.item, action.onto, rng);
  }
}

function rubPieces(world: WorldState, a: string, b: string, rng: Rng): ActionResult {
  const carried = world.character.carried;
  const ia = world.items.get(a);
  const ib = world.items.get(b);
  if (!ia || !ib || a === b || !carried.includes(a) || !carried.includes(b)) return { success: false, reason: "not_held" };
  const result = rub(ia, ib, rng);
  if (result === "glow") {
    const place = world.character.place;
    let fire = fireAt(world, place);
    if (!fire) {
      fire = { id: `f${world.nextId.fire++}`, place, state: "ashes", fuel: 0 };
      world.fires.set(fire.id, fire);
    }
    if (fire.state !== "flame") {
      fire.state = "glow";
      fire.fuel = GLOW_MINUTES;
    }
  }
  return { success: true, rub: result };
}

function put(world: WorldState, itemId: string, onto: string, rng: Rng): ActionResult {
  const carried = world.character.carried;
  const item = world.items.get(itemId);
  if (!item || !carried.includes(itemId)) return { success: false, reason: "not_held" };
  const place = world.character.place;
  const fire = world.fires.get(onto);
  if (fire && fire.place === place) {
    const result = feed(fire, item, rng);
    if (item.material !== "stone") world.character.carried = carried.filter((id) => id !== itemId);
    return { success: result !== "nothing", put: result };
  }
  const structure = world.structures.get(onto);
  if (structure && structure.place === place) return build(world, itemId, undefined);
  return { success: false, reason: "not_here" };
}

function tieIn(world: WorldState, binderId: string): ActionResult {
  const carried = world.character.carried;
  if (!carried.includes(binderId)) return { success: false, reason: "not_held" };
  if ((world.items.get(binderId)?.tieStrength ?? 0) <= 0) return { success: false, reason: "does_not_hold" };
  const structure = structureAt(world, world.character.place);
  const loose = structure?.parts.find((id) => !structure.bound.has(id));
  if (!structure || !loose) return { success: false, reason: "nothing_loose" };
  structure.bound.add(loose);
  world.character.carried = carried.filter((id) => id !== binderId);
  return { success: true, item: loose, structure: structure.id };
}

function consume(world: WorldState, action: Extract<Action, { kind: "drink" | "eat" }>, rng: Rng, tick: number): ActionResult {
  const body = world.body;
  const thing = world.things.get(action.target);
  if (!thing || thing.place !== world.character.place) return { success: false, reason: "not_here" };
  const spec = consumption(world, action);
  if (!spec) return { success: false, reason: action.kind === "drink" ? "not_drinkable" : "inedible", thingKind: thing.kind };
  if (spec.consumes && thing.amount < 1) return { success: false, reason: "none_left", thingKind: thing.kind };

  let tool: Item | null = null;
  if (action.kind === "eat" && action.tool) {
    if (!world.character.carried.includes(action.tool)) return { success: false, reason: "not_held", thingKind: thing.kind };
    tool = world.items.get(action.tool) ?? null;
  }
  const chance = attemptChance(thing.kind, tool) ?? spec.chance;
  const flame = action.kind === "eat" && action.over ? world.fires.get(action.over) : undefined;
  const cooked = !!flame && flame.place === world.character.place && flame.state === "flame";
  let toolBroke = false;
  if (tool && rng.chance(jointBreakChance(tool))) {
    toolBroke = true;
    unbind(world, tool);
  }
  if (!rng.chance(chance)) return { success: false, reason: spec.failReason ?? "failed", thingKind: thing.kind, toolBroke };

  if (spec.consumes) thing.amount -= 1;
  body.thirst = clamp(body.thirst + (spec.thirst ?? 0));
  // Cooked fish and shellfish fill more (Handoff §4: the world decides).
  const hunger = (spec.hunger ?? 0) * (cooked && (thing.kind === "fish" || thing.kind === "shellfish") ? 1.4 : 1);
  body.hunger = clamp(body.hunger + hunger);
  if (spec.sickness && spec.sicknessDelay) {
    world.delayedEffects.push({ tick: tick + spec.sicknessDelay, sickness: spec.sickness });
  } else {
    body.sickness = clamp(body.sickness + (spec.sickness ?? 0));
  }
  body.health = clamp(body.health + (spec.health ?? 0));
  return {
    success: true,
    thingKind: thing.kind,
    thirst: spec.thirst,
    hunger: spec.hunger === undefined ? undefined : hunger,
    sickness: spec.sickness,
    cooked,
    health: spec.health,
    toolBroke,
  };
}

function take(world: WorldState, source: string, rng: Rng): ActionResult {
  const thing = world.things.get(source);
  if (!thing || thing.place !== world.character.place) return { success: false, reason: "not_here" };
  if (!PIECE_SOURCES[thing.kind]) return { success: false, reason: "nothing_loose", thingKind: thing.kind };
  if (thing.amount < 1) return { success: false, reason: "none_left", thingKind: thing.kind };
  if (world.character.carried.length >= CARRY_LIMIT) return { success: false, reason: "hands_full", thingKind: thing.kind };
  const item = spawnPiece(thing.kind, `i${world.nextId.item++}`, rng, thing.wetness ?? 0)!;
  thing.amount -= 1;
  world.items.set(item.id, item);
  world.character.carried.push(item.id);
  return { success: true, item: item.id, thingKind: thing.kind };
}

function bind(world: WorldState, items: readonly [string, string], binder: string, rng: Rng): ActionResult {
  const carried = world.character.carried;
  const [a, b] = items.map((id) => world.items.get(id));
  const tie = world.items.get(binder);
  if (!a || !b || !tie || items[0] === items[1] || ![...items, binder].every((id) => carried.includes(id))) {
    return { success: false, reason: "not_held" };
  }
  if (tie.tieStrength <= 0) return { success: false, reason: "does_not_hold" };
  const bound = bindPieces(`i${world.nextId.item++}`, a, b, tie, rng);
  world.items.set(bound.id, bound);
  world.character.carried = carried.filter((id) => id !== a.id && id !== b.id && id !== tie.id);
  world.character.carried.push(bound.id);
  return { success: true, item: bound.id };
}

/** A bound piece falls apart into its parts (the fiber is lost). */
function unbind(world: WorldState, tool: Item): void {
  const carried = world.character.carried;
  const i = carried.indexOf(tool.id);
  if (i < 0 || !tool.parts) return;
  const [a, b] = tool.parts;
  carried.splice(i, 1, ...[a!, b!].filter((id) => world.items.has(id)));
}

function build(world: WorldState, itemId: string, binderId: string | undefined): ActionResult {
  const carried = world.character.carried;
  if (!carried.includes(itemId) || (binderId && !carried.includes(binderId))) return { success: false, reason: "not_held" };
  const place = world.character.place;
  let structure = structureAt(world, place);
  if (!structure) {
    structure = { id: `s${world.nextId.structure++}`, place, parts: [], bound: new Set() };
    world.structures.set(structure.id, structure);
  }
  structure.parts.push(itemId);
  world.character.carried = carried.filter((id) => id !== itemId && id !== binderId);
  if (binderId && (world.items.get(binderId)?.tieStrength ?? 0) > 0) structure.bound.add(itemId);
  return { success: true, item: itemId, structure: structure.id };
}

function consumption(world: WorldState, action: Action & { target: string }): Consumption | undefined {
  const thing = world.things.get(action.target);
  if (!thing) return undefined;
  return (action.kind === "drink" ? DRINK : EAT)[thing.kind];
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
