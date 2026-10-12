import type { Rng } from "../core/rng";
import type { ThingKind } from "./island";

/**
 * Loose pieces the character can pick up, carry, bind and build with
 * (Handoff §13: primitives, no prefabricated final objects).
 *
 * Every piece has objective physical properties. A bound piece is a small
 * construction graph: its parts plus one joint. What a piece is *good for*
 * is never stored; tools.ts computes effects from the properties.
 */
export type Material = "stone" | "wood" | "fiber" | "leaf";

export interface Item {
  id: string;
  material: Material | "bound";
  /** Shape for loose stones and wood (perceivable). */
  shape?: "round" | "flat" | "jagged" | "stick" | "chunk";
  /** Metres. */
  length: number;
  /** Kilograms. */
  mass: number;
  /** 0 blunt … 1 razor sharp (edge or point). */
  sharpness: number;
  /** 0 soft … 1 very hard. */
  hardness: number;
  /** Leaf area in m², 0 for everything else. */
  area: number;
  /** For fiber: how well it holds when tied (0..1). */
  tieStrength: number;
  /** 0 dry … 1 soaked. Wet pieces are heavier to work with and do not burn. */
  wetness: number;
  /** For bound pieces: the parts and how strong the joint is. */
  parts?: string[];
  jointStrength?: number;
}

/** Which loose pieces a source yields. */
export const PIECE_SOURCES: Partial<Record<ThingKind, true>> = {
  stones: true,
  branches: true,
  driftwood: true,
  fiber_plant: true,
  palm_fronds: true,
};

/** Creates a new loose piece from a source. Variation is random per piece, so the character has to look at what it got. */
export function spawnPiece(kind: ThingKind, id: string, rng: Rng, wetness = 0): Item | null {
  const base = { id, area: 0, tieStrength: 0, wetness };
  switch (kind) {
    case "stones": {
      const shape = rng.weighted([
        ["round", 4],
        ["flat", 3],
        ["jagged", 2],
      ] as const);
      const mass = shape === "round" ? rng.range(0.3, 1.4) : shape === "flat" ? rng.range(0.2, 0.9) : rng.range(0.15, 0.7);
      const sharpness = shape === "jagged" ? rng.range(0.55, 0.85) : shape === "flat" ? rng.range(0.15, 0.35) : rng.range(0, 0.1);
      return { ...base, material: "stone", shape, length: rng.range(0.08, 0.2), mass, sharpness, hardness: rng.range(0.8, 0.95) };
    }
    case "branches": {
      const length = rng.range(0.5, 2.2);
      return {
        ...base,
        material: "wood",
        shape: "stick",
        length,
        mass: length * rng.range(0.25, 0.45),
        sharpness: rng.chance(0.35) ? rng.range(0.25, 0.4) : rng.range(0, 0.15),
        hardness: rng.range(0.35, 0.5),
      };
    }
    case "driftwood": {
      const length = rng.range(0.6, 1.8);
      return { ...base, material: "wood", shape: "chunk", length, mass: length * rng.range(1.2, 2.5), sharpness: 0.05, hardness: 0.5 };
    }
    case "fiber_plant":
      return { ...base, material: "fiber", length: rng.range(0.6, 1.2), mass: 0.05, sharpness: 0, hardness: 0.05, tieStrength: rng.range(0.5, 0.8) };
    case "palm_fronds":
      return { ...base, material: "leaf", length: rng.range(1.2, 2.5), mass: 0.4, sharpness: 0, hardness: 0.05, area: rng.range(0.8, 1.6) };
    default:
      return null;
  }
}

/**
 * Ties two pieces together with a fiber strip. Properties of the result follow
 * from the parts: the longer piece gives the reach, the sharpest part ends up
 * at the tip, the joint is only as good as the fiber.
 */
export function bindPieces(id: string, a: Item, b: Item, binder: Item, rng: Rng): Item {
  const long = a.length >= b.length ? a : b;
  const short = long === a ? b : a;
  return {
    id,
    material: "bound",
    length: long.length + short.length * 0.5,
    mass: a.mass + b.mass + binder.mass,
    sharpness: Math.max(a.sharpness, b.sharpness),
    hardness: Math.max(a.hardness, b.hardness),
    area: a.area + b.area,
    tieStrength: 0,
    wetness: Math.max(a.wetness, b.wetness),
    parts: [a.id, b.id, binder.id],
    jointStrength: binder.tieStrength * rng.range(0.7, 1),
  };
}
