import type { Rng } from "../core/rng";
import type { BeliefStore } from "./beliefs";
import { appeal, canHoldUp, canTie, DIFFICULTY_OF_FAILURE, keepsRainOff, toolClass, type Difficulty } from "./intuition";
import type { Action, Features, Feelings, Purpose } from "./types";

/**
 * Problems, hypotheses and experiments (Handoff §5: Problem → Observation →
 * Hypothesis → Experiment → Result → Memory → Learning → changed behaviour).
 *
 * Everything here is built from the character's own experience and its
 * innate intuition (src/mind/intuition.ts). There is no recipe list: a
 * hypothesis is "using a piece from THIS source against THIS difficulty", "these
 * two pieces tied together", or "this many uprights and leaves at that spot".
 * Whether it works is decided by the world, and only the outcome comes back.
 *
 * The rule-based generator is the stand-in for a later LLM (Handoff §27):
 * it proposes, experiments decide.
 */

export type ProblemKind = Difficulty | "wet";

export interface Problem {
  id: string;
  kind: ProblemKind;
  /** Food category (for hard/fast/stuck) or place handle (for wet). */
  subject: string;
  status: "open" | "solved";
  created: number;
  /** Nothing can go on right now (no material or food in sight): leave it until this tick. */
  parkedUntil?: number;
  parks?: number;
  /** Hypothesis that solved it well enough (satisficing, Handoff §5). */
  solvedBy?: string;
}

export type Approach =
  /** Use one piece from a source; optionally a specific class of piece seen from that source. */
  | { type: "tool"; source: string; cls?: string }
  /** Tie the longest piece from one source to the sharpest from another. */
  | { type: "bound"; reachSource: string; edgeSource: string; tieSource: string }
  /** Put uprights and leaves at a spot, optionally tied in. */
  | { type: "shelter"; place: string; uprights: number; leaves: number; tie: boolean };

export interface Hypothesis {
  id: string;
  problem: string;
  approach: Approach;
  plausibility: number;
  status: "proposed" | "built" | "supported" | "weak" | "refuted" | "dropped";
  tests: number;
  successes: number;
  /** Look of the last tool used in a test (for combining ideas). */
  toolFeatures?: Features;
  /** Pieces taken while trying to get the right one. */
  takes: number;
  /** Did this idea add anything itself (shelters)? */
  worked?: boolean;
}

/** What the mind gives the inquiry to work with. Nothing here reaches the world. */
export interface InquiryHost {
  readonly rng: Rng;
  readonly beliefs: BeliefStore;
  now(): number;
  here(): string | null;
  placeFeatures(place: string): Features;
  feelings(): Feelings;
  raining(): boolean;
  carried(): readonly { item: string; features: Features; origin?: string }[];
  things(): Iterable<[string, { place: string; features: Features; category: string }]>;
  stepTowards(place: string, purpose: Purpose): Action | null;
  distance(place: string): number | null;
  emit(type: string, data: Record<string, unknown>): void;
}

const SATISFICE_RATE = 0.3;
const MIN_TESTS = 4;
/** Successes needed before a food method counts as working (one lucky catch is not enough). */
const MIN_SUCCESSES = 2;
/** Backoff for ideas that cannot go on right now, in minutes. */
const PARK_BASE = 6 * 60;
const PARK_MAX = 48 * 60;
const MAX_TESTS = 5;

export class Inquiry {
  readonly problems = new Map<string, Problem>();
  readonly hypotheses = new Map<string, Hypothesis>();
  private active: string | null = null;
  private lastProblemHypothesis = new Map<string, string>();
  private wetNotes = new Map<string, number[]>();
  private lastRoof = new Map<string, string>();
  /** Test in progress, resolved by the next outcome. */
  pending: { hypothesis: string; kind: "tool" | "wet"; wetBefore?: number } | null = null;
  private ids = { problem: 1, hypothesis: 1 };

  constructor(private readonly host: InquiryHost) {}

  // --- noticing problems ------------------------------------------------------

  /** A bare-hand attempt at a food source failed. Repeated failures become a problem. */
  noteFoodFailure(foodCategory: string, failure: string): void {
    const difficulty = DIFFICULTY_OF_FAILURE[failure];
    if (!difficulty) return;
    if (this.host.beliefs.confidence(foodCategory, "eat", "fails") < 0.45) return;
    if ([...this.problems.values()].some((p) => p.subject === foodCategory)) return;
    const problem = this.addProblem(difficulty, foodCategory);
    for (const [id, t] of this.host.things()) {
      if (!isPieceSource(t.features)) continue;
      this.propose(problem, { type: "tool", source: id }, appeal(difficulty, t.features));
    }
  }

  /** Soaked while sheltering at a spot during rain. Twice in different hours is a problem. */
  noteWet(place: string, wet: number): void {
    if (wet < 3) return;
    // Nothing stands in the water.
    if (this.host.placeFeatures(place).ground === "water") return;
    // Getting wet is one problem, not one per spot: while one is being worked on,
    // or one spot already keeps the rain off, do not start another.
    if ([...this.problems.values()].some((p) => p.kind === "wet")) return;
    const hour = Math.floor(this.host.now() / 60);
    const notes = this.wetNotes.get(place) ?? [];
    if (!notes.includes(hour)) notes.push(hour);
    this.wetNotes.set(place, notes);
    if (notes.length < 2) return;
    const existing = [...this.problems.values()].find((p) => p.kind === "wet" && p.subject === place);
    if (existing) return;
    const problem = this.addProblem("wet", place);
    this.propose(problem, { type: "shelter", place, uprights: 0, leaves: 3, tie: false }, 0.45);
    this.propose(problem, { type: "shelter", place, uprights: 3, leaves: 3, tie: false }, 0.55);
    this.propose(problem, { type: "shelter", place, uprights: 3, leaves: 4, tie: true }, 0.35);
  }

  /** New pieces seen in hand: ideas about that specific kind of piece for open tool problems. */
  noteHeldPieces(): void {
    for (const problem of this.problems.values()) {
      if (problem.status !== "open" || problem.kind === "wet") continue;
      for (const held of this.host.carried()) {
        if (!held.origin || held.features.looks === "bound") continue;
        const cls = toolClass(held.features);
        const known = [...this.hypotheses.values()].some(
          (h) => h.problem === problem.id && h.approach.type === "tool" && h.approach.cls === cls,
        );
        if (!known) this.propose(problem, { type: "tool", source: held.origin, cls }, appeal(problem.kind, held.features));
      }
    }
  }

  /** Something built was seen. If its roof got thinner, wind took parts: the spot is not solved any more. */
  noteStructure(place: string, features: Features): void {
    const roof = String(features.roof);
    const before = this.lastRoof.get(place);
    this.lastRoof.set(place, roof);
    if (!before || rank(roof) >= rank(before)) return;
    const problem = [...this.problems.values()].find((p) => p.kind === "wet" && p.subject === place);
    if (!problem) return;
    this.host.emit("structure.noticed_damage", { place, roof, before });
    if (problem.status === "solved") {
      problem.status = "open";
      this.host.emit("problem.reopened", { problem: problem.id });
    }
    // Loose parts flew away: tying them in now looks more promising.
    for (const h of this.hypotheses.values()) {
      if (h.problem !== problem.id || h.approach.type !== "shelter") continue;
      if (h.approach.tie) {
        h.plausibility = Math.min(0.95, h.plausibility + 0.3);
        // Build it (again), tied this time.
        if (h.status !== "proposed") {
          h.status = "proposed";
          h.tests = 0;
          h.successes = 0;
          h.takes = 0;
        }
      } else if (h.status === "supported" || h.status === "built") {
        h.status = "weak";
      }
    }
  }

  // --- results ---------------------------------------------------------------

  /** Result of a test the inquiry asked for. */
  recordTest(success: boolean, toolFeatures?: Features): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    const h = this.hypotheses.get(pending.hypothesis);
    if (!h) return;
    h.tests++;
    if (success) h.successes++;
    if (toolFeatures) h.toolFeatures = toolFeatures;
    this.host.emit("experiment.result", { hypothesis: h.id, success, tests: h.tests, successes: h.successes });
    this.evaluate(h);
  }

  private evaluate(h: Hypothesis): void {
    const problem = this.problems.get(h.problem)!;
    const rate = h.successes / h.tests;
    const isShelter = h.approach.type === "shelter";
    const minTests = isShelter ? 2 : MIN_TESTS;
    if (h.tests < minTests) return;
    if (h.successes >= MIN_SUCCESSES && (isShelter || rate >= SATISFICE_RATE)) {
      h.status = "supported";
      this.host.emit("hypothesis.supported", { hypothesis: h.id, rate: round2(rate) });
      if (problem.status === "open") {
        problem.status = "solved";
        problem.solvedBy = h.id;
        this.host.emit("problem.solved", { problem: problem.id, by: h.id, approach: describe(h.approach) });
      }
      if (this.active === h.id) this.active = null;
      return;
    }
    if (h.tests >= (isShelter ? 3 : MAX_TESTS) || (h.successes === 0 && h.tests >= minTests + 1)) {
      h.status = h.successes > 0 ? "weak" : "refuted";
      this.host.emit(h.status === "weak" ? "hypothesis.weak" : "hypothesis.refuted", { hypothesis: h.id, rate: round2(rate) });
      if (this.active === h.id) this.active = null;
      this.combineIdeas(problem);
    }
  }

  /** Two ideas that each helped a little (or none worked): try the reach of one with the edge of the other. */
  private combineIdeas(problem: Problem): void {
    if (problem.kind === "wet") return;
    const done = [...this.hypotheses.values()].filter(
      (h) => h.problem === problem.id && (h.status === "weak" || h.status === "refuted") && h.toolFeatures && h.approach.type === "tool",
    );
    if (done.length < 2) return;
    if ([...this.hypotheses.values()].some((h) => h.problem === problem.id && h.approach.type === "bound")) return;
    const tie = [...this.host.things()].find(([, t]) => canTie(t.features));
    if (!tie) return;
    const lengthRank = (f: Features) => (f.length === "long" ? 3 : f.length === "medium" ? 2 : f.length === "short" ? 1 : 0);
    const edgeRank = (f: Features) => {
      const e = f.tip ?? f.edge;
      return e === "sharp" ? 3 : e === "pointed" ? 2 : 1;
    };
    const reach = [...done].sort((a, b) => lengthRank(b.toolFeatures!) - lengthRank(a.toolFeatures!))[0]!;
    const edge = [...done].sort((a, b) => edgeRank(b.toolFeatures!) - edgeRank(a.toolFeatures!))[0]!;
    if (reach === edge || lengthRank(reach.toolFeatures!) < 2 || edgeRank(edge.toolFeatures!) < 2) return;
    const reachSource = (reach.approach as Extract<Approach, { type: "tool" }>).source;
    const edgeSource = (edge.approach as Extract<Approach, { type: "tool" }>).source;
    const combined = { looks: "bound", length: reach.toolFeatures!.length ?? "short", tip: edge.toolFeatures!.tip ?? edge.toolFeatures!.edge ?? "blunt" };
    this.propose(problem, { type: "bound", reachSource, edgeSource, tieSource: tie[0] }, appeal(problem.kind, combined) + 0.15);
  }

  // --- choosing what to do -----------------------------------------------------

  /** Called when the character has time. Returns the next step of an experiment, or null. */
  next(): Action | null {
    // Rain is the only chance to test a shelter: take it whatever else is going on.
    if (this.host.raining()) {
      const waiting = [...this.hypotheses.values()].find(
        (h) => h.status === "built" && h.approach.type === "shelter" && this.problems.get(h.problem)!.status === "open",
      );
      if (waiting) return this.testShelter(waiting);
    }
    let h = this.active ? this.hypotheses.get(this.active) : undefined;
    if (!h || h.status !== "proposed") {
      h = this.pick();
      if (!h) return null;
      const previous = this.lastProblemHypothesis.get(h.problem);
      if (previous !== h.id) {
        // A change of approach: the previous one was given up (refuted, weak, dropped),
        // not merely interrupted.
        const before = previous ? this.hypotheses.get(previous) : undefined;
        if (before && before.status !== "proposed") this.host.emit("strategy.changed", { problem: h.problem, from: previous, to: h.id });
        this.host.emit("experiment.started", { hypothesis: h.id, problem: h.problem, approach: describe(h.approach) });
      }
      this.lastProblemHypothesis.set(h.problem, h.id);
      this.active = h.id;
    }
    const step = this.stepFor(h);
    if (!step) {
      this.active = null;
      // Stuck for now (nothing to gather in sight, …): set it aside for a while
      // instead of switching back and forth every minute.
      if (h.status === "proposed") {
        const problem = this.problems.get(h.problem)!;
        problem.parks = (problem.parks ?? 0) + 1;
        problem.parkedUntil = this.host.now() + Math.min(PARK_MAX, PARK_BASE * 2 ** (problem.parks - 1));
      }
    }
    return step;
  }

  /** The tool class that solved this food category, if any (used for everyday eating). */
  methodFor(foodCategory: string): Hypothesis | null {
    for (const p of this.problems.values()) {
      if (p.subject !== foodCategory || !p.solvedBy) continue;
      return this.hypotheses.get(p.solvedBy) ?? null;
    }
    return null;
  }

  /** Steps to (re)make the tool of a supported method, without testing. */
  upkeep(h: Hypothesis): Action | null {
    return this.acquireTool(h, "work");
  }

  private pick(): Hypothesis | undefined {
    let best: Hypothesis | undefined;
    let bestValue = -Infinity;
    for (const h of this.hypotheses.values()) {
      if (h.status !== "proposed" || h.plausibility < 0.08) continue;
      const problem = this.problems.get(h.problem)!;
      if (problem.status !== "open") continue;
      if (problem.parkedUntil !== undefined && this.host.now() < problem.parkedUntil) continue;
      // One shelter idea at a time: a built one waits for rain before the next is tried.
      if ([...this.hypotheses.values()].some((o) => o.problem === h.problem && o.status === "built")) continue;
      const value = h.plausibility + this.host.rng.range(0, 0.15);
      if (value > bestValue) [best, bestValue] = [h, value];
    }
    return best;
  }

  private stepFor(h: Hypothesis): Action | null {
    if (h.approach.type === "shelter") return this.buildShelter(h, h.approach);
    const tool = this.toolFor(h);
    if (!tool) return this.acquireTool(h, "experiment");
    const problem = this.problems.get(h.problem)!;
    const target = this.nearest((t) => t.category === problem.subject && t.features.amount !== "none");
    if (!target) return null;
    if (target.place !== this.host.here()) return this.host.stepTowards(target.place, "experiment");
    this.pending = { hypothesis: h.id, kind: "tool" };
    return { kind: "eat", target: target.id, tool: tool.item, purpose: "experiment" };
  }

  /** The held piece that fits a hypothesis best (by intuition), if any. */
  toolFor(h: Hypothesis): { item: string; features: Features } | null {
    const problem = this.problems.get(h.problem)!;
    if (problem.kind === "wet") return null;
    const a = h.approach;
    const fits = this.host.carried().filter((c) => {
      if (a.type === "bound") return c.features.looks === "bound";
      if (a.type !== "tool") return false;
      if (a.cls) return toolClass(c.features) === a.cls;
      return c.origin === a.source;
    });
    if (fits.length === 0) return null;
    return [...fits].sort((x, y) => appeal(problem.kind as Difficulty, y.features) - appeal(problem.kind as Difficulty, x.features))[0]!;
  }

  private acquireTool(h: Hypothesis, purpose: Purpose): Action | null {
    const a = h.approach;
    if (a.type === "tool") {
      if (h.takes >= 5 && purpose === "experiment") {
        // Could not find that kind of piece there.
        h.status = "refuted";
        this.host.emit("hypothesis.refuted", { hypothesis: h.id, reason: "no such piece found" });
        return null;
      }
      return this.takeFrom(a.source, h, purpose);
    }
    if (a.type === "bound") {
      const held = this.host.carried();
      const reach = best(held.filter((c) => c.origin === a.reachSource && c.features.looks !== "bound"), lengthScore);
      const edge = best(held.filter((c) => c.origin === a.edgeSource && c.item !== reach?.item && c.features.looks !== "bound"), edgeScore);
      const tie = held.find((c) => canTie(c.features));
      if (reach && edge && tie && lengthScore(reach.features) >= 2) {
        return { kind: "bind", items: [reach.item, edge.item], binder: tie.item, purpose };
      }
      if (h.takes >= 9 && purpose === "experiment") {
        h.status = "refuted";
        this.host.emit("hypothesis.refuted", { hypothesis: h.id, reason: "could not put it together" });
        return null;
      }
      if (!reach || lengthScore(reach.features) < 2) return this.takeFrom(a.reachSource, h, purpose);
      if (!edge) return this.takeFrom(a.edgeSource, h, purpose);
      return this.takeFrom(a.tieSource, h, purpose);
    }
    return null;
  }

  private takeFrom(source: string, h: Hypothesis, purpose: Purpose): Action | null {
    const thing = [...this.host.things()].find(([id]) => id === source)?.[1];
    if (!thing || thing.features.amount === "none") return null;
    const drop = this.dropIfFull(h);
    if (drop) return drop;
    if (thing.place !== this.host.here()) return this.host.stepTowards(thing.place, purpose);
    h.takes++;
    return { kind: "take", source, purpose };
  }

  /** Hands full: put down the piece that seems least useful for anything open. */
  private dropIfFull(h: Hypothesis): Action | null {
    const held = this.host.carried();
    if (held.length < 4) return null;
    const keep = new Set<string>();
    for (const other of this.hypotheses.values()) {
      if (other.status === "supported") {
        const tool = this.toolFor(other);
        if (tool) keep.add(tool.item);
      }
    }
    const kind = this.problems.get(h.problem)!.kind;
    const score = (f: Features) => (kind === "wet" ? (keepsRainOff(f) || canHoldUp(f) || canTie(f) ? 1 : 0) : appeal(kind, f));
    const candidates = held.filter((c) => !keep.has(c.item));
    if (candidates.length === 0) return null;
    const worst = [...candidates].sort((x, y) => score(x.features) - score(y.features))[0]!;
    return { kind: "drop", item: worst.item, purpose: "experiment" };
  }

  private buildShelter(h: Hypothesis, a: Extract<Approach, { type: "shelter" }>): Action | null {
    const built = this.nearest((t) => t.place === a.place && t.features.looks === "built");
    const uprights = Number(built?.features.uprights ?? 0);
    const leaves = Number(built?.features.leaves ?? 0);
    const tied = built?.features.tied === "all";
    if (uprights >= a.uprights && leaves >= a.leaves && (!a.tie || tied)) {
      if (h.status === "proposed" && !h.worked) {
        // What stands there already is at least this much: nothing new to learn from it.
        h.status = "dropped";
        this.host.emit("hypothesis.dropped", { hypothesis: h.id, reason: "already there" });
      } else if (h.status === "proposed") {
        h.status = "built";
        this.host.emit("construction.built", { hypothesis: h.id, place: a.place, uprights, leaves, tied });
      }
      if (this.active === h.id) this.active = null;
      return null;
    }
    const held = this.host.carried();
    const stick = held.find((c) => canHoldUp(c.features));
    const leaf = held.find((c) => keepsRainOff(c.features));
    const tie = held.find((c) => canTie(c.features));
    const wantUpright = uprights < a.uprights;
    const wantLeaf = leaves < a.leaves;
    const piece = wantUpright && stick ? stick : wantLeaf && leaf ? leaf : null;
    if (piece && (!a.tie || tie)) {
      if (this.host.here() !== a.place) return this.host.stepTowards(a.place, "experiment");
      h.worked = true;
      return { kind: "build", item: piece.item, binder: a.tie ? tie!.item : undefined, purpose: "experiment" };
    }
    // Enough pieces, but some are loose: tie them in.
    if (a.tie && !wantUpright && !wantLeaf && !tied && tie) {
      if (this.host.here() !== a.place) return this.host.stepTowards(a.place, "experiment");
      h.worked = true;
      return { kind: "tie", binder: tie.item, purpose: "experiment" };
    }
    // Fetch what is missing. Short sticks are no use as uprights: put them down.
    const short = held.find((c) => c.features.looks === "wood" && !canHoldUp(c.features));
    if (short) return { kind: "drop", item: short.item, purpose: "experiment" };
    if (h.takes >= 40) {
      h.status = "refuted";
      this.host.emit("hypothesis.refuted", { hypothesis: h.id, reason: "could not gather enough" });
      return null;
    }
    const sourceOf = (test: (f: Features) => boolean) => this.nearest((t) => test(t.features) && t.features.amount !== "none");
    let source: { id: string; place: string } | null = null;
    if (a.tie && !tie) source = sourceOf(canTie);
    else if (wantUpright && !stick) source = sourceOf((f) => f.looks === "wood" && f.form === "fallen sticks");
    else if (wantLeaf && !leaf) source = sourceOf((f) => f.looks === "leaf");
    if (!source) return null;
    if (held.length >= 4) {
      const drop = this.dropIfFull(h);
      if (drop) return drop;
    }
    if (source.place !== this.host.here()) return this.host.stepTowards(source.place, "experiment");
    h.takes++;
    return { kind: "take", source: source.id, purpose: "experiment" };
  }

  private testShelter(h: Hypothesis): Action | null {
    const a = h.approach as Extract<Approach, { type: "shelter" }>;
    if (this.host.here() !== a.place) return this.host.stepTowards(a.place, "experiment");
    this.pending = { hypothesis: h.id, kind: "wet", wetBefore: this.host.feelings().wet };
    return { kind: "rest", minutes: 40, purpose: "experiment" };
  }

  /** Result of resting under a shelter in the rain: stayed dry or not. */
  recordWetTest(): void {
    if (this.pending?.kind !== "wet") return;
    const before = this.pending.wetBefore ?? 0;
    const after = this.host.feelings().wet;
    this.recordTest(after <= Math.max(1, before) && after <= 2);
  }

  // --- helpers --------------------------------------------------------------------

  private addProblem(kind: ProblemKind, subject: string): Problem {
    const problem: Problem = { id: `P${this.ids.problem++}`, kind, subject, status: "open", created: this.host.now() };
    this.problems.set(problem.id, problem);
    this.host.emit("problem.created", { problem: problem.id, kind, subject });
    return problem;
  }

  private propose(problem: Problem, approach: Approach, plausibility: number): void {
    const h: Hypothesis = {
      id: `H${this.ids.hypothesis++}`,
      problem: problem.id,
      approach,
      plausibility,
      status: "proposed",
      tests: 0,
      successes: 0,
      takes: 0,
    };
    this.hypotheses.set(h.id, h);
    this.host.emit("hypothesis.proposed", { hypothesis: h.id, problem: problem.id, approach: describe(approach), plausibility: round2(plausibility) });
  }

  private nearest(test: (t: { place: string; features: Features; category: string }) => boolean): { id: string; place: string; features: Features } | null {
    let best: { id: string; place: string; features: Features } | null = null;
    let bestCost = Infinity;
    for (const [id, t] of this.host.things()) {
      if (!test(t)) continue;
      const cost = this.host.distance(t.place);
      if (cost !== null && cost < bestCost) [best, bestCost] = [{ id, place: t.place, features: t.features }, cost];
    }
    return best;
  }
}

function isPieceSource(f: Features): boolean {
  return f.looks === "stone" || f.looks === "wood" || f.looks === "leaf" || canTie(f);
}

function lengthScore(f: Features): number {
  return f.length === "long" ? 3 : f.length === "medium" ? 2 : f.length === "short" ? 1 : 0;
}

function edgeScore(f: Features): number {
  const e = f.tip ?? f.edge;
  return e === "sharp" ? 3 : e === "pointed" ? 2 : 1;
}

function best<T extends { features: Features }>(items: T[], score: (f: Features) => number): T | undefined {
  return [...items].sort((a, b) => score(b.features) - score(a.features))[0];
}

function rank(roof: string): number {
  return ["none", "thin", "solid", "thick"].indexOf(roof);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Short, human-readable form for logs. */
export function describe(a: Approach): string {
  switch (a.type) {
    case "tool":
      return `use piece from ${a.source}${a.cls ? ` (${a.cls})` : ""}`;
    case "bound":
      return `tie long piece from ${a.reachSource} to edged piece from ${a.edgeSource}`;
    case "shelter":
      return `at ${a.place}: ${a.uprights} uprights, ${a.leaves} leaves${a.tie ? ", tied" : ""}`;
  }
}
