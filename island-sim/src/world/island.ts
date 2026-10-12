/**
 * The island v0 (plan §3, decision 2): a small graph of places, not a physics grid.
 * Place and thing ids are neutral ("p3", "t7") because they also serve as the
 * character's handles; the human-readable `label` and the objective `kind`
 * never leave src/world (see src/perception).
 */

export interface Place {
  id: string;
  /** For humans reading logs only. */
  label: string;
  /** 0 = open sky, 1 = fully covered. Objective; the character sees only "canopy dense" etc. */
  cover: number;
  /** Seawater and shore at this place. */
  coast: boolean;
  /** What is underfoot. Nothing can be set up where it is "water". */
  ground: "sand" | "soil" | "rock" | "water";
}

/** Travel time in virtual minutes (by day; at night ×1.5). */
export type Path = readonly [from: string, to: string, minutes: number];

export type ThingKind =
  | "spring" // fresh water, flowing
  | "sea" // seawater: looks like water, makes thirst worse
  | "fruit_bush" // soft yellow fruit, edible
  | "red_berry_bush" // latent: small red berries, mildly toxic
  | "coconut_palm" // hard round fruit, needs a tool to open
  | "shellfish" // shells on rocks, edible by hand with effort
  | "fish" // fish in shallow water, very hard to catch by hand
  | "driftwood" // loose wood on the beach, more after storms
  | "branches" // fallen branches, more after wind and storms
  | "fiber_plant" // plants with long tough leaves (fiber)
  | "stones" // loose stones: round, flat and sharp-edged
  | "palm_fronds"; // fallen palm leaves, large

export interface Thing {
  id: string;
  kind: ThingKind;
  place: string;
  /** Current amount (portions of food, pieces of material). Unlimited sources use Infinity-like large numbers. */
  amount: number;
  max: number;
  /** Amount regained per virtual hour. */
  regrowPerHour: number;
}

export const PLACES: readonly Place[] = [
  { id: "p1", label: "Strand am Camp", cover: 0, coast: true, ground: "sand" },
  { id: "p2", label: "Palmenhain", cover: 0.3, coast: false, ground: "sand" },
  { id: "p3", label: "Waldrand", cover: 0.5, coast: false, ground: "soil" },
  { id: "p4", label: "Quelle im Inland", cover: 0.4, coast: false, ground: "rock" },
  { id: "p5", label: "Felsen mit Überhang", cover: 0.6, coast: true, ground: "rock" },
  { id: "p6", label: "Flachwasser", cover: 0, coast: true, ground: "water" },
  { id: "p7", label: "Spülsaum", cover: 0, coast: true, ground: "sand" },
];

export const PATHS: readonly Path[] = [
  ["p1", "p2", 3],
  ["p1", "p7", 4],
  ["p1", "p6", 2],
  ["p1", "p5", 6],
  ["p2", "p3", 5],
  ["p3", "p4", 8],
  ["p3", "p5", 7],
  ["p5", "p6", 4],
  ["p5", "p7", 5],
];

export const START_PLACE = "p1";

type ThingSpec = Omit<Thing, "id" | "amount"> & { amount?: number };

/** Base layout. Amounts are varied per seed in createThings(). */
export const THING_SPECS: readonly ThingSpec[] = [
  { kind: "sea", place: "p1", max: 1e9, regrowPerHour: 0 },
  { kind: "sea", place: "p6", max: 1e9, regrowPerHour: 0 },
  { kind: "sea", place: "p7", max: 1e9, regrowPerHour: 0 },
  { kind: "spring", place: "p4", max: 1e9, regrowPerHour: 0 },
  { kind: "coconut_palm", place: "p2", max: 12, regrowPerHour: 0.05 },
  { kind: "palm_fronds", place: "p2", max: 12, regrowPerHour: 0.02 },
  { kind: "fruit_bush", place: "p3", max: 8, regrowPerHour: 0.02 },
  { kind: "red_berry_bush", place: "p3", max: 10, regrowPerHour: 0.3 },
  { kind: "fiber_plant", place: "p3", max: 20, regrowPerHour: 0.1 },
  { kind: "branches", place: "p3", max: 15, regrowPerHour: 0 },
  { kind: "shellfish", place: "p5", max: 10, regrowPerHour: 0.06 },
  { kind: "stones", place: "p5", max: 40, regrowPerHour: 0 },
  { kind: "fish", place: "p6", max: 30, regrowPerHour: 0.2 },
  { kind: "driftwood", place: "p7", max: 20, regrowPerHour: 0 },
  { kind: "stones", place: "p7", max: 15, regrowPerHour: 0 },
];
