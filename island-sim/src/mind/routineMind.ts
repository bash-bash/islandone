import type { Rng } from "../core/rng";
import { BeliefStore, type BeliefChange, type Effect } from "./beliefs";
import { categoryOf } from "./categories";
import { Inquiry, type InquiryHost } from "./inquiry";
import { toolClass } from "./intuition";
import { EpisodicMemory } from "./memory";
import type { Action, Features, Feelings, Mind, MindEvent, Observation, Purpose } from "./types";

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

  constructor(private readonly rng: Rng) {
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
          if (o.features.looks === "built") this.inquiry.noteStructure(o.place, o.features);
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
          this.feelings = o.feelings;
          if (this.here && this.sky.rain === true && ["sleep", "shelter", "rest"].includes(this.lastPurpose)) {
            this.inquiry.noteWet(this.here, o.feelings.wet);
          }
          break;
        case "inventory":
          this.carriedItems = o.items.map(({ item, features }) => {
            if (!this.origins.has(item) && this.pendingTake) this.origins.set(item, this.pendingTake);
            return { item, features, origin: this.origins.get(item) };
          });
          this.pendingTake = null;
          this.inquiry.noteHeldPieces();
          break;
        case "outcome":
          this.learnFromOutcome(o);
          break;
      }
    }
    this.settleMealChecks();
  }

  decide(tick: number): Action {
    this.now = tick;
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
          if (this.here && this.sky.rain === true) this.inquiry.noteWet(this.here, this.feelings.wet);
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
      if (!toolFeatures && typeof result === "string") this.inquiry.noteFoodFailure(category, result);
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
