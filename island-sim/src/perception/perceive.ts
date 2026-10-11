import type { Action, Features, Feelings, Level, Observation } from "../mind/types";
import type { ActionResult } from "../world/actions";
import type { Body } from "../world/body";
import type { Thing, ThingKind } from "../world/island";
import { isDark, thingsAt, type WorldState } from "../world/world";

/**
 * The only channel from the objective world to the character (Handoff §5).
 * Turns world truth into what a person on the island could see, feel and
 * taste. Kinds, exact numbers and hidden properties never pass through:
 * e.g. the red berries look like food; that they make you sick is felt only
 * later, as nausea.
 */
export class Perception {
  private lastFeelings = "";
  private lastSky = "";
  private lastThings = new Map<string, string>();

  /** Called once per tick. Returns what the character noticed this tick. */
  perceive(world: WorldState, tick: number, hour: number, arrived: boolean): Observation[] {
    const out: Observation[] = [];

    const skyKey = `${isDark(hour)}|${world.raining}|${world.weather}`;
    if (skyKey !== this.lastSky) {
      this.lastSky = skyKey;
      const sky: Features = {
        light: isDark(hour) ? "dark" : "light",
        rain: world.raining,
        wind: world.weather === "storm" ? "strong" : "light",
        sun: world.weather === "heat" && !isDark(hour) ? "burning" : world.weather === "clear" ? "bright" : "veiled",
      };
      out.push({ tick, kind: "sky", features: sky });
    }

    const feelings = feel(world.body);
    const feelKey = `${feelings.thirst}${feelings.hunger}${feelings.tired}${feelings.cold}${feelings.wet}${feelings.nausea}${feelings.pain}`;
    if (feelKey !== this.lastFeelings) {
      this.lastFeelings = feelKey;
      out.push({ tick, kind: "body", feelings });
    }

    const here = world.character.place;
    if (arrived) {
      const place = world.places.get(here)!;
      out.push({
        tick,
        kind: "place",
        place: here,
        features: {
          cover: place.cover < 0.2 ? "open" : place.cover < 0.5 ? "partial" : "sheltered",
          sea: place.coast,
        },
        exits: [...world.paths.get(here)!.keys()].sort(),
      });
    }
    // Things at the current place: on arrival, and hourly when they look different.
    if (arrived || tick % 60 === 0) {
      for (const thing of thingsAt(world, here)) {
        const features = thingFeatures(thing);
        const key = JSON.stringify(features);
        if (arrived || this.lastThings.get(thing.id) !== key) {
          this.lastThings.set(thing.id, key);
          out.push({ tick, kind: "thing", thing: thing.id, place: here, features });
        }
      }
    }
    return out;
  }

  outcome(tick: number, action: Action, minutes: number, result: ActionResult): Observation {
    return { tick, kind: "outcome", action, success: result.success, minutes, felt: felt(action, result) };
  }
}

function feel(body: Body): Feelings {
  return {
    thirst: rising(body.thirst, [20, 40, 60, 80]),
    hunger: rising(body.hunger, [25, 45, 65, 85]),
    tired: rising(100 - body.energy, [30, 50, 70, 88]),
    cold: rising(100 - body.warmth, [20, 35, 50, 70]),
    wet: rising(body.wetness * 100, [1, 20, 50, 80]),
    nausea: rising(body.sickness, [10, 25, 40, 60]),
    pain: rising(100 - body.health, [10, 30, 50, 70]),
  };
}

function rising(value: number, steps: readonly [number, number, number, number]): Level {
  if (value < steps[0]) return 0;
  if (value < steps[1]) return 1;
  if (value < steps[2]) return 2;
  if (value < steps[3]) return 3;
  return 4;
}

const LOOKS: Record<ThingKind, Features> = {
  spring: { looks: "water", extent: "small", motion: "flowing", clarity: "clear" },
  sea: { looks: "water", extent: "vast", motion: "waves", clarity: "clear" },
  fruit_bush: { looks: "plant", form: "bush", fruit: "soft yellow" },
  red_berry_bush: { looks: "plant", form: "bush", fruit: "small red" },
  coconut_palm: { looks: "plant", form: "tall tree", fruit: "hard round" },
  fiber_plant: { looks: "plant", form: "long tough leaves" },
  shellfish: { looks: "shells", on: "rocks", motion: "still" },
  fish: { looks: "animal", in: "water", motion: "darting" },
  driftwood: { looks: "wood", form: "washed-up pieces" },
  branches: { looks: "wood", form: "fallen sticks" },
  stones: { looks: "stone", form: "loose" },
};

function thingFeatures(thing: Thing): Features {
  const base = LOOKS[thing.kind];
  if (thing.max >= 1e9) return base;
  const a = Math.floor(thing.amount);
  const amount = a <= 0 ? "none" : a <= 2 ? "few" : a <= 8 ? "some" : "many";
  return { ...base, amount };
}

const TASTE: Partial<Record<ThingKind, string>> = {
  spring: "fresh",
  sea: "salty",
  fruit_bush: "sweet",
  red_berry_bush: "bitter",
  coconut_palm: "sweet milk",
  shellfish: "salty soft",
  fish: "rich",
};

const FAILURE: Record<string, string> = {
  too_hard: "shell too hard to open",
  stuck: "could not pry loose",
  too_fast: "slipped away",
  none_left: "none left",
  inedible: "cannot eat this",
  not_drinkable: "nothing to drink",
  not_adjacent: "no way there",
  not_here: "not here",
  failed: "did not work",
};

function felt(action: Action, r: ActionResult): Features {
  if (!r.success) return { result: FAILURE[r.reason ?? "failed"] ?? "did not work" };
  const f: Record<string, string> = {};
  if (r.thingKind && TASTE[r.thingKind]) f.taste = TASTE[r.thingKind]!;
  if (r.thirst !== undefined) f.thirst = r.thirst < -20 ? "eased" : r.thirst < 0 ? "a little eased" : "worse";
  if (r.hunger !== undefined) f.hunger = r.hunger <= -15 ? "eased" : "barely";
  if (action.kind === "move") f.result = "arrived";
  return f;
}
