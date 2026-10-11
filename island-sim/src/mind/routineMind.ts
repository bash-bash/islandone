import type { Rng } from "../core/rng";
import type { Action, Features, Feelings, Mind, Observation, Purpose } from "./types";

/**
 * Stage-2 character: innate drives and simple experience, no reasoning yet.
 *
 * What it brings along (innate, not world knowledge): thirst wants water-looking
 * things, hunger wants food-looking things, tiredness wants sleep under cover.
 * What it learns: where places and things are, how long ways take, and per
 * individual thing whether drinking/eating it helped or hurt (including nausea
 * hours later, attributed to what it ate recently).
 *
 * Not yet: beliefs about kinds of things, analogy, hypotheses, experiments
 * (stages 3–5). So it has to find out separately that each patch of sea is salty.
 */
export class RoutineMind implements Mind {
  private here: string | null = null;
  private readonly places = new Map<string, { features: Features; exits: readonly string[]; visited: boolean }>();
  private readonly things = new Map<string, { place: string; features: Features }>();
  private readonly travel = new Map<string, number>();
  private readonly experience = new Map<string, { good: number; bad: number }>();
  private feelings: Feelings = { thirst: 0, hunger: 0, tired: 0, cold: 0, wet: 0, nausea: 0, pain: 0 };
  private sky: Features = { light: "light", rain: false, wind: "light" };
  private readonly recentMeals: { thing: string; tick: number }[] = [];
  private lastMove: { from: string; to: string } | null = null;

  constructor(private readonly rng: Rng) {}

  observe(observations: readonly Observation[]): void {
    for (const o of observations) {
      switch (o.kind) {
        case "place":
          this.here = o.place;
          this.places.set(o.place, { features: o.features, exits: o.exits, visited: true });
          for (const exit of o.exits) {
            if (!this.places.has(exit)) this.places.set(exit, { features: {}, exits: [], visited: false });
          }
          break;
        case "thing":
          this.things.set(o.thing, { place: o.place, features: o.features });
          break;
        case "sky":
          this.sky = o.features;
          break;
        case "body":
          if (o.feelings.nausea >= 2 && this.feelings.nausea < 2) this.blameRecentMeals(o.tick);
          this.feelings = o.feelings;
          break;
        case "outcome":
          this.learnFromOutcome(o);
          break;
      }
    }
  }

  decide(): Action {
    const f = this.feelings;
    const dark = this.sky.light === "dark";
    const exposed = this.sky.rain === true && (this.sky.wind === "strong" || f.cold >= 2 || f.wet >= 3);
    const urgency: [Purpose, number][] = [
      ["drink", f.thirst + 0.3],
      ["eat", f.hunger],
      // Too cold to fall asleep: getting out of the rain comes first.
      // Day-night rhythm: sleep comes easily in the dark; by day only when very tired.
      ["sleep", f.tired + (dark ? 1.6 : -1) - (f.tired === 0 ? 2 : 0) - (f.cold >= 3 ? 3 : 0)],
      ["shelter", exposed || f.cold >= 3 ? 2 + f.cold * 0.5 : 0],
    ];
    urgency.sort((a, b) => b[1] - a[1]);
    const [goal, level] = urgency[0]!;

    if (level >= 2) {
      const action = this.pursue(goal);
      if (action) return action;
    }
    if (!dark && this.rng.chance(0.6)) {
      const explore = this.exploreStep();
      if (explore) return explore;
    }
    return f.tired >= 2 ? { kind: "rest", minutes: 30, purpose: "rest" } : { kind: "idle", minutes: 30, purpose: "idle" };
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
        if (!spot || spot === this.here) return { kind: "rest", minutes: 30, purpose: "shelter" };
        return this.stepTowards(spot, "shelter");
      }
      default:
        return null;
    }
  }

  private consume(kind: "drink" | "eat", need: number): Action | null {
    const desperate = need >= 4;
    let best: { thing: string; place: string; value: number } | null = null;
    for (const [id, t] of this.things) {
      const prior = kind === "drink" ? drinkPrior(t.features) : eatPrior(t.features);
      if (prior <= 0 || t.features.amount === "none") continue;
      const e = this.experience.get(`${kind}:${id}`) ?? { good: 0, bad: 0 };
      const score = (e.good + prior) / (e.good + e.bad + 1);
      if (score < (desperate ? 0.05 : 0.25)) continue;
      const cost = this.distance(t.place);
      if (cost === null) continue;
      const value = score - cost / 240 + this.rng.range(0, 0.05);
      if (!best || value > best.value) best = { thing: id, place: t.place, value };
    }
    if (!best) return this.exploreStep() ?? null;
    if (best.place === this.here) return { kind, target: best.thing, purpose: kind };
    return this.stepTowards(best.place, kind);
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
    const rank = (features: Features) => (features.cover === "sheltered" ? 2 : features.cover === "partial" ? 1 : 0);
    let best: string | null = null;
    let bestValue = -Infinity;
    for (const [id, p] of this.places) {
      if (!p.visited) continue;
      const route = this.route(id);
      if (!route || route.hops > maxHops) continue;
      const value = rank(p.features) - route.hops * 0.4;
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
    if (a.kind !== "drink" && a.kind !== "eat") return;
    if (o.felt.result === "none left") {
      const t = this.things.get(a.target);
      if (t) this.things.set(a.target, { ...t, features: { ...t.features, amount: "none" } });
      return;
    }
    const key = `${a.kind}:${a.target}`;
    const e = this.experience.get(key) ?? { good: 0, bad: 0 };
    const relief = a.kind === "drink" ? o.felt.thirst : o.felt.hunger;
    if (relief === "eased") e.good += 1;
    else if (relief === "a little eased" || relief === "barely") e.good += 0.3;
    else if (relief === "worse") e.bad += 1.5;
    else e.bad += 0.6; // failed attempt
    this.experience.set(key, e);
    if (a.kind === "eat" && o.success) {
      this.recentMeals.push({ thing: a.target, tick: o.tick });
      if (this.recentMeals.length > 8) this.recentMeals.shift();
    }
  }

  /** Nausea came on: blame what was eaten in the last 4 hours. */
  private blameRecentMeals(tick: number): void {
    for (const meal of this.recentMeals) {
      if (tick - meal.tick > 240) continue;
      const e = this.experience.get(`eat:${meal.thing}`) ?? { good: 0, bad: 0 };
      e.bad += 2;
      this.experience.set(`eat:${meal.thing}`, e);
    }
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
