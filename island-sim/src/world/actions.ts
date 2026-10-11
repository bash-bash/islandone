import type { Rng } from "../core/rng";
import type { Action } from "../mind/types";
import type { ThingKind } from "./island";
import { isDark, type WorldState } from "./world";

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
}

interface Consumption {
  minutes: number;
  /** Probability that the attempt works with bare hands (no tools exist yet). */
  chance: number;
  failReason?: string;
  /** Uses up one portion on success. */
  consumes: boolean;
  thirst?: number;
  hunger?: number;
  sickness?: number;
  health?: number;
  active: boolean;
}

const DRINK: Partial<Record<ThingKind, Consumption>> = {
  spring: { minutes: 5, chance: 1, consumes: false, thirst: -60, active: false },
  sea: { minutes: 5, chance: 1, consumes: false, thirst: 12, sickness: 6, health: -1, active: false },
};

const EAT: Partial<Record<ThingKind, Consumption>> = {
  fruit_bush: { minutes: 10, chance: 1, consumes: true, hunger: -22, thirst: -3, active: false },
  red_berry_bush: { minutes: 10, chance: 1, consumes: true, hunger: -4, sickness: 45, active: false },
  // Hard shell: bare hands almost never open it (problem chain "food", plan §3).
  coconut_palm: { minutes: 30, chance: 0.03, failReason: "too_hard", consumes: true, hunger: -25, thirst: -15, active: true },
  shellfish: { minutes: 20, chance: 0.7, failReason: "stuck", consumes: true, hunger: -12, active: true },
  fish: { minutes: 30, chance: 0.06, failReason: "too_fast", consumes: true, hunger: -30, active: true },
};

/** Minutes the action will take, or null for open-ended actions (sleep). Throws nothing: invalid actions take 1 minute and fail. */
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
  }
}

/** Whether the action counts as physical effort (raises needs faster). */
export function isActive(world: WorldState, action: Action): boolean {
  if (action.kind === "move") return true;
  if (action.kind === "eat" || action.kind === "drink") return consumption(world, action)?.active ?? false;
  return false;
}

export function completeAction(world: WorldState, action: Action, rng: Rng): ActionResult {
  const body = world.body;
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
    case "eat": {
      const thing = world.things.get(action.target);
      if (!thing || thing.place !== world.character.place) return { success: false, reason: "not_here" };
      const spec = consumption(world, action);
      if (!spec) return { success: false, reason: action.kind === "drink" ? "not_drinkable" : "inedible", thingKind: thing.kind };
      if (spec.consumes && thing.amount < 1) return { success: false, reason: "none_left", thingKind: thing.kind };
      if (!rng.chance(spec.chance)) return { success: false, reason: spec.failReason ?? "failed", thingKind: thing.kind };
      if (spec.consumes) thing.amount -= 1;
      body.thirst = clamp(body.thirst + (spec.thirst ?? 0));
      body.hunger = clamp(body.hunger + (spec.hunger ?? 0));
      body.sickness = clamp(body.sickness + (spec.sickness ?? 0));
      body.health = clamp(body.health + (spec.health ?? 0));
      return {
        success: true,
        thingKind: thing.kind,
        thirst: spec.thirst,
        hunger: spec.hunger,
        sickness: spec.sickness,
        health: spec.health,
      };
    }
  }
}

function consumption(world: WorldState, action: Action & { target: string }): Consumption | undefined {
  const thing = world.things.get(action.target);
  if (!thing) return undefined;
  return (action.kind === "drink" ? DRINK : EAT)[thing.kind];
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
