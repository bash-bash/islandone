/**
 * The character's side of the epistemic firewall (Handoff §5, §28).
 *
 * Rule: nothing in src/mind may import from src/world or src/perception.
 * The mind only ever sees Observation objects and only ever emits Actions;
 * the world decides what an action actually does. test/architecture.test.ts
 * enforces this.
 *
 * Handles ("p3", "t7") are neutral ids. Everything the character knows about
 * a place or thing comes from perceivable features, never from its kind.
 */

export type FeatureValue = string | number | boolean;
export type Features = Readonly<Record<string, FeatureValue>>;

/** Felt intensity: 0 none, 1 slight, 2 noticeable, 3 strong, 4 severe. */
export type Level = 0 | 1 | 2 | 3 | 4;

export interface Feelings {
  thirst: Level;
  hunger: Level;
  tired: Level;
  cold: Level;
  wet: Level;
  nausea: Level;
  pain: Level;
}

export type Observation =
  /** The character is at a place and sees its surroundings and the ways on. */
  | { tick: number; kind: "place"; place: string; features: Features; exits: readonly string[] }
  /** A thing visible at the current place. */
  | { tick: number; kind: "thing"; thing: string; place: string; features: Features }
  | { tick: number; kind: "body"; feelings: Feelings }
  | { tick: number; kind: "sky"; features: Features }
  /** What the character noticed when an action ended. */
  | { tick: number; kind: "outcome"; action: Action; success: boolean; minutes: number; felt: Features };

/** Why the character does something. Used for analytics (idle rate, time shares). */
export type Purpose = "drink" | "eat" | "sleep" | "shelter" | "explore" | "rest" | "idle";

/** What the character attempts. The outcome is computed by the world. */
export type Action =
  | { kind: "idle"; minutes: number; purpose: Purpose }
  | { kind: "rest"; minutes: number; purpose: Purpose }
  | { kind: "sleep"; purpose: Purpose }
  | { kind: "move"; to: string; purpose: Purpose }
  | { kind: "drink"; target: string; purpose: Purpose }
  | { kind: "eat"; target: string; purpose: Purpose };

export interface Mind {
  /** Receives everything perceived since the last call. */
  observe(observations: readonly Observation[]): void;
  /** Called whenever the character is free to act. */
  decide(tick: number): Action;
}
