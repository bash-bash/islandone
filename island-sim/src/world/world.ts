import type { Rng } from "../core/rng";
import type { Action } from "../mind/types";
import { createBody, type Body, type DamageCause } from "./body";
import { PATHS, PLACES, START_PLACE, THING_SPECS, type Place, type Thing } from "./island";
import type { WeatherKind } from "./weather";

/**
 * Objective world state: the simulation's truth (Handoff §4, §5).
 * The character never reads this directly; it only gets observations
 * produced by src/perception.
 */
export interface WorldState {
  weather: WeatherKind;
  /** Whether it is raining in the current hour (rain and storm days). */
  raining: boolean;
  places: ReadonlyMap<string, Place>;
  /** Adjacency: place -> neighbour -> minutes. */
  paths: ReadonlyMap<string, ReadonlyMap<string, number>>;
  things: Map<string, Thing>;
  body: Body;
  character: CharacterState;
  /** Accumulated health damage per cause, for death attribution. */
  damage: Record<DamageCause, number>;
  death: { tick: number; cause: DamageCause } | null;
}

/** Objective state of the character in the world (position, what it is doing). */
export interface CharacterState {
  place: string;
  current: { action: Action; startedAt: number; endsAt: number | null } | null;
}

/** A world is created from the seed: amounts vary per run so seeds differ. */
export function createWorld(rng: Rng): WorldState {
  const paths = new Map<string, Map<string, number>>();
  for (const p of PLACES) paths.set(p.id, new Map());
  for (const [a, b, minutes] of PATHS) {
    paths.get(a)!.set(b, minutes);
    paths.get(b)!.set(a, minutes);
  }

  const things = new Map<string, Thing>();
  THING_SPECS.forEach((spec, i) => {
    const id = `t${i + 1}`;
    const unlimited = spec.max >= 1e9;
    const amount = spec.amount ?? (unlimited ? spec.max : Math.round(spec.max * rng.range(0.4, 1)));
    things.set(id, { ...spec, id, amount });
  });

  return {
    weather: "clear",
    raining: false,
    places: new Map(PLACES.map((p) => [p.id, p])),
    paths,
    things,
    body: createBody(),
    character: { place: START_PLACE, current: null },
    damage: { thirst: 0, hunger: 0, cold: 0, sickness: 0, exhaustion: 0 },
    death: null,
  };
}

export function isDark(hour: number): boolean {
  return hour >= 19 || hour < 6;
}

export function thingsAt(world: WorldState, place: string): Thing[] {
  const out: Thing[] = [];
  for (const t of world.things.values()) if (t.place === place) out.push(t);
  return out;
}
