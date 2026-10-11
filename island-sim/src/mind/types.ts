/**
 * The character's side of the epistemic firewall (Handoff §5, §28).
 *
 * Rule: nothing in src/mind may import from src/world or src/perception.
 * The mind only ever sees Observation objects and only ever emits Actions;
 * the world decides what an action actually does. test/architecture.test.ts
 * enforces this.
 */

/** Something the character perceived. Only perceivable features, never hidden world facts or material ids. */
export interface Observation {
  tick: number;
  kind: string;
  /** Perceivable features, e.g. { wet: true, sky: "dark" }. */
  features: Record<string, string | number | boolean>;
}

/** What the character attempts. The outcome is computed by the world. */
export type Action = { kind: "idle" } | { kind: "wait"; ticks: number };

export interface Mind {
  /** Called every tick with what was perceived since the last call. */
  decide(tick: number, observations: readonly Observation[]): Action;
}
