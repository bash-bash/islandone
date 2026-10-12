import { beforeAll, describe, expect, it } from "vitest";
import { computeMetrics } from "../src/analytics/metrics";
import type { SimEvent } from "../src/core/eventLog";
import { PLACES, THING_SPECS } from "../src/world/island";
import type { Item } from "../src/world/items";
import { structureCover } from "../src/world/structures";
import { attemptChance } from "../src/world/tools";
import { runSimulation } from "../src/sim";

const SEEDS = 30;
let runs: { seed: number; events: readonly SimEvent[]; metrics: ReturnType<typeof computeMetrics> }[] = [];

beforeAll(() => {
  runs = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = runSimulation({ seed, days: 30, keepEvents: true });
    runs.push({ seed, events: result.log.all(), metrics: computeMetrics(result) });
  }
}, 120_000);

const piece = (p: Partial<Item>): Item => ({
  id: "x",
  material: "stone",
  shape: "round",
  length: 0.1,
  mass: 0,
  sharpness: 0,
  hardness: 0,
  area: 0,
  tieStrength: 0,
  ...p,
});

describe("the world decides what a piece is good for (plan stage 4)", () => {
  it("a heavy hard stone cracks shells better than bare hands; a long point catches fish better than a stone", () => {
    const stone = piece({ mass: 1, hardness: 0.9 });
    const spear = piece({ material: "wood", shape: "stick", length: 1.8, mass: 0.4, sharpness: 0.7, hardness: 0.5 });
    expect(attemptChance("coconut_palm", stone)!).toBeGreaterThan(attemptChance("coconut_palm", null)! + 0.3);
    expect(attemptChance("fish", spear)!).toBeGreaterThan(attemptChance("fish", stone)! + 0.2);
  });

  it("leaves on a frame keep more rain off than leaves on the ground", () => {
    const items = new Map<string, Item>();
    for (let i = 0; i < 4; i++) items.set(`l${i}`, piece({ id: `l${i}`, material: "leaf", shape: undefined, area: 0.6 }));
    for (let i = 0; i < 3; i++) items.set(`s${i}`, piece({ id: `s${i}`, material: "wood", shape: "stick", length: 1.4 }));
    const leaves = ["l0", "l1", "l2", "l3"];
    const onGround = structureCover({ id: "a", place: "p1", parts: leaves, bound: new Set() }, items);
    const onFrame = structureCover({ id: "b", place: "p1", parts: [...leaves, "s0", "s1", "s2"], bound: new Set() }, items);
    expect(onFrame).toBeGreaterThan(onGround * 2);
  });
});

describe("problems, hypotheses and experiments (plan stage 4)", () => {
  it("every run finds a way to use pieces for food and builds a shelter", () => {
    for (const r of runs) {
      expect(r.metrics.toolMeals, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.events.some((e) => e.type === "construction.built"), `seed ${r.seed}`).toBe(true);
    }
  });

  it("a method only counts as working after it worked at least twice", () => {
    for (const r of runs) {
      const successes = new Map<unknown, number>();
      for (const e of r.events) {
        if (e.type === "experiment.result" && e.data?.success) successes.set(e.data.hypothesis, (successes.get(e.data.hypothesis) ?? 0) + 1);
        if (e.type === "hypothesis.supported") expect(successes.get(e.data!.hypothesis) ?? 0, `seed ${r.seed}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("after a storm tears the shelter, most runs rebuild it tied", () => {
    let reopened = 0;
    let tiedAfter = 0;
    for (const r of runs) {
      const at = r.events.findIndex((e) => e.type === "problem.reopened");
      if (at < 0) continue;
      reopened++;
      if (r.events.slice(at).some((e) => e.type === "construction.built" && e.data?.tied)) tiedAfter++;
    }
    expect(reopened).toBeGreaterThan(SEEDS / 3);
    expect(tiedAfter / reopened).toBeGreaterThan(0.7);
  });

  it("does not switch back and forth between ideas", () => {
    for (const r of runs) expect(r.metrics.strategyChanges, `seed ${r.seed}`).toBeLessThanOrEqual(20);
  });

  it("hypotheses name pieces by id and look, never by what they really are", () => {
    const kinds = THING_SPECS.map((s) => s.kind);
    const labels = PLACES.map((p) => p.label);
    for (const r of runs) {
      for (const e of r.events) {
        if (!e.type.startsWith("hypothesis.") && !e.type.startsWith("problem.") && !e.type.startsWith("experiment.")) continue;
        const text = JSON.stringify(e.data);
        for (const word of [...kinds, ...labels]) expect(text.includes(`"${word}"`) || text.includes(` ${word}`), `${e.type} ${text}`).toBe(false);
      }
    }
  });
});
