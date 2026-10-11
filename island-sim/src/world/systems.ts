import { TICKS_PER_DAY } from "../core/time";
import type { TickContext } from "../sim";
import { nextWeather } from "./weather";

/** A world system advances one part of the objective world each tick. */
export interface WorldSystem {
  readonly id: string;
  tick(ctx: TickContext): void;
}

export const weatherSystem: WorldSystem = {
  id: "weather",
  tick(ctx) {
    if (ctx.tick % TICKS_PER_DAY !== 0) return;
    const before = ctx.world.weather;
    const after = nextWeather(before, ctx.rng.get("weather"));
    ctx.world.weather = after;
    ctx.log.push({ tick: ctx.tick, source: "weather", type: "weather.day", data: { weather: after, previous: before } });
  },
};

export const WORLD_SYSTEMS: readonly WorldSystem[] = [weatherSystem];
