import type { Rng } from "../core/rng";
import type { Action, Mind, Observation } from "./types";

/**
 * Placeholder mind for stage 1: remembers what it saw and does nothing.
 * Stage 3 adds beliefs and memories, stage 4 hypotheses and experiments.
 */
export class PlaceholderMind implements Mind {
  readonly seen: Observation[] = [];

  constructor(private readonly rng: Rng) {}

  decide(_tick: number, observations: readonly Observation[]): Action {
    for (const o of observations) this.seen.push(o);
    // Draw once per decision so the "mind" stream is exercised by the determinism tests.
    this.rng.nextU32();
    return { kind: "idle" };
  }
}
