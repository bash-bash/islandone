import { fnv1a32 } from "../core/hash";
import type { MindView, PlanStep, Thinker, Thought } from "../mind/thinking";
import type { Features } from "../mind/types";

/**
 * Stand-in for the LLM when none is available (tests, offline runs).
 *
 * It knows no recipes, only curiosity and a few general habits a person has:
 * - try things not tried yet: pick up unfamiliar pieces, rub one against
 *   another, put something onto something, use a piece on food, go somewhere new
 * - repeat what produced a striking result, and look closer at whatever is new
 *   (something glowing: put something on it and see)
 * - when cold, stay by whatever feels warm; keep good things going by doing
 *   again what made them grow
 *
 * Whether fire comes out of this is up to the world and to luck.
 */
export class CuriousThinker implements Thinker {
  readonly name = "curious-rules";
  private readonly tried = new Map<string, number>();
  private readonly striking = new Map<string, number>();
  /** How often a striking thing was repeated; curiosity wears off. */
  private readonly repeats = new Map<string, number>();

  think(view: MindView): Thought {
    this.learn(view);
    const pick = chooser(view);
    const here = view.here;
    const at = (place: string | null) => view.things.filter((t) => t.place === place);
    const held = view.holding;
    // Something glowing or a small flame right here: what happens if I put something on it?
    const glow = at(here).find((t) => t.looks.looks === "glow" || (t.looks.looks === "fire" && t.looks.flames === "low"));
    const fire = view.things.find((t) => t.looks.looks === "fire");
    const f = view.feelings;

    if (glow && held.length > 0) {
      const kind = String(glow.looks.looks);
      const item = this.leastTried(held.map((h) => h.item), (id) => `put:${look(held, id)}:${kind}`, pick);
      const text = kind === "glow" ? "Da glimmt etwas! Was passiert, wenn ich etwas darauflege?" : "Es flackert nur noch klein. Was, wenn ich das hier drauflege?";
      return thought(text, "das Glimmen ansehen", [{ kind: "put", item, onto: glow.id }]);
    }
    // Something warm: stay close when cold or wet, and keep it going.
    if (fire) {
      const fuel = held.find((h) => (this.striking.get(`put:${sig(h.looks)}:fire`) ?? 0) > 0 && h.looks.moisture !== "wet");
      if (fire.looks.flames === "low" && fuel) {
        return thought("Es wird kleiner. Das hier hat es vorhin größer gemacht.", "das Warme am Leben halten", [
          { kind: "move", to: fire.place },
          { kind: "put", item: fuel.item, onto: fire.id },
        ]);
      }
      if (f.cold >= 1 || f.wet >= 2 || view.sky.light === "dark") {
        return thought("Mir ist kalt. Dort ist es warm.", "mich wärmen", [{ kind: "move", to: fire.place }, { kind: "rest", minutes: 40 }]);
      }
      if (fire.looks.flames === "low" && held.length < 4) {
        const wood = this.nearestSource(view, (l) => l.looks === "wood");
        if (wood) return thought("Ich sollte etwas holen, das ich hineinlegen kann.", "das Warme am Leben halten", [{ kind: "take", source: wood.id }]);
      }
    }
    // Repeat the most striking thing I did, if I still can.
    const best = [...this.striking].filter(([s]) => s.startsWith("rub:")).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2 && !fire && (this.repeats.get(best[0]) ?? 0) < 6) {
      this.repeats.set(best[0], (this.repeats.get(best[0]) ?? 0) + 1);
      const [, a, b] = best[0].split(":");
      const ia = held.find((h) => sig(h.looks) === a && h.looks.moisture !== "wet");
      const ib = held.find((h) => sig(h.looks) === b && h.item !== ia?.item && h.looks.moisture !== "wet");
      if (ia && ib) return thought("Vorhin ist dabei etwas passiert. Noch einmal, kräftiger!", "herausfinden, was da passiert", [{ kind: "rub", item: ia.item, against: ib.item }]);
    }

    // Otherwise: something not tried yet.
    const options: { score: number; thought: Thought }[] = [];
    for (const a of held) {
      for (const b of held) {
        if (a.item >= b.item) continue;
        const key = `rub:${pair(a.looks, b.looks)}`;
        options.push({ score: 1 / (1 + (this.tried.get(key) ?? 0)), thought: thought("Was passiert, wenn ich die beiden aneinander reibe?", "ausprobieren", [{ kind: "rub", item: a.item, against: b.item }]) });
      }
      for (const t of at(here)) {
        if (t.looks.looks === "water" || t.looks.looks === "ashes") continue;
        const key = `put:${sig(a.looks)}:${String(t.looks.looks)}`;
        options.push({ score: 0.6 / (1 + (this.tried.get(key) ?? 0)), thought: thought("Ich lege das mal dorthin.", "ausprobieren", [{ kind: "put", item: a.item, onto: t.id }]) });
      }
    }
    if (held.length < 4) {
      for (const t of view.things) {
        if (!["wood", "stone", "leaf"].includes(String(t.looks.looks)) && t.looks.form !== "long tough leaves") continue;
        if (t.looks.amount === "none") continue;
        const key = `take:${sig(t.looks)}`;
        options.push({ score: 0.9 / (1 + (this.tried.get(key) ?? 0)), thought: thought("Davon nehme ich mir ein Stück und sehe es mir an.", "Dinge sammeln", [{ kind: "take", source: t.id }]) });
      }
    } else {
      const drop = held[pick(held.length)]!;
      options.push({ score: 0.3, thought: thought("Die Hände sind voll. Das hier lege ich weg.", "Platz schaffen", [{ kind: "drop", item: drop.item }]) });
    }
    for (const p of view.places) {
      if (!p.visited) options.push({ score: 0.8, thought: thought("Dort war ich noch nicht.", "die Insel kennenlernen", [{ kind: "move", to: p.place }]) });
    }
    if (options.length === 0 || options.every((o) => o.score < 0.15)) {
      return thought("Ich ruhe mich aus und denke nach.", undefined, [{ kind: "rest", minutes: 30 }]);
    }
    options.sort((a, b) => b.score - a.score);
    const top = options.filter((o) => o.score >= options[0]!.score - 0.2);
    const chosen = top[pick(top.length)]!.thought;
    for (const step of chosen.plan) this.noteTried(step, view);
    return chosen;
  }

  /** Reads what happened since last time from the character's own recent experiences. */
  private learn(view: MindView): void {
    const lines = [view.trigger ?? "", ...view.recent.slice(-6)];
    for (const line of lines) {
      const m = /: (rub|put) item=(\S+) (?:against|onto)=(\S+) -> \w+ \(result: ([^),]+)/.exec(line);
      if (!m) continue;
      const [, kind, a, b, result] = m;
      const level = { "glowing dust": 4, "flared up": 4, "it burns": 3, "smoke rose": 2, "got warm": 1 }[result!] ?? 0;
      const la = look(view.holding, a!);
      const key = kind === "rub" ? `rub:${la}:${look(view.holding, b!)}` : `put:${la}:${b!.startsWith("f") ? "fire" : "thing"}`;
      if (la === "?") continue;
      this.striking.set(key, Math.max(this.striking.get(key) ?? 0, level));
    }
  }

  private noteTried(step: PlanStep, view: MindView): void {
    let key: string | null = null;
    if (step.kind === "rub") key = `rub:${pair(lookOf(view, step.item), lookOf(view, step.against))}`;
    if (step.kind === "put") key = `put:${sig(lookOf(view, step.item))}:${String(view.things.find((t) => t.id === step.onto)?.looks.looks)}`;
    if (step.kind === "take") key = `take:${sig(view.things.find((t) => t.id === step.source)?.looks ?? {})}`;
    if (key) this.tried.set(key, (this.tried.get(key) ?? 0) + 1);
  }

  private leastTried(items: string[], keyOf: (id: string) => string, pick: (n: number) => number): string {
    const min = Math.min(...items.map((id) => this.tried.get(keyOf(id)) ?? 0));
    const fresh = items.filter((id) => (this.tried.get(keyOf(id)) ?? 0) === min);
    const id = fresh[pick(fresh.length)]!;
    this.tried.set(keyOf(id), min + 1);
    return id;
  }

  private nearestSource(view: MindView, test: (l: Features) => boolean): { id: string } | undefined {
    const here = view.things.filter((t) => test(t.looks) && t.looks.amount !== "none");
    return here.find((t) => t.place === view.here) ?? here[0];
  }
}

function thought(text: string, goal: string | undefined, plan: PlanStep[]): Thought {
  return { text, goal, plan };
}

/** Look of a piece without how wet it is right now. */
function sig(f: Features): string {
  return [f.looks, f.shape, f.form, f.length].filter((v) => v !== undefined).join("/");
}

function pair(a: Features, b: Features): string {
  return [sig(a), sig(b)].sort().join(":");
}

function look(held: MindView["holding"], id: string): string {
  const h = held.find((x) => x.item === id);
  return h ? sig(h.looks) : "?";
}

function lookOf(view: MindView, id: string): Features {
  return view.holding.find((h) => h.item === id)?.looks ?? {};
}

/** Deterministic choice from the moment (no randomness outside the seed). */
function chooser(view: MindView): (n: number) => number {
  let state = fnv1a32(`${view.time.day}:${view.time.hour}:${view.time.minute}:${view.here}:${view.holding.length}`);
  return (n) => {
    state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) >>> 0;
    return n <= 0 ? 0 : state % n;
  };
}
