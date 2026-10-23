/**
 * The live feed (plan stage 7): what island-render needs to show the island,
 * computed by island-sim. The viewer is not the character, so the feed speaks
 * in plain words about what really happens (place names, what something is);
 * the character's mind never sees any of it.
 *
 * This file has no imports so island-render can import its types directly.
 */

/** 1440 ticks (one island day) last 11 real hours (decision Chris, 17.10.2026). */
export const REAL_MS_PER_TICK = (11 * 60 * 60 * 1000) / 1440;

export interface FeedPlace {
  id: string;
  label: string;
}

/** Felt needs for the HUD, 0 bad … 100 fine. */
export interface FeedNeeds {
  health: number;
  food: number;
  water: number;
  energy: number;
  warmth: number;
}

/** What the figure is doing, in plain words for viewers. */
export interface FeedDoing {
  kind: string;
  /** e.g. "geht zum Waldrand", "reibt Holz an Holz". */
  label: string;
  /** Destination of a move. */
  to?: string;
  /** Tick the action is planned to end (null: sleeping until it wakes). */
  until: number | null;
}

/** The figure and the world at one tick. Frames come at every new action and every few minutes. */
export interface FeedFrame {
  tick: number;
  place: string;
  doing: FeedDoing;
  needs: FeedNeeds;
  /** 0 dry … 100 soaked. */
  wet: number;
  asleep: boolean;
  carrying: { wood: number; stone: number; fiber: number; leaf: number; bound: number };
  weather: string;
  raining: boolean;
  fires: { place: string; state: "glow" | "flame" | "ashes" }[];
  /** Places with something built. */
  built: string[];
}

export type MomentKind =
  | "thought"
  | "discovery"
  | "guess"
  | "lesson"
  | "stuck"
  | "gap"
  | "solved"
  | "weather"
  | "fire"
  | "storm"
  | "sickness"
  | "death";

/** Something worth telling the viewer, in plain words. */
export interface FeedMoment {
  tick: number;
  kind: MomentKind;
  text: string;
  place: string;
  /** For thoughts: the goal and the planned steps in plain words. */
  goal?: string;
  plan?: string[];
}

export interface Feed {
  version: 1;
  seed: number;
  thinker: string;
  msPerTick: number;
  /** For a live island: the real time (ms since 1970) of tick 0. Without it, a player starts at fromTick. */
  startedAt?: number;
  /** Ticks covered: [fromTick, toTick). */
  fromTick: number;
  toTick: number;
  places: FeedPlace[];
  frames: FeedFrame[];
  moments: FeedMoment[];
  death?: { tick: number; cause: string };
}
