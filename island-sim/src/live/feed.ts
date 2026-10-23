import type { SimEvent } from "../core/eventLog";
import type { Action } from "../mind/types";
import type { ThingKind } from "../world/island";
import { PLACES } from "../world/island";
import type { WorldState } from "../world/world";
import { REAL_MS_PER_TICK, type Feed, type FeedDoing, type FeedFrame, type FeedMoment, type MomentKind } from "./feedTypes";

/**
 * Turns a running simulation into the live feed for island-render (plan stage 7).
 * It only watches: hooked into runSimulation's onEvent and onTick, it never
 * changes the run, so the fingerprint stays the same with or without it.
 */

/** A frame at least this often, so needs and the clock move smoothly between actions. */
const FRAME_EVERY_TICKS = 10;

const TO_PLACE: Record<string, string> = {
  p1: "zum Strand am Camp",
  p2: "zum Palmenhain",
  p3: "zum Waldrand",
  p4: "zur Quelle im Inland",
  p5: "zu den Felsen mit Überhang",
  p6: "ins Flachwasser",
  p7: "zum Spülsaum",
};

const THING: Record<ThingKind, string> = {
  spring: "Quellwasser",
  sea: "Meerwasser",
  fruit_bush: "gelbe Früchte",
  red_berry_bush: "rote Beeren",
  coconut_palm: "Kokosnüsse",
  shellfish: "Muscheln",
  fish: "Fische",
  driftwood: "Treibholz",
  branches: "Äste",
  fiber_plant: "Fasern",
  stones: "Steine",
  palm_fronds: "Palmwedel",
};

const MATERIAL: Record<string, string> = { wood: "Holz", stone: "Stein", fiber: "Faser", leaf: "Blatt", bound: "Gebundenes" };

const WEATHER: Record<string, string> = {
  clear: "Ein klarer Tag beginnt.",
  cloudy: "Der Himmel zieht zu.",
  rain: "Ein Regentag beginnt.",
  storm: "Ein Sturm zieht auf.",
  heat: "Ein heißer Tag beginnt.",
};

const DEATH: Record<string, string> = {
  thirst: "verdurstet",
  hunger: "verhungert",
  cold: "erfroren",
  sickness: "an Übelkeit gestorben",
  exhaustion: "vor Erschöpfung gestorben",
};

export class FeedRecorder {
  private readonly frames: FeedFrame[] = [];
  private readonly moments: FeedMoment[] = [];
  private death: Feed["death"];
  private dirty = true;
  private lastTick = -1;

  constructor(
    private readonly seed: number,
    private readonly thinker: string,
    /** Only ticks from here on go into the feed (the run itself always starts at 0). */
    private readonly fromTick = 0,
  ) {}

  readonly onEvent = (e: SimEvent, world: Readonly<WorldState>): void => {
    if (e.type === "action.start" || e.type === "action.end") this.dirty = true;
    if (e.tick < this.fromTick) return;
    const here = world.character.place;
    const d = e.data ?? {};
    const add = (kind: MomentKind, text: string, extra: Partial<FeedMoment> = {}) =>
      this.moments.push({ tick: e.tick, kind, text, place: here, ...extra });
    switch (e.type) {
      case "thought": {
        const plan = (d.plan as string[]).map((step) => stepLabel(step, world));
        add("thought", String(d.text), { ...(d.goal ? { goal: String(d.goal) } : {}), plan });
        break;
      }
      case "hypothesis.proposed":
        if (d.by) add("guess", `Vermutung: ${String(d.expect)}`);
        break;
      case "lesson":
        add("lesson", `Gelernt: ${String(d.learned)}`);
        break;
      case "strategy.fatigue":
        add("stuck", `Kommt mit „${String(d.approach)}“ nicht weiter und versucht etwas anderes.`);
        break;
      case "gap.opened":
        add("gap", `Es fehlt etwas: ${String(d.problem)} (bräuchte: ${(d.wants as string[]).join(", ")})`);
        break;
      case "gap.closed":
        add("solved", `Gelöst: ${String(d.problem)}`);
        break;
      case "category.discovered": {
        const thing = world.things.get(String(d.thing));
        if (thing) add("discovery", `Entdeckt: ${THING[thing.kind]}`);
        break;
      }
      case "action.end":
        if (d.rub === "smoke") add("fire", "Das Holz raucht!");
        if (d.rub === "glow") add("fire", "Glühender Staub!");
        if (d.put === "flared up") add("fire", "Es brennt! Ein Feuer.");
        break;
      case "fire.out":
        add("fire", "Das Feuer ist aus.");
        break;
      case "weather.day":
        add("weather", WEATHER[String(d.weather)] ?? String(d.weather));
        break;
      case "storm.washed_up":
        add("storm", "Der Sturm spült Treibholz an.");
        break;
      case "structure.damaged":
        add("storm", "Der Sturm beschädigt den Unterstand.");
        break;
      case "sickness.onset":
        add("sickness", "Der Figur wird übel.");
        break;
      case "death":
        add("death", `Die Figur ist ${DEATH[String(d.cause)] ?? "gestorben"}.`);
        this.death = { tick: e.tick, cause: String(d.cause) };
        break;
    }
  };

  readonly onTick = (tick: number, world: Readonly<WorldState>): void => {
    this.lastTick = tick;
    if (tick < this.fromTick) return;
    if (!this.dirty && tick !== this.fromTick && (tick - this.fromTick) % FRAME_EVERY_TICKS !== 0) return;
    this.dirty = false;
    this.frames.push(frameOf(tick, world));
  };

  feed(): Feed {
    return {
      version: 1,
      seed: this.seed,
      thinker: this.thinker,
      msPerTick: REAL_MS_PER_TICK,
      fromTick: this.fromTick,
      toTick: Math.max(this.fromTick, this.lastTick + 1),
      places: PLACES.map((p) => ({ id: p.id, label: p.label })),
      frames: this.frames,
      moments: this.moments,
      ...(this.death ? { death: this.death } : {}),
    };
  }
}

function frameOf(tick: number, world: Readonly<WorldState>): FeedFrame {
  const b = world.body;
  const carrying = { wood: 0, stone: 0, fiber: 0, leaf: 0, bound: 0 };
  for (const id of world.character.carried) {
    const item = world.items.get(id);
    if (item) carrying[item.material]++;
  }
  const current = world.character.current;
  const round = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
  return {
    tick,
    place: world.character.place,
    doing: current ? doingOf(current.action, current.endsAt, world) : { kind: "idle", label: "steht da", until: tick },
    needs: { health: round(b.health), food: round(100 - b.hunger), water: round(100 - b.thirst), energy: round(b.energy), warmth: round(b.warmth) },
    wet: round(b.wetness * 100),
    asleep: b.asleep,
    carrying,
    weather: world.weather,
    raining: world.raining,
    fires: [...world.fires.values()].map((f) => ({ place: f.place, state: f.state })),
    built: [...new Set([...world.structures.values()].map((s) => s.place))].sort(),
  };
}

function doingOf(action: Action, until: number | null, world: Readonly<WorldState>): FeedDoing {
  const { kind, purpose: _purpose, ...args } = action as Action & Record<string, unknown>;
  return { kind, label: label(kind, args, world), ...(kind === "move" ? { to: String(args.to) } : {}), until };
}

/** "take source=t14" (a step as the thought log writes it) in plain words. */
function stepLabel(step: string, world: Readonly<WorldState>): string {
  const [kind = "", ...pairs] = step.split(" ");
  const args: Record<string, unknown> = {};
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (k && v !== undefined) args[k] = v.includes("+") ? v.split("+") : v;
  }
  return label(kind, args, world);
}

function label(kind: string, args: Record<string, unknown>, world: Readonly<WorldState>): string {
  const thing = (id: unknown) => {
    const t = world.things.get(String(id));
    return t ? THING[t.kind] : "etwas";
  };
  const item = (id: unknown) => MATERIAL[world.items.get(String(id))?.material ?? ""] ?? "etwas";
  switch (kind) {
    case "move":
      return `geht ${TO_PLACE[String(args.to)] ?? "weiter"}`;
    case "drink":
      return `trinkt ${thing(args.target)}`;
    case "eat":
      return `isst ${thing(args.target)}${args.tool ? ` mit ${item(args.tool)}` : ""}${args.over ? " über dem Feuer" : ""}`;
    case "take":
      return `sammelt ${thing(args.source)}`;
    case "drop":
      return `legt ${item(args.item)} ab`;
    case "bind":
      return "bindet zwei Teile zusammen";
    case "build":
      return `baut mit ${item(args.item)}`;
    case "tie":
      return "bindet den Bau fest";
    case "rub":
      return `reibt ${item(args.item)} an ${item(args.against)}`;
    case "put":
      return `legt ${item(args.item)} ${world.fires.has(String(args.onto)) ? "ins Feuer" : "auf den Bau"}`;
    case "sleep":
      return "schläft";
    case "rest":
      return "ruht sich aus";
    case "idle":
      return "wartet";
    default:
      return kind;
  }
}
