import type { Rng } from "../core/rng";
import { BeliefStore, type BeliefChange, type Effect } from "./beliefs";
import { categoryOf } from "./categories";
import { Inquiry, type InquiryHost } from "./inquiry";
import { toolClass } from "./intuition";
import { EpisodicMemory } from "./memory";
import { describeStep, type Change, type MindView, type PlanStep, type ThinkReason, type ThinkRequest, type Thought } from "./thinking";
import type { Action, Features, Feelings, Mind, MindEvent, Observation, Purpose } from "./types";

/** How the character's free time is spent: built-in rules (stage 4) or an external Thinker (stage 5). */
export type ThinkingMode = "rules" | "external";

/** Minimum minutes between unprompted thoughts, and a daily cap (keeps an LLM affordable). */
const THINK_GAP = 30;
const THINKS_PER_DAY = 60;
const RECENT = 24;
const DISCOVERIES = 40;
/** How often a planned step must have been done before it shows up in the thinker's tries. */
const TRIES_SHOWN_FROM = 3;
const TRIES_SHOWN = 10;
const SET_ASIDE = 12;
const LESSONS_SHOWN = 12;
/** Open guesses kept; older unjudged ones are let go (counted as dropped). */
const GUESSES_OPEN = 8;

type Use = "drink" | "eat";

/**
 * The character (stages 2–3): innate drives, plus beliefs and memories built
 * only from its own experience.
 *
 * Innate (not world knowledge): thirst wants water-looking things, hunger wants
 * food-looking things, tiredness wants sleep under cover, and a vague
 * expectation that such things usually help.
 *
 * Learned:
 * - where places and things are and how long ways take
 * - beliefs about categories of things it groups by look (src/mind/categories):
 *   "drinking vast wavy water makes thirst worse" holds for every patch of sea,
 *   so it does not have to taste each one (learning transfer)
 * - episodic memory; nausea is blamed on what was eaten in the hours before
 *
 * Every decision that comes out differently than it would have with innate
 * expectations alone is reported as "learning.applied" (Handoff §5: learning
 * must change behaviour).
 *
 * Problems, hypotheses and experiments live in src/mind/inquiry.ts (stage 4):
 * the character works on them in its free time, and what turns out to work
 * (a tool for a food source, a roof at its sleeping spot) is used from then on.
 *
 * Stage 5, mode "external": free time belongs to a Thinker (src/mind/thinking.ts,
 * an LLM or a stand-in). The mind asks to think when something new happened or a
 * plan ended or failed, hands over its own view, and follows the plan it gets
 * back step by step. The body's instincts still step in when a need hurts.
 */
export class RoutineMind implements Mind {
  private here: string | null = null;
  private now = 0;
  private readonly places = new Map<string, { features: Features; exits: readonly string[]; visited: boolean }>();
  private readonly things = new Map<string, { place: string; features: Features; category: string }>();
  private readonly travel = new Map<string, number>();
  private readonly beliefs = new BeliefStore();
  private readonly memory = new EpisodicMemory();
  private readonly knownCategories = new Set<string>();
  private readonly pendingMealChecks: { tick: number; category: string }[] = [];
  private feelings: Feelings = { thirst: 0, hunger: 0, tired: 0, cold: 0, wet: 0, nausea: 0, pain: 0 };
  private sky: Features = { light: "light", rain: false, wind: "light" };
  private lastMove: { from: string; to: string } | null = null;
  private events: MindEvent[] = [];
  private carriedItems: { item: string; features: Features; origin?: string }[] = [];
  private readonly origins = new Map<string, string>();
  private pendingTake: string | null = null;
  private lastPurpose: Purpose = "idle";
  private readonly inquiry: Inquiry;
  // --- thinking (stage 5) ---
  private plan: { goal?: string; steps: PlanStep[]; done: number } | null = null;
  private planStepPending = false;
  private thinkReason: ThinkReason | null = null;
  private thinkTrigger: string | undefined;
  private lastThink = -Infinity;
  private thinksToday = { day: -1, count: 0 };
  private wasAsleep = true;
  private readonly recent: string[] = [];
  private readonly discoveries: string[] = [];
  private readonly seenResults = new Set<string>();
  private readonly thoughts: { text: string; goal?: string }[] = [];
  /** Planned steps done so far, by step, with what came of them (strategy history, Handoff §6). */
  private readonly tries = new Map<string, { times: number; results: Record<string, number>; last: number }>();
  private readonly setAside: { approach: string; change: Change; day: number }[] = [];
  private readonly gaps: { id: string; problem: string; wants: string[]; day: number }[] = [];
  private gapCount = 0;
  private readonly guesses: { id: string; expect: string; plan: string[]; day: number }[] = [];
  private guessCount = 0;
  private readonly lessons: { id: string; learned: string; day: number }[] = [];
  private readonly lessonsUsed = new Set<string>();

  constructor(
    private readonly rng: Rng,
    private readonly thinking: ThinkingMode = "rules",
  ) {
    const self = this;
    const host: InquiryHost = {
      rng,
      beliefs: this.beliefs,
      now: () => self.now,
      here: () => self.here,
      placeFeatures: (place) => self.places.get(place)?.features ?? {},
      feelings: () => self.feelings,
      raining: () => self.sky.rain === true,
      carried: () => self.carriedItems,
      things: () => self.things.entries(),
      stepTowards: (place, purpose) => self.stepTowards(place, purpose),
      distance: (place) => self.distance(place),
      emit: (type, data) => self.emit(type, data),
    };
    this.inquiry = new Inquiry(host);
  }

  observe(observations: readonly Observation[]): void {
    for (const o of observations) {
      this.now = o.tick;
      switch (o.kind) {
        case "place":
          this.here = o.place;
          this.places.set(o.place, { features: o.features, exits: o.exits, visited: true });
          for (const exit of o.exits) {
            if (!this.places.has(exit)) this.places.set(exit, { features: {}, exits: [], visited: false });
          }
          break;
        case "thing": {
          const category = categoryOf(o.features);
          this.things.set(o.thing, { place: o.place, features: o.features, category });
          if (o.features.looks === "built" && this.rules) this.inquiry.noteStructure(o.place, o.features);
          if (!this.knownCategories.has(category)) {
            this.knownCategories.add(category);
            this.memory.remember({ tick: o.tick, kind: "discovered", place: o.place, thing: o.thing, category, salience: 0.6 });
            this.emit("category.discovered", { category, thing: o.thing });
          }
          break;
        }
        case "sky":
          this.sky = o.features;
          break;
        case "body":
          if (o.feelings.nausea >= 2 && this.feelings.nausea < 2) this.blameRecentMeals(o.tick);
          this.noteFeelings(this.feelings, o.feelings);
          this.feelings = o.feelings;
          if (this.here && this.sky.rain === true && ["sleep", "shelter", "rest"].includes(this.lastPurpose)) {
            if (this.rules) this.inquiry.noteWet(this.here, o.feelings.wet);
          }
          break;
        case "inventory":
          this.carriedItems = o.items.map(({ item, features }) => {
            if (!this.origins.has(item) && this.pendingTake) this.origins.set(item, this.pendingTake);
            return { item, features, origin: this.origins.get(item) };
          });
          this.pendingTake = null;
          if (this.rules) this.inquiry.noteHeldPieces();
          break;
        case "outcome":
          this.learnFromOutcome(o);
          if (this.thinking === "external") this.followUp(o);
          break;
      }
    }
    this.settleMealChecks();
  }

  decide(tick: number): Action {
    this.now = tick;
    if (this.thinking === "external") {
      const action = this.decideWithThoughts();
      this.lastPurpose = action.purpose;
      this.wasAsleep = action.kind === "sleep";
      if (action.kind === "take") this.pendingTake = action.source;
      return action;
    }
    const f = this.feelings;
    const dark = this.sky.light === "dark";
    const exposed = this.sky.rain === true && (this.sky.wind === "strong" || f.cold >= 2 || f.wet >= 3);
    const urgency: [Purpose, number][] = [
      ["drink", f.thirst + 0.3],
      ["eat", f.hunger],
      // Day-night rhythm: sleep comes easily in the dark; by day only when very tired.
      // Too cold to fall asleep: getting out of the rain comes first.
      ["sleep", f.tired + (dark ? 1.6 : -1) - (f.tired === 0 ? 2 : 0) - (f.cold >= 3 ? 3 : 0)],
      ["shelter", exposed || f.cold >= 3 ? 2 + f.cold * 0.5 : 0],
    ];
    urgency.sort((a, b) => b[1] - a[1]);
    const [goal, level] = urgency[0]!;

    const action = this.choose(goal, level, dark);
    this.lastPurpose = action.purpose;
    if (action.kind === "take") this.pendingTake = action.source;
    return action;
  }

  private choose(goal: Purpose, level: number, dark: boolean): Action {
    const f = this.feelings;
    if (level >= 2) {
      const action = this.pursue(goal);
      if (action) return action;
    }
    // Free time (Handoff §5): keep tools that proved useful, work on open problems, try untested food.
    if (!dark && f.tired < 3) {
      const upkeep = this.toolUpkeep();
      if (upkeep) return upkeep;
      const experiment = this.inquiry.next();
      if (experiment) return experiment;
      const taste = f.hunger >= 1 ? this.tasteSomethingNew() : null;
      if (taste) return taste;
    } else if (this.sky.rain === true) {
      // A shelter test can also happen at night: it only needs rain.
      const experiment = this.inquiry.next();
      if (experiment?.purpose === "experiment" && experiment.kind !== "take") return experiment;
    }
    if (!dark && this.rng.chance(0.6)) {
      const explore = this.exploreStep();
      if (explore) return explore;
    }
    return f.tired >= 2 ? { kind: "rest", minutes: 30, purpose: "rest" } : { kind: "idle", minutes: 30, purpose: "idle" };
  }

  /** A food source that has a working method but the tool is not in hand: make or fetch it again. */
  private toolUpkeep(): Action | null {
    for (const [, t] of this.things) {
      const method = this.inquiry.methodFor(t.category);
      if (!method || this.inquiry.toolFor(method)) continue;
      if (t.features.amount === "none") continue;
      return this.inquiry.upkeep(method);
    }
    return null;
  }

  /** Curiosity: when a little hungry and nothing else to do, try a food-looking thing never tried before. */
  private tasteSomethingNew(): Action | null {
    if (!this.rng.chance(0.25)) return null;
    for (const [id, t] of this.things) {
      if (eatPrior(t.features) <= 0 || t.features.amount === "none") continue;
      if (this.beliefs.experienced(t.category, "eat")) continue;
      if (t.place === this.here) return { kind: "eat", target: id, purpose: "experiment" };
      return this.stepTowards(t.place, "experiment");
    }
    return null;
  }

  private get rules(): boolean {
    return this.thinking === "rules";
  }

  // --- thinking (stage 5) -------------------------------------------------------

  /** Asked before every decision: does the character want to stop and think? */
  wantsThought(): ThinkRequest | null {
    if (this.thinking !== "external") return null;
    const day = Math.floor(this.now / 1440);
    if (this.thinksToday.day !== day) this.thinksToday = { day, count: 0 };
    if (this.thinksToday.count >= THINKS_PER_DAY) return null;
    let reason = this.thinkReason;
    if (!reason && !this.plan && this.now - this.lastThink >= THINK_GAP && Math.max(this.feelings.thirst, this.feelings.hunger) < 3) {
      reason = this.wasAsleep ? "woke" : "free";
    }
    if (!reason) return null;
    return { view: this.view(reason) };
  }

  receiveThought(thought: Thought, by: string): void {
    this.thinksToday.count++;
    this.lastThink = this.now;
    this.thinkReason = null;
    this.thinkTrigger = undefined;
    const plan = thought.plan.slice(0, 8);
    this.plan = plan.length > 0 ? { goal: thought.goal, steps: plan, done: 0 } : null;
    this.thoughts.push({ text: thought.text, goal: thought.goal });
    if (this.thoughts.length > 8) this.thoughts.shift();
    this.emit("thought", { by, text: thought.text, goal: thought.goal ?? null, plan: plan.map(describeStep) });
    this.takeStock(thought, by);
  }

  /**
   * Strategy fatigue and capability gaps (Handoff §5, §7) come from the thinker's
   * own words, not from rules: the mind only remembers what the thinker said it
   * is stuck with or lacks, shows it back in later views, and logs it.
   */
  private takeStock(thought: Thought, by: string): void {
    const day = Math.floor(this.now / 1440) + 1;
    if (thought.stuck?.approach.trim()) {
      const entry = { approach: thought.stuck.approach.trim(), change: thought.stuck.change, day };
      this.setAside.push(entry);
      if (this.setAside.length > SET_ASIDE) this.setAside.shift();
      this.emit("strategy.fatigue", { by, ...entry });
    }
    for (const id of thought.solved ?? []) {
      const i = this.gaps.findIndex((g) => g.id === id);
      if (i < 0) continue;
      const [gap] = this.gaps.splice(i, 1);
      this.emit("gap.closed", { by, id, problem: gap!.problem, openedDay: gap!.day });
    }
    const missing = thought.missing;
    if (missing?.problem.trim() && missing.wants.length > 0) {
      const gap = { id: `g${++this.gapCount}`, problem: missing.problem.trim(), wants: missing.wants.map((w) => w.trim()).filter(Boolean), day };
      this.gaps.push(gap);
      this.emit("gap.opened", { by, ...gap });
    }
    if (thought.stuck && thought.stuck.change !== "pause") {
      this.emit("strategy.changed", { by, from: thought.stuck.approach.trim(), change: thought.stuck.change });
    }
    this.weighGuesses(thought, by, day);
  }

  /**
   * Hypotheses and learning (Handoff §5, plan §4) in the thinker's own words.
   * A guess comes with the plan meant to test it; the thinker later says
   * whether it held and what it learned; a lesson becomes a learning event
   * when a later thought says it builds on it. The mind only keeps the
   * books: open guesses and lessons are shown back in later views.
   */
  private weighGuesses(thought: Thought, by: string, day: number): void {
    for (const id of thought.using ?? []) {
      const lesson = this.lessons.find((l) => l.id === id);
      if (!lesson) continue;
      this.emit("learning.applied", { by, use: "thought", chosen: id, instead: "", first: !this.lessonsUsed.has(id) });
      this.lessonsUsed.add(id);
    }
    for (const verdict of thought.checked ?? []) {
      const i = this.guesses.findIndex((g) => g.id === verdict.id);
      if (i < 0) continue;
      const [guess] = this.guesses.splice(i, 1);
      this.emit("experiment.result", { by, hypothesis: guess!.id, success: verdict.held });
      this.emit(verdict.held ? "hypothesis.supported" : "hypothesis.refuted", { by, hypothesis: guess!.id, expect: guess!.expect });
      const learned = verdict.learned.trim();
      if (learned) {
        const lesson = { id: `l${this.lessons.length + 1}`, learned, day };
        this.lessons.push(lesson);
        this.emit("lesson", { by, hypothesis: guess!.id, ...lesson });
      }
    }
    const expect = thought.guess?.trim();
    if (expect) {
      const guess = { id: `h${++this.guessCount}`, expect, plan: thought.plan.slice(0, 8).map(describeStep), day };
      this.guesses.push(guess);
      this.emit("hypothesis.proposed", { by, hypothesis: guess.id, expect, plan: guess.plan });
      if (this.guesses.length > GUESSES_OPEN) {
        const old = this.guesses.shift()!;
        this.emit("hypothesis.dropped", { by, hypothesis: old.id, reason: "never judged" });
      }
    }
  }

  private decideWithThoughts(): Action {
    const f = this.feelings;
    const dark = this.sky.light === "dark";
    const urgent = this.mostUrgent(dark);
    // The body comes first when it really hurts.
    if (urgent.level >= 3) {
      const action = this.pursue(urgent.goal);
      if (action) return action;
    }
    const planned = this.nextPlannedAction();
    if (planned) return planned;
    if (urgent.level >= 2) {
      const action = this.pursue(urgent.goal);
      if (action) return action;
    }
    if (dark && f.tired >= 1) return { kind: "sleep", purpose: "sleep" };
    return f.tired >= 2 ? { kind: "rest", minutes: 30, purpose: "rest" } : { kind: "idle", minutes: THINK_GAP, purpose: "idle" };
  }

  private mostUrgent(dark: boolean): { goal: Purpose; level: number } {
    const f = this.feelings;
    const exposed = this.sky.rain === true && (this.sky.wind === "strong" || f.cold >= 2 || f.wet >= 3);
    const urgency: [Purpose, number][] = [
      ["drink", f.thirst + 0.3],
      ["eat", f.hunger],
      ["sleep", f.tired + (dark ? 1.6 : -1) - (f.tired === 0 ? 2 : 0) - (f.cold >= 3 ? 3 : 0)],
      ["shelter", exposed || f.cold >= 3 ? 2 + f.cold * 0.5 : 0],
    ];
    urgency.sort((a, b) => b[1] - a[1]);
    return { goal: urgency[0]![0], level: urgency[0]![1] };
  }

  /** Turns the next planned step into an action, walking there first if needed. */
  private nextPlannedAction(): Action | null {
    const plan = this.plan;
    if (!plan) return null;
    while (plan.done < plan.steps.length) {
      const step = plan.steps[plan.done]!;
      const result = this.resolveStep(step);
      if (result === "done") {
        plan.done++;
        continue;
      }
      if (typeof result === "string") {
        this.setback(`${describeStep(step)}: ${result}`);
        return { kind: "idle", minutes: 1, purpose: "plan" };
      }
      // Walking towards a step is not the step itself; a move step is done on arrival.
      this.planStepPending = result.kind === step.kind && step.kind !== "move";
      return result;
    }
    // Done: think again right away (a one-minute pause hands over to the thinker).
    this.plan = null;
    this.thinkReason = "plan done";
    return { kind: "idle", minutes: 1, purpose: "plan" };
  }

  /** An action for a step, "done" if nothing is left to do for it, or why it cannot be done. */
  private resolveStep(step: PlanStep): Action | "done" | string {
    const purpose: Purpose = step.kind === "idle" ? "idle" : step.kind === "rest" ? "rest" : step.kind === "sleep" ? "sleep" : "plan";
    const held = (id: string) => this.carriedItems.some((c) => c.item === id);
    const walkTo = (place: string): Action | string => this.stepTowards(place, purpose) ?? "no known way there";
    const atThing = (id: string): Action | null | string => {
      const thing = this.things.get(id);
      if (!thing) return `does not know ${id}`;
      return thing.place === this.here ? null : walkTo(thing.place);
    };
    switch (step.kind) {
      case "move":
        if (!this.places.has(step.to)) return `does not know ${step.to}`;
        return step.to === this.here ? "done" : walkTo(step.to);
      case "idle":
      case "rest":
        return { ...step, minutes: Math.min(120, Math.max(5, Math.round(Number(step.minutes) || 30))), purpose };
      case "sleep":
        return { kind: "sleep", purpose };
      case "drink":
      case "eat":
      case "take": {
        const target = step.kind === "take" ? step.source : step.target;
        const walk = atThing(target);
        if (walk) return walk;
        if (step.kind === "eat" && step.tool && !held(step.tool)) return `not holding ${step.tool}`;
        return { ...step, purpose } as Action;
      }
      case "put": {
        if (!held(step.item)) return `not holding ${step.item}`;
        const walk = atThing(step.onto);
        if (walk) return walk;
        return { ...step, purpose };
      }
      case "drop":
        return held(step.item) ? { ...step, purpose } : `not holding ${step.item}`;
      case "rub":
        if (!held(step.item) || !held(step.against)) return "not holding both pieces";
        return { ...step, purpose };
      case "bind":
        if (!step.items?.every(held) || !held(step.binder)) return "not holding all pieces";
        return { ...step, purpose };
      case "build":
        if (!held(step.item)) return `not holding ${step.item}`;
        return { ...step, purpose };
      case "tie":
        return held(step.binder) ? { ...step, purpose } : `not holding ${step.binder}`;
      default:
        return `cannot do "${(step as { kind: string }).kind}"`;
    }
  }

  /** After an outcome: advance the plan, and stop to think on setbacks and surprises. */
  private followUp(o: Extract<Observation, { kind: "outcome" }>): void {
    const line = this.experienceLine(o);
    this.recent.push(line);
    if (this.recent.length > RECENT) this.recent.shift();
    const signature = `${o.action.kind}:${o.felt.result ?? ""}:${o.felt.taste ?? ""}:${o.felt.tool ?? ""}`;
    const surprising = !this.seenResults.has(signature) && o.action.kind !== "move" && o.action.kind !== "idle";
    this.seenResults.add(signature);
    if (surprising) {
      this.discoveries.push(line);
      if (this.discoveries.length > DISCOVERIES) this.discoveries.shift();
    }
    const wasPlanned = this.planStepPending;
    this.planStepPending = false;
    if (wasPlanned) {
      const doing = describeStep(o.action as unknown as PlanStep).replace(/ purpose=\S+/, "");
      const tried = this.tries.get(doing) ?? { times: 0, results: {}, last: 0 };
      const result = String(o.felt.result ?? (o.success ? "ok" : "failed"));
      tried.times++;
      tried.results[result] = (tried.results[result] ?? 0) + 1;
      tried.last = o.tick;
      this.tries.set(doing, tried);
    }
    if (wasPlanned && this.plan) {
      if (!o.success) return this.setback(line);
      this.plan.done++;
      if (this.plan.done >= this.plan.steps.length) {
        this.plan = null;
        this.thinkReason = "plan done";
      }
    }
    if (surprising && o.action.purpose === "plan") {
      this.thinkReason = "surprise";
      this.thinkTrigger = line;
    }
  }

  private setback(why: string): void {
    this.plan = null;
    this.planStepPending = false;
    this.thinkReason = "setback";
    this.thinkTrigger = why;
  }

  /** Feelings worth remembering: a need getting pressing, or going away. */
  private noteFeelings(before: Feelings, after: Feelings): void {
    if (this.thinking !== "external") return;
    for (const k of Object.keys(after) as (keyof Feelings)[]) {
      const [b, a] = [before[k], after[k]];
      if ((a >= 2 && b < 2) || (a < 2 && b >= 2) || (a >= 3 && b < 3)) {
        const where = this.here ? ` at ${this.here}` : "";
        this.recent.push(`${clock(this.now)}${where}: ${k} ${a > b ? "rose" : "fell"} to ${a} of 4`);
        if (this.recent.length > RECENT) this.recent.shift();
      }
    }
  }

  private experienceLine(o: Extract<Observation, { kind: "outcome" }>): string {
    const felt = Object.entries(o.felt)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
    const step = describeStep(o.action as unknown as PlanStep).replace(/ purpose=\S+/, "");
    return `${clock(o.tick)} at ${this.here ?? "?"}: ${step} -> ${o.success ? "ok" : "failed"}${felt ? ` (${felt})` : ""}`;
  }

  /** The character's own view of everything, for the thinker. Built from observations and memory only. */
  private view(reason: ThinkReason): MindView {
    const t = this.now;
    const beliefs = this.beliefs
      .all()
      .map((b) => ({
        about: b.category,
        doing: b.action,
        effect: b.effect,
        confidence: Math.round(this.beliefs.confidence(b.category, b.action, b.effect) * 100) / 100,
        evidence: Math.round((b.for + b.against) * 10) / 10,
      }))
      .sort((a, b) => b.evidence - a.evidence)
      .slice(0, 25);
    return {
      reason,
      trigger: this.thinkTrigger,
      time: { day: Math.floor(t / 1440) + 1, hour: Math.floor((t % 1440) / 60), minute: t % 60 },
      sky: this.sky,
      here: this.here,
      feelings: this.feelings,
      places: [...this.places].map(([place, p]) => ({ place, features: p.features, exits: p.exits, visited: p.visited })),
      things: [...this.things].map(([id, th]) => ({ id, place: th.place, looks: th.features })),
      holding: this.carriedItems.map((c) => ({ item: c.item, looks: c.features })),
      beliefs,
      recent: [...this.recent],
      discoveries: [...this.discoveries],
      thoughts: [...this.thoughts],
      plan: this.plan ? { goal: this.plan.goal, done: this.plan.done, left: this.plan.steps.slice(this.plan.done) } : undefined,
      ...this.history(),
    };
  }

  /** Tries, set-aside approaches, open gaps, guesses and lessons, each only when there is something to show. */
  private history(): Pick<MindView, "tries" | "setAside" | "gaps" | "guesses" | "lessons"> {
    const tries = [...this.tries]
      .filter(([, t]) => t.times >= TRIES_SHOWN_FROM)
      .sort((a, b) => b[1].last - a[1].last || (a[0] < b[0] ? -1 : 1))
      .slice(0, TRIES_SHOWN)
      .map(([doing, t]) => ({ doing, times: t.times, results: { ...t.results } }));
    return {
      ...(tries.length > 0 ? { tries } : {}),
      ...(this.setAside.length > 0 ? { setAside: this.setAside.map((s) => ({ ...s })) } : {}),
      ...(this.gaps.length > 0 ? { gaps: this.gaps.map((g) => ({ ...g, wants: [...g.wants] })) } : {}),
      ...(this.guesses.length > 0 ? { guesses: this.guesses.map((g) => ({ ...g, plan: [...g.plan] })) } : {}),
      ...(this.lessons.length > 0 ? { lessons: this.lessons.slice(-LESSONS_SHOWN).map((l) => ({ ...l })) } : {}),
    };
  }

  drainEvents(): MindEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // --- goals ---------------------------------------------------------------

  private pursue(goal: Purpose): Action | null {
    switch (goal) {
      case "drink":
        return this.consume("drink", this.feelings.thirst);
      case "eat":
        return this.consume("eat", this.feelings.hunger);
      case "sleep": {
        const spot = this.bestCover(2);
        if (!spot || spot === this.here) return { kind: "sleep", purpose: "sleep" };
        return this.stepTowards(spot, "sleep");
      }
      case "shelter": {
        const spot = this.bestCover(3);
        if (!spot || spot === this.here) {
          if (this.here && this.sky.rain === true && this.rules) this.inquiry.noteWet(this.here, this.feelings.wet);
          return { kind: "rest", minutes: 30, purpose: "shelter" };
        }
        return this.stepTowards(spot, "shelter");
      }
      default:
        return null;
    }
  }

  /** Expected benefit of using a category: chance it helps and works, minus a penalty for harm. */
  private expectation(category: string, use: Use, innateHelp: number, learned: boolean): number {
    const b = this.beliefs;
    const p = (e: Effect) => (learned ? b.confidence(category, use, e, innateHelp) : b.innate(e, innateHelp));
    return p("helps") * (1 - p("fails")) - 1.5 * p("harms");
  }

  private consume(use: Use, need: number): Action | null {
    const threshold = need >= 4 ? -0.6 : 0.1;
    type Choice = { thing: string; place: string; category: string; value: number; tool?: string; label: string };
    let learned: Choice | null = null;
    let innate: Choice | null = null;
    for (const [id, t] of this.things) {
      const prior = use === "drink" ? drinkPrior(t.features) : eatPrior(t.features);
      if (prior <= 0 || t.features.amount === "none") continue;
      const cost = this.distance(t.place);
      if (cost === null) continue;
      const jitter = this.rng.range(0, 0.05);
      const base = -cost / 240 + jitter;
      let withLearning = this.expectation(t.category, use, prior, true);
      let tool: string | undefined;
      let label = t.category;
      // A held piece that has been tried on this kind of food before (experiments, stage 4).
      if (use === "eat") {
        for (const held of this.carriedItems) {
          const key = toolKey(t.category, held.features);
          if (!this.beliefs.experienced(key, "eat")) continue;
          const value = this.expectation(key, use, prior, true);
          if (value > withLearning) [withLearning, tool, label] = [value, held.item, key];
        }
      }
      const withoutLearning = this.expectation(t.category, use, prior, false);
      if (withLearning >= threshold && (!learned || withLearning + base > learned.value)) {
        learned = { thing: id, place: t.place, category: t.category, value: withLearning + base, tool, label };
      }
      if (withoutLearning >= threshold && (!innate || withoutLearning + base > innate.value)) {
        innate = { thing: id, place: t.place, category: t.category, value: withoutLearning + base, label: t.category };
      }
    }
    if (learned?.label !== innate?.label) {
      // Experience made the character choose differently than instinct would have.
      this.emit("learning.applied", {
        use,
        chosen: learned?.label ?? null,
        instead: innate?.label ?? null,
      });
    }
    if (!learned) return this.exploreStep() ?? null;
    if (learned.place === this.here) return { kind: use, target: learned.thing, tool: learned.tool, purpose: use } as Action;
    return this.stepTowards(learned.place, use);
  }

  private exploreStep(): Action | null {
    let target: string | null = null;
    let bestCost = Infinity;
    for (const [id, p] of this.places) {
      if (p.visited) continue;
      const cost = this.distance(id);
      if (cost !== null && cost < bestCost) [target, bestCost] = [id, cost];
    }
    return target ? this.stepTowards(target, "explore") : null;
  }

  private bestCover(maxHops: number): string | null {
    const roofRank: Record<string, number> = { thick: 3, solid: 2.5, thin: 1, none: 0 };
    const built = new Map<string, number>();
    for (const t of this.things.values()) {
      if (t.features.looks === "built") built.set(t.place, roofRank[String(t.features.roof)] ?? 0);
    }
    // Natural cover, or what it built there, whichever looks better.
    const rank = (features: Features, place: string) =>
      Math.max(features.cover === "sheltered" ? 2 : features.cover === "partial" ? 1 : 0, built.get(place) ?? 0);
    let best: string | null = null;
    let bestValue = -Infinity;
    for (const [id, p] of this.places) {
      if (!p.visited) continue;
      const route = this.route(id);
      if (!route || route.hops > maxHops) continue;
      const value = rank(p.features, id) - route.hops * 0.4;
      if (value > bestValue) [best, bestValue] = [id, value];
    }
    return best;
  }

  // --- learning ------------------------------------------------------------

  private learnFromOutcome(o: Extract<Observation, { kind: "outcome" }>): void {
    const a = o.action;
    if (a.kind === "move" && o.success && this.lastMove) {
      this.travel.set(`${this.lastMove.from}>${this.lastMove.to}`, o.minutes);
      this.travel.set(`${this.lastMove.to}>${this.lastMove.from}`, o.minutes);
    }
    if (a.kind === "rest" && a.purpose === "experiment") this.inquiry.recordWetTest();
    if (a.kind !== "drink" && a.kind !== "eat") return;
    const thing = this.things.get(a.target);
    if (!thing) return;
    const { category } = thing;
    const toolFeatures = a.kind === "eat" && a.tool ? this.carriedItems.find((c) => c.item === a.tool)?.features : undefined;
    // With a tool, what is learned is about "this food with this kind of piece".
    const key = toolFeatures ? toolKey(category, toolFeatures) : category;
    const prior = a.kind === "drink" ? drinkPrior(thing.features) : eatPrior(thing.features);
    const learn = (effect: Effect, holds: boolean, weight = 1) =>
      this.recordChange(this.beliefs.update(key, a.kind as Use, effect, holds, o.tick, weight, prior));
    if (a.kind === "eat" && a.tool && this.inquiry.pending?.kind === "tool") {
      const result = o.felt.result;
      if (result !== "none left" && result !== "not holding that" && result !== "not here") {
        this.inquiry.recordTest(o.success, toolFeatures);
      } else {
        this.inquiry.pending = null;
      }
    }

    const result = o.felt.result;
    if (result === "none left") {
      this.things.set(a.target, { ...thing, features: { ...thing.features, amount: "none" } });
      return;
    }
    if (result === "cannot eat this" || result === "nothing to drink") {
      learn("helps", false);
      return;
    }
    if (!o.success) {
      learn("fails", true);
      this.memory.remember({ tick: o.tick, kind: "failed", place: thing.place, thing: a.target, category, salience: 0.4 });
      if (!toolFeatures && typeof result === "string" && this.rules) this.inquiry.noteFoodFailure(category, result);
      return;
    }
    learn("fails", false, 0.5);
    const relief = a.kind === "drink" ? o.felt.thirst : o.felt.hunger;
    if (relief === "eased") learn("helps", true);
    else if (relief === "a little eased" || relief === "barely") learn("helps", true, 0.3);
    else learn("helps", false);
    if (o.felt.thirst === "worse") learn("harms", true);

    this.memory.remember({
      tick: o.tick,
      kind: a.kind === "drink" ? "drank" : "ate",
      place: thing.place,
      thing: a.target,
      category,
      salience: o.felt.thirst === "worse" ? 0.8 : 0.3,
    });
    if (a.kind === "eat") this.pendingMealChecks.push({ tick: o.tick, category });
  }

  /** Nausea came on: blame what was eaten in the last 4 hours (all of it, it cannot tell which). */
  private blameRecentMeals(tick: number): void {
    const meals = this.memory.recall("ate", tick - 240);
    const blamed = new Set<string>();
    for (const meal of meals) if (meal.category) blamed.add(meal.category);
    for (const category of [...blamed].sort()) {
      const thing = [...this.things.values()].find((t) => t.category === category);
      const prior = thing ? eatPrior(thing.features) : undefined;
      this.recordChange(this.beliefs.update(category, "eat", "harms", true, tick, 1, prior));
    }
    this.memory.remember({ tick, kind: "felt_sick", place: this.here, salience: 0.9 });
    // Those meals are already judged; no "it was fine" evidence for them later.
    for (let i = this.pendingMealChecks.length - 1; i >= 0; i--) {
      if (blamed.has(this.pendingMealChecks[i]!.category)) this.pendingMealChecks.splice(i, 1);
    }
  }

  /** A meal 4 hours ago without nausea afterwards is weak evidence that it is harmless. */
  private settleMealChecks(): void {
    while (this.pendingMealChecks.length > 0 && this.now - this.pendingMealChecks[0]!.tick > 240) {
      const { category } = this.pendingMealChecks.shift()!;
      const thing = [...this.things.values()].find((t) => t.category === category);
      const prior = thing ? eatPrior(thing.features) : undefined;
      this.recordChange(this.beliefs.update(category, "eat", "harms", false, this.now, 0.5, prior));
    }
  }

  private recordChange(change: BeliefChange): void {
    const { belief, before, after, formed } = change;
    const crossed = Math.floor(before * 4) !== Math.floor(after * 4);
    if (formed || crossed) {
      this.emit(formed ? "belief.formed" : "belief.changed", {
        category: belief.category,
        action: belief.action,
        effect: belief.effect,
        confidence: Math.round(after * 100) / 100,
      });
    }
  }

  private emit(type: string, data: Record<string, unknown>): void {
    this.events.push({ tick: this.now, type, data });
  }

  // --- way finding over the places it knows --------------------------------

  private stepTowards(target: string, purpose: Purpose): Action | null {
    const route = this.route(target);
    if (!route || !route.first || !this.here) return null;
    this.lastMove = { from: this.here, to: route.first };
    return { kind: "move", to: route.first, purpose };
  }

  private distance(target: string): number | null {
    return this.route(target)?.minutes ?? null;
  }

  /** Cheapest known route (Dijkstra over visited places; unknown ways guessed at 6 minutes). */
  private route(target: string): { first: string | null; minutes: number; hops: number } | null {
    if (!this.here) return null;
    if (target === this.here) return { first: null, minutes: 0, hops: 0 };
    const dist = new Map<string, { minutes: number; hops: number; first: string | null }>([
      [this.here, { minutes: 0, hops: 0, first: null }],
    ]);
    const open = [this.here];
    while (open.length > 0) {
      open.sort((a, b) => dist.get(a)!.minutes - dist.get(b)!.minutes || (a < b ? -1 : 1));
      const node = open.shift()!;
      if (node === target) break;
      const from = dist.get(node)!;
      for (const next of this.places.get(node)?.exits ?? []) {
        const minutes = from.minutes + (this.travel.get(`${node}>${next}`) ?? 6);
        const known = dist.get(next);
        if (!known || minutes < known.minutes) {
          dist.set(next, { minutes, hops: from.hops + 1, first: from.first ?? next });
          if (!open.includes(next)) open.push(next);
        }
      }
    }
    return dist.get(target) ?? null;
  }
}

/** Innate: water-looking things might quench thirst. */
function drinkPrior(f: Features): number {
  return f.looks === "water" ? 0.6 : 0;
}

/** Innate: fruit, shells and small animals might be food. Wood and stone are not. */
function eatPrior(f: Features): number {
  if (f.looks === "plant" && f.fruit === "soft yellow") return 0.6;
  if (f.looks === "plant" && typeof f.fruit === "string") return 0.5;
  if (f.looks === "shells") return 0.45;
  if (f.looks === "animal") return 0.35;
  return 0;
}

/** Belief key for "eating CATEGORY with a held piece of this class". */
function toolKey(category: string, toolFeatures: Features): string {
  return `${category}|with:${toolClass(toolFeatures)}`;
}

function clock(tick: number): string {
  const day = Math.floor(tick / 1440) + 1;
  const h = Math.floor((tick % 1440) / 60);
  const m = tick % 60;
  return `day ${day} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
