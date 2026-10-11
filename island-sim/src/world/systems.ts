import { TICKS_PER_DAY, TICKS_PER_HOUR, timeOf } from "../core/time";
import type { TickContext } from "../sim";
import { tickBody, type DamageCause } from "./body";
import { nextWeather } from "./weather";
import { isDark } from "./world";
import { isActive } from "./actions";

/** A world system advances one part of the objective world each tick. */
export interface WorldSystem {
  readonly id: string;
  tick(ctx: TickContext): void;
}

/** Chance per hour that it rains, by weather of the day. */
const RAIN_PER_HOUR = { clear: 0, cloudy: 0.05, rain: 0.5, storm: 0.85, heat: 0 } as const;

export const weatherSystem: WorldSystem = {
  id: "weather",
  tick(ctx) {
    const { world, log, tick } = ctx;
    const rng = ctx.rng.get("weather");
    if (tick % TICKS_PER_DAY === 0) {
      const before = world.weather;
      // Storm consequences are causal (Handoff §11): waves bring driftwood, wind breaks branches.
      if (before === "storm" && tick > 0) stormAftermath(ctx);
      world.weather = nextWeather(before, rng);
      log.push({ tick, source: "weather", type: "weather.day", data: { weather: world.weather, previous: before } });
    }
    if (tick % TICKS_PER_HOUR === 0) {
      const raining = rng.chance(RAIN_PER_HOUR[world.weather]);
      if (raining !== world.raining) {
        world.raining = raining;
        log.push({ tick, source: "weather", type: raining ? "rain.start" : "rain.stop" });
      }
    }
  },
};

function stormAftermath(ctx: TickContext): void {
  const rng = ctx.rng.get("weather");
  for (const thing of ctx.world.things.values()) {
    let added = 0;
    if (thing.kind === "driftwood") added = rng.int(2, 6);
    if (thing.kind === "branches") added = rng.int(1, 4);
    if (added > 0) {
      thing.amount += added;
      ctx.log.push({ tick: ctx.tick, source: "weather", type: "storm.washed_up", data: { thing: thing.id, added } });
    }
  }
}

/** Food regrows, fish recover (Handoff §12: slowly, so pressure matters later). */
export const regrowSystem: WorldSystem = {
  id: "regrow",
  tick(ctx) {
    if (ctx.tick % TICKS_PER_HOUR !== 0) return;
    for (const thing of ctx.world.things.values()) {
      if (thing.regrowPerHour > 0 && thing.amount < thing.max) {
        thing.amount = Math.min(thing.max, thing.amount + thing.regrowPerHour);
      }
    }
  },
};

export const bodySystem: WorldSystem = {
  id: "body",
  tick(ctx) {
    const { world, tick, log } = ctx;
    if (world.death) return;
    const place = world.places.get(world.character.place)!;
    const current = world.character.current;
    const hour = timeOf(tick).hour;
    const damage = tickBody(world.body, {
      raining: world.raining,
      windy: world.weather === "storm",
      hot: world.weather === "heat" && !isDark(hour),
      dark: isDark(hour),
      cover: place.cover,
      active: current ? isActive(world, current.action) : false,
    });
    for (const [cause, amount] of Object.entries(damage) as [DamageCause, number][]) world.damage[cause] += amount;
    if (world.body.health <= 0) {
      const cause = dominantCause(damage);
      world.death = { tick, cause };
      log.push({ tick, source: "body", type: "death", data: { cause, place: place.id } });
    }
  },
};

function dominantCause(damage: Partial<Record<DamageCause, number>>): DamageCause {
  let best: DamageCause = "thirst";
  let max = -1;
  for (const [cause, amount] of Object.entries(damage) as [DamageCause, number][]) {
    if (amount > max) [best, max] = [cause, amount];
  }
  return best;
}

export const WORLD_SYSTEMS: readonly WorldSystem[] = [weatherSystem, regrowSystem, bodySystem];
