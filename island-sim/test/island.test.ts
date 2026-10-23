import { describe, expect, it } from "vitest";
import { REAL_MS_PER_TICK } from "../src/live/feedTypes";
import { advanceIsland, MemoryIslandStore, simVersion, type AdvanceOptions } from "../src/live/island";
import { computeFeed } from "../src/live/live";
import type { MindView } from "../src/mind/thinking";
import { CuriousThinker } from "../src/thinkers/curious";

/** Stands in for Sonnet: no memory between calls (like the API), counts calls and tokens. */
class FakeSonnet {
  readonly name = "llm:fake";
  readonly model = "claude-sonnet-5-5";
  readonly usage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  think(view: MindView) {
    this.usage.calls++;
    this.usage.input += 2000;
    this.usage.output += 500;
    return new CuriousThinker().think(view);
  }
}

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function options(now: number, extra: Partial<AdvanceOptions> = {}): AdvanceOptions & { made: FakeSonnet[] } {
  const made: FakeSonnet[] = [];
  return {
    now,
    month: "2026-10",
    createThinker: () => {
      const t = new FakeSonnet();
      made.push(t);
      return t;
    },
    monthlyBudgetUsd: 43,
    leadMs: 0,
    maxNewThoughts: 1000,
    made,
    ...extra,
  };
}

describe("live island on Vercel (plan stage 7)", () => {
  it("starts an island, stores its thoughts and a feed with the real start time", async () => {
    const store = new MemoryIslandStore();
    const result = await advanceIsland(store, options(T0 + HOUR));
    expect(result).toMatchObject({ status: "ok", island: "island-1", started: "first island" });
    expect(store.meta).toMatchObject({ id: "island-1", seed: 1, startedAt: T0 + HOUR });
    // Just started: tick 0 to 1.
    expect(store.feed!.startedAt).toBe(T0 + HOUR);

    const later = T0 + HOUR + 3 * HOUR;
    await advanceIsland(store, options(later));
    const ticks = Math.floor((3 * HOUR) / REAL_MS_PER_TICK);
    expect(store.feed!.toTick).toBe(ticks);
    expect(store.thoughts.get("island-1")!.length).toBeGreaterThan(5);
  });

  it("asks the thinker only for moments not on record, and the island comes out as if computed in one go", async () => {
    const store = new MemoryIslandStore();
    const steps = [0, 1, 2, 3, 4].map((h) => T0 + h * HOUR);
    let asked = 0;
    for (const now of steps) {
      const o = options(now);
      await advanceIsland(store, o);
      asked += o.made[0]!.usage.calls;
    }
    const recorded = store.thoughts.get("island-1")!;
    expect(asked).toBe(recorded.length);

    const whole = await computeFeed({ seed: 1, fromTick: store.feed!.fromTick, toTick: store.feed!.toTick, thinker: new (class {
      readonly name = "llm:fake";
      think(view: MindView) {
        return new CuriousThinker().think(view);
      }
    })() });
    expect(store.feed!.frames).toEqual(whole.frames);
    expect(store.feed!.moments).toEqual(whole.moments);
  });

  it("never runs twice at the same time", async () => {
    const store = new MemoryIslandStore();
    store.locked = true;
    expect(await advanceIsland(store, options(T0))).toEqual({ status: "busy" });
  });

  it("counts what Claude costs and lets the free thinker take over once the month's budget is spent", async () => {
    const store = new MemoryIslandStore();
    await advanceIsland(store, options(T0));
    await advanceIsland(store, options(T0 + 2 * HOUR));
    const month = "2026-10";
    expect(store.spent.get(month)).toBeGreaterThan(0);

    store.spent.set(month, 43);
    const o = options(T0 + 5 * HOUR);
    await advanceIsland(store, o);
    expect(o.made[0]!.usage.calls).toBe(0);
    const lines = store.thoughts.get("island-1")!;
    expect(lines.at(-1)!.by).toBe("curious-rules");
  });

  it("stops after a few new thoughts per call, keeps them, and carries on next time", async () => {
    const store = new MemoryIslandStore();
    await advanceIsland(store, options(T0));
    const first = await advanceIsland(store, options(T0 + 6 * HOUR, { maxNewThoughts: 3 }));
    expect(first).toMatchObject({ status: "paused", newThoughts: 3 });
    const kept = store.thoughts.get("island-1")!.length;
    expect(kept).toBeGreaterThanOrEqual(3);
    let result = first;
    for (let i = 0; i < 50 && result.status === "paused"; i++) result = await advanceIsland(store, options(T0 + 6 * HOUR, { maxNewThoughts: 3 }));
    expect(result.status).toBe("ok");
    expect(store.thoughts.get("island-1")!.length).toBeGreaterThan(kept);
  });

  it("starts a new island when the simulation code changed or the figure died", async () => {
    const store = new MemoryIslandStore();
    await advanceIsland(store, options(T0));
    store.meta = { ...store.meta!, simVersion: "old" };
    expect(await advanceIsland(store, options(T0 + HOUR))).toMatchObject({ island: "island-2", started: "the simulation changed" });
    expect(store.meta!.seed).toBe(2);
    expect(store.meta!.simVersion).toBe(simVersion());

    // Died at day 1, 15:00: visible until day 2, 06:00, then a new island.
    const startedAt = store.meta!.startedAt;
    store.feed = { ...store.feed!, death: { tick: 15 * 60, cause: "thirst" } };
    const beforeMorning = startedAt + (1440 + 5 * 60) * REAL_MS_PER_TICK;
    expect(await advanceIsland(store, options(beforeMorning))).toMatchObject({ island: "island-2", newThoughts: 0 });
    const morning = startedAt + (1440 + 6 * 60) * REAL_MS_PER_TICK;
    expect(await advanceIsland(store, options(morning))).toMatchObject({ island: "island-3", started: "the figure died" });
  });
});
