import type { Action, Features, Feelings } from "./types";

/**
 * The thinking part of the character (Handoff §27): an exchangeable Thinker
 * that, at moments worth thinking about, gets the character's own view of the
 * world and answers with a thought, a goal and the next few steps.
 *
 * The view is built inside src/mind from observations, beliefs and memories
 * only, so whatever thinks (rules today, an LLM next) stays behind the
 * epistemic firewall: it knows what the character saw, felt and remembers,
 * never what things really are. Whether a step works is decided by the world.
 */

/** Why the character stops to think. */
export type ThinkReason =
  /** Free time and nothing planned. */
  | "free"
  /** Morning: what to do today. */
  | "woke"
  /** Something happened that was never seen before (smoke, a new taste, …). */
  | "surprise"
  /** A planned step did not work or could not be done. */
  | "setback"
  /** The plan is done. */
  | "plan done"
  /** A need is pressing and nothing learned says how to meet it. */
  | "need";

/** A step the thinker may plan. Like an Action without purpose; `move.to` may be any known place. */
export type PlanStep = Action extends infer A ? (A extends { purpose: unknown } ? Omit<A, "purpose"> : never) : never;

export interface Thought {
  /** What goes through the character's head, in its own words. */
  text: string;
  /** What it wants to achieve now, in its own words. */
  goal?: string;
  /** Next steps, in order. May be empty (just thinking, or waiting). */
  plan: PlanStep[];
}

export interface MindView {
  reason: ThinkReason;
  /** What prompted the thought (e.g. the surprising outcome), in plain words. */
  trigger?: string;
  time: { day: number; hour: number; minute: number };
  sky: Features;
  here: string | null;
  feelings: Feelings;
  places: { place: string; features: Features; exits: readonly string[]; visited: boolean }[];
  things: { id: string; place: string; looks: Features }[];
  holding: { item: string; looks: Features }[];
  /** What it has come to believe, with confidence 0..1. */
  beliefs: { about: string; doing: string; effect: string; confidence: number; evidence: number }[];
  /** Recent experiences, newest last, in plain words. */
  recent: string[];
  /** The first time each kind of result was seen (kept for good), oldest first. */
  discoveries: string[];
  /** Its own recent thoughts, newest last. */
  thoughts: { text: string; goal?: string }[];
  /** The plan it was following, if any, and how far it got. */
  plan?: { goal?: string; done: number; left: PlanStep[] };
}

export interface Thinker {
  readonly name: string;
  think(view: MindView): Thought | Promise<Thought>;
}

/** A request to think, raised by the mind and answered by the simulation driver. */
export interface ThinkRequest {
  view: MindView;
}

/** Turns a step into a short line for logs and for the thinker's own memory. */
export function describeStep(step: PlanStep): string {
  const { kind, ...rest } = step as { kind: string } & Record<string, unknown>;
  const args = Object.entries(rest)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("+") : String(v)}`)
    .join(" ");
  return args ? `${kind} ${args}` : kind;
}
