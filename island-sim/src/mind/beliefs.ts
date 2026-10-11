/**
 * Beliefs about categories of things, each with a confidence (Handoff §6).
 *
 * A belief is "doing ACTION to things of CATEGORY has EFFECT", e.g.
 * "drinking vast wavy water makes thirst worse". Evidence is counted as
 * successes/failures on top of an innate prior (a Beta distribution), so one
 * bad experience lowers confidence without making it absolute, and later
 * experiences can still change it. The world never writes beliefs; they only
 * come from what the character experienced.
 */

export type Effect =
  /** the action relieved the need it was meant for */
  | "helps"
  /** it hurt: worse thirst, nausea afterwards */
  | "harms"
  /** the character could not manage it (too hard, too fast, stuck) */
  | "fails";

export interface Belief {
  category: string;
  action: "drink" | "eat";
  effect: Effect;
  /** Prior pseudo-counts (innate expectation). */
  priorFor: number;
  priorAgainst: number;
  /** Observed evidence. */
  for: number;
  against: number;
  /** Tick of the last change. */
  updated: number;
}

export interface BeliefChange {
  belief: Belief;
  before: number;
  after: number;
  /** True on the first piece of evidence for this belief. */
  formed: boolean;
}

/** Innate expectations before any experience: things that look like food or water probably help. */
const PRIOR: Record<Effect, number> = { helps: 0.6, harms: 0.1, fails: 0.2 };
const PRIOR_WEIGHT = 2;

export class BeliefStore {
  private readonly beliefs = new Map<string, Belief>();

  /** Probability the character currently assigns to the effect. */
  confidence(category: string, action: "drink" | "eat", effect: Effect, innateHelp?: number): number {
    const b = this.beliefs.get(key(category, action, effect));
    const prior = effect === "helps" && innateHelp !== undefined ? innateHelp : PRIOR[effect];
    if (!b) return prior;
    return (b.priorFor + b.for) / (b.priorFor + b.priorAgainst + b.for + b.against);
  }

  /** Same as confidence() but ignoring all experience: what the character would expect if it had learned nothing. */
  innate(effect: Effect, innateHelp?: number): number {
    return effect === "helps" && innateHelp !== undefined ? innateHelp : PRIOR[effect];
  }

  /** Whether any evidence exists for this category and action. */
  experienced(category: string, action: "drink" | "eat"): boolean {
    return (["helps", "harms", "fails"] as const).some((e) => this.beliefs.has(key(category, action, e)));
  }

  /** Adds evidence (weight 1 = one clear experience). */
  update(
    category: string,
    action: "drink" | "eat",
    effect: Effect,
    holds: boolean,
    tick: number,
    weight = 1,
    innateHelp?: number,
  ): BeliefChange {
    const k = key(category, action, effect);
    let b = this.beliefs.get(k);
    const formed = !b;
    if (!b) {
      const p = effect === "helps" && innateHelp !== undefined ? innateHelp : PRIOR[effect];
      b = {
        category,
        action,
        effect,
        priorFor: p * PRIOR_WEIGHT,
        priorAgainst: (1 - p) * PRIOR_WEIGHT,
        for: 0,
        against: 0,
        updated: tick,
      };
      this.beliefs.set(k, b);
    }
    const before = this.confidence(category, action, effect, innateHelp);
    if (holds) b.for += weight;
    else b.against += weight;
    b.updated = tick;
    return { belief: b, before, after: this.confidence(category, action, effect, innateHelp), formed };
  }

  all(): Belief[] {
    return [...this.beliefs.values()];
  }
}

function key(category: string, action: string, effect: Effect): string {
  return `${action}|${effect}|${category}`;
}
