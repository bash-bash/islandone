import type { Features } from "./types";

/**
 * Innate physical intuition: rough expectations a person brings along about
 * what might help against a kind of difficulty, judged only from how a piece
 * looks and feels (Handoff §5: no technology names, no hidden properties).
 *
 * These are guesses, not knowledge. Experiments decide (src/mind/inquiry.ts),
 * and plausible-but-wrong ideas (a leaf against a darting fish) get small but
 * non-zero weight on purpose.
 */

/** What went wrong when trying a food source with bare hands. */
export type Difficulty = "hard" | "fast" | "stuck";

export const DIFFICULTY_OF_FAILURE: Record<string, Difficulty> = {
  "shell too hard to open": "hard",
  "slipped away": "fast",
  "could not pry loose": "stuck",
};

/** How promising a piece (or a source of pieces, by its look) seems against a difficulty, 0..1. */
export function appeal(difficulty: Difficulty, f: Features): number {
  const looks = f.looks;
  let v = 0;
  switch (difficulty) {
    case "hard":
      v = looks === "stone" ? 0.5 : looks === "bound" ? 0.3 : looks === "wood" ? (f.form === "chunk" ? 0.35 : 0.2) : 0.02;
      v += f.weight === "heavy" ? 0.2 : f.weight === "hefty" ? 0.1 : 0;
      v += f.edge === "sharp" ? 0.05 : 0;
      break;
    case "fast":
      v = looks === "bound" ? 0.3 : looks === "wood" ? 0.2 : looks === "stone" ? 0.1 : 0.05;
      v += f.length === "long" ? 0.2 : f.length === "medium" ? 0.1 : 0;
      v += f.tip === "sharp" || f.edge === "sharp" ? 0.2 : f.tip === "pointed" || f.edge === "pointed" ? 0.12 : 0;
      break;
    case "stuck":
      v = looks === "stone" ? 0.35 : looks === "bound" ? 0.2 : looks === "wood" ? 0.15 : 0.03;
      v += f.edge === "sharp" ? 0.15 : f.edge === "pointed" ? 0.1 : 0;
      v += f.shape === "flat" ? 0.15 : 0;
      break;
  }
  return Math.min(0.95, v);
}

/** Innate: long tough strips can tie things together. */
export function canTie(f: Features): boolean {
  return f.looks === "fiber" || f.form === "long tough leaves";
}

/** Innate: large leaves keep rain off when held up above you. */
export function keepsRainOff(f: Features): boolean {
  return f.looks === "leaf";
}

/** Innate: long-ish sticks can hold something up. */
export function canHoldUp(f: Features): boolean {
  return f.looks === "wood" && f.form === "stick" && (f.length === "long" || f.length === "medium");
}

/**
 * Coarse class of a held piece used to remember what worked as a tool:
 * "stone/flat", "wood/stick/pointed", "bound/sharp". Finer differences
 * (weight) only steer which piece is picked.
 */
export function toolClass(f: Features): string {
  const parts = [String(f.looks)];
  if (f.shape !== undefined) parts.push(String(f.shape));
  if (f.form !== undefined) parts.push(String(f.form));
  if (f.tip !== undefined) parts.push(String(f.tip));
  return parts.join("/");
}
