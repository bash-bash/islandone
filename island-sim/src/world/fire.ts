import type { Rng } from "../core/rng";
import type { Item } from "./items";

/**
 * Fire as plain physics (Handoff §4, §11). Nothing here tells the character
 * that fire exists or how to make it. Rubbing dry wood on wood gets warm,
 * then smokes, sometimes leaves glowing dust; glowing dust with something dry
 * and fine on it flares up; a flame eats wood and goes out in rain. What the
 * character makes of the smoke and the warmth is up to its mind.
 */

export interface Fire {
  id: string;
  place: string;
  /** "glow": a tiny ember that dies within minutes; "flame": burning; "ashes": out. */
  state: "glow" | "flame" | "ashes";
  /** Minutes of burning left. */
  fuel: number;
}

/** How long glowing dust lives without something to catch. */
export const GLOW_MINUTES = 8;

/** What rubbing one held piece against another produces. */
export type RubResult = "nothing" | "warm" | "smoke" | "glow";

export function rub(a: Item, b: Item, rng: Rng): RubResult {
  if (a.material !== "wood" || b.material !== "wood") return "nothing";
  // A thin stick turned on a broader piece concentrates the friction.
  const stick = (i: Item) => i.shape === "stick" && i.length >= 0.3 && i.length <= 1.3;
  const shapeFactor = stick(a) !== stick(b) ? 1 : stick(a) ? 0.6 : 0.4;
  const dryness = (1 - a.wetness) * (1 - b.wetness);
  const heat = shapeFactor * dryness * dryness;
  if (heat > 0.5 && rng.chance(0.35 * heat)) return "glow";
  if (heat > 0.3) return "smoke";
  if (heat > 0.08) return "warm";
  return "nothing";
}

/** What putting a piece onto a fire or glow does. */
export type FeedResult = "flared up" | "burns" | "went out" | "nothing";

export function feed(fire: Fire, item: Item, rng: Rng): FeedResult {
  if (fire.state === "ashes") return "nothing";
  const fine = item.material === "fiber" || item.material === "leaf";
  if (fire.state === "glow") {
    if (!fine) return "nothing";
    if (item.wetness > 0.6 || (item.wetness > 0.25 && !rng.chance(0.3))) {
      fire.state = "ashes";
      fire.fuel = 0;
      return "went out";
    }
    fire.state = "flame";
    fire.fuel = 10;
    return "flared up";
  }
  if (item.material === "stone") return "nothing";
  // Wet wood on a small flame smothers it.
  if (!fine && item.wetness > 0.6 && fire.fuel < 15 && rng.chance(0.6)) {
    fire.state = "ashes";
    fire.fuel = 0;
    return "went out";
  }
  fire.fuel += fine ? 4 : item.mass * 90 * (1 - item.wetness * 0.7);
  return "burns";
}

/** One minute of burning; exposure 0..1 is how much rain reaches the spot. */
export function burn(fire: Fire, raining: boolean, exposure: number, rng: Rng): void {
  if (fire.state === "ashes") return;
  fire.fuel -= 1 + (raining ? 2 * exposure : 0);
  if (fire.state === "flame" && raining && fire.fuel < 10 && rng.chance(0.05 * exposure)) fire.fuel = 0;
  if (fire.fuel <= 0) {
    fire.state = "ashes";
    fire.fuel = 0;
  }
}
