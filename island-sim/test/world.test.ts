import { describe, expect, it } from "vitest";
import { TICKS_PER_DAY } from "../src/core/time";
import { computeMetrics } from "../src/analytics/metrics";
import { runSimulation } from "../src/sim";
import type { Mind } from "../src/mind/types";

/** A character that never does anything: the body alone must decide its fate. */
const doNothing = (): Mind => ({
  observe() {},
  decide: () => ({ kind: "idle", minutes: 60, purpose: "idle" }),
});

describe("body and survival (plan stage 2)", () => {
  it("a character that never drinks dies of thirst after a few days", () => {
    for (const seed of [1, 2, 3]) {
      const r = runSimulation({ seed, days: 30, createMind: doNothing });
      expect(r.world.death?.cause).toBe("thirst");
      const days = r.world.death!.tick / TICKS_PER_DAY;
      expect(days).toBeGreaterThan(2.5);
      expect(days).toBeLessThan(6);
    }
  });

  it("the routine character finds fresh water on the first day and survives a month", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = computeMetrics(runSimulation({ seed, days: 30, keepEvents: true }));
      expect(m.survived).toBe(1);
      expect(m.hoursToFreshWater).not.toBeNull();
      expect(m.hoursToFreshWater!).toBeLessThan(24);
    }
  });

  it("learns from bad experiences: each patch of sea and each berry bush is tried only briefly", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = runSimulation({ seed, days: 30, keepEvents: true });
      const perThing = new Map<string, number>();
      for (const e of r.log.all()) {
        const d = e.data ?? {};
        if (e.type !== "action.start" || (d.kind !== "drink" && d.kind !== "eat")) continue;
        const end = r.log.all().find((x) => x.tick > e.tick && x.type === "action.end");
        const kind = end?.data?.thingKind;
        if (kind === "sea" || kind === "red_berry_bush") {
          perThing.set(d.target as string, (perThing.get(d.target as string) ?? 0) + 1);
        }
      }
      for (const count of perThing.values()) expect(count).toBeLessThanOrEqual(2);
    }
  });
});
