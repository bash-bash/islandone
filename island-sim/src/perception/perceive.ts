import type { Action, Features, Feelings, Level, Observation } from "../mind/types";
import type { ActionResult } from "../world/actions";
import type { Body } from "../world/body";
import type { Thing, ThingKind } from "../world/island";
import type { Item } from "../world/items";
import { structureCover, type Structure } from "../world/structures";
import { isDark, structureAt, thingsAt, type WorldState } from "../world/world";

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
  private lastInventory = "";

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
          ground: place.ground,
        },
        exits: [...world.paths.get(here)!.keys()].sort(),
      });
    }
    // Things at the current place: on arrival, and hourly when they look different.
    if (arrived || tick % 60 === 0) {
      const seen: { id: string; features: Features }[] = thingsAt(world, here).map((t) => ({ id: t.id, features: thingFeatures(t) }));
      const built = structureAt(world, here);
      if (built) seen.push({ id: built.id, features: structureFeatures(built, world.items) });
      for (const { id, features } of seen) {
        const key = JSON.stringify(features);
        if (arrived || this.lastThings.get(id) !== key) {
          this.lastThings.set(id, key);
          out.push({ tick, kind: "thing", thing: id, place: here, features });
        }
      }
    }

    const carried = world.character.carried;
    const inventoryKey = carried.join(",");
    if (inventoryKey !== this.lastInventory) {
      this.lastInventory = inventoryKey;
      out.push({
        tick,
        kind: "inventory",
        items: carried.map((id) => ({ item: id, features: itemFeatures(world.items.get(id)!) })),
      });
    }
    return out;
  }

  outcome(tick: number, action: Action, minutes: number, result: ActionResult): Observation {
    return { tick, kind: "outcome", action, success: result.success, minutes, felt: felt(action, result) };
  }

  /** Re-announces something built here after the character changed it (so the change is seen at once). */
  forgetPlace(): void {
    this.lastThings.clear();
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
  palm_fronds: { looks: "leaf", form: "fallen fronds" },
};

function weightOf(mass: number): string {
  return mass > 1.5 ? "heavy" : mass > 0.6 ? "hefty" : "light";
}

function lengthOf(length: number): string {
  return length >= 1.3 ? "long" : length >= 0.8 ? "medium" : "short";
}

function tipOf(sharpness: number): string {
  return sharpness >= 0.5 ? "sharp" : sharpness >= 0.25 ? "pointed" : "blunt";
}

/** What a held piece looks and feels like. */
export function itemFeatures(item: Item): Features {
  switch (item.material) {
    case "stone":
      return { looks: "stone", shape: item.shape ?? "round", weight: weightOf(item.mass), edge: tipOf(item.sharpness) };
    case "wood":
      return { looks: "wood", form: item.shape ?? "stick", length: lengthOf(item.length), tip: tipOf(item.sharpness), weight: weightOf(item.mass) };
    case "fiber":
      return { looks: "fiber", form: "strip", feel: item.tieStrength > 0.65 ? "very tough" : "tough" };
    case "leaf":
      return { looks: "leaf", size: item.area > 1.2 ? "very large" : "large" };
    case "bound":
      return {
        looks: "bound",
        length: lengthOf(item.length),
        tip: tipOf(item.sharpness),
        weight: weightOf(item.mass),
        joint: (item.jointStrength ?? 0) > 0.55 ? "tight" : "loose",
      };
  }
}

function structureFeatures(structure: Structure, items: ReadonlyMap<string, Item>): Features {
  const cover = structureCover(structure, items);
  let uprights = 0;
  let leaves = 0;
  for (const id of structure.parts) {
    const item = items.get(id);
    if (item?.material === "leaf") leaves++;
    else if (item && item.length >= 0.9) uprights++;
  }
  return {
    looks: "built",
    roof: cover < 0.15 ? "none" : cover < 0.5 ? "thin" : cover < 0.8 ? "solid" : "thick",
    uprights,
    leaves,
    tied: structure.bound.size === 0 ? "none" : structure.parts.every((id) => structure.bound.has(id)) ? "all" : "some",
  };
}

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
  not_held: "not holding that",
  nothing_loose: "nothing to take",
  hands_full: "hands full",
  does_not_hold: "did not hold",
  failed: "did not work",
};

function felt(action: Action, r: ActionResult): Features {
  if (!r.success) {
    const failed: Record<string, string> = { result: FAILURE[r.reason ?? "failed"] ?? "did not work" };
    if (r.toolBroke) failed.tool = "came apart";
    return failed;
  }
  const f: Record<string, string> = {};
  if (r.thingKind && TASTE[r.thingKind]) f.taste = TASTE[r.thingKind]!;
  if (r.thirst !== undefined) f.thirst = r.thirst < -20 ? "eased" : r.thirst < 0 ? "a little eased" : "worse";
  if (r.hunger !== undefined) f.hunger = r.hunger <= -15 ? "eased" : "barely";
  if (action.kind === "move") f.result = "arrived";
  if (action.kind === "take") f.result = "took";
  if (action.kind === "bind") f.result = "tied";
  if (action.kind === "build") f.result = "added";
  if (action.kind === "tie") f.result = "tied";
  if (r.toolBroke) f.tool = "came apart";
  return f;
}
