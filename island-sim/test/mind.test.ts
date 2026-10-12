import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/analytics/metrics";
import { BeliefStore } from "../src/mind/beliefs";
import { categoryOf } from "../src/mind/categories";
import { runSimulation } from "../src/sim";

describe("categories (the character's own grouping by look)", () => {
  it("ignores how many are left and the order of features", () => {
    expect(categoryOf({ looks: "plant", fruit: "red", amount: "few" })).toBe(
      categoryOf({ fruit: "red", looks: "plant", amount: "none" }),
    );
    expect(categoryOf({ looks: "water", extent: "vast" })).not.toBe(categoryOf({ looks: "water", extent: "small" }));
  });
});

describe("beliefs with confidence", () => {
  it("start at the innate expectation and move with evidence, never to certainty", () => {
    const b = new BeliefStore();
    expect(b.confidence("c", "drink", "helps", 0.6)).toBeCloseTo(0.6);
    b.update("c", "drink", "helps", false, 1, 1, 0.6);
    const afterOneBad = b.confidence("c", "drink", "helps", 0.6);
    expect(afterOneBad).toBeLessThan(0.6);
    for (let i = 0; i < 20; i++) b.update("c", "drink", "helps", true, 2 + i, 1, 0.6);
    const afterManyGood = b.confidence("c", "drink", "helps", 0.6);
    expect(afterManyGood).toBeGreaterThan(0.9);
    expect(afterManyGood).toBeLessThan(1);
    expect(b.innate("helps", 0.6)).toBeCloseTo(0.6);
  });
});

describe("learning changes behaviour (Handoff §5)", () => {
  it("transfers: after tasting the sea once it never tastes another patch of sea", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const m = computeMetrics(runSimulation({ seed, days: 30, keepEvents: true }));
      expect(m.seawaterDrinks).toBeLessThanOrEqual(1);
    }
  }, 60_000);

  it("blames nausea on recent meals, hours after eating", () => {
    let checked = 0;
    for (let seed = 1; seed <= 100 && checked < 3; seed++) {
      const r = runSimulation({ seed, days: 30, keepEvents: true });
      const events = r.log.all();
      const berry = events.find((e) => e.type === "action.end" && e.data?.thingKind === "red_berry_bush" && e.data.success);
      if (!berry) continue;
      checked++;
      const onset = events.find((e) => e.type === "sickness.onset" && e.tick > berry.tick);
      expect(onset).toBeDefined();
      expect(onset!.tick - berry.tick).toBeGreaterThanOrEqual(60);
      const blame = events.find(
        (e) =>
          e.tick >= onset!.tick &&
          e.source === "mind" &&
          (e.type === "belief.formed" || e.type === "belief.changed") &&
          e.data?.effect === "harms" &&
          String(e.data?.category).includes("small red"),
      );
      expect(blame).toBeDefined();
    }
    expect(checked).toBeGreaterThan(0);
  }, 60_000);

  it("every run has at least one decision shaped by learning", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = computeMetrics(runSimulation({ seed, days: 30, keepEvents: true }));
      expect(m.learningEvents).toBeGreaterThanOrEqual(1);
      expect(m.decisionsShapedByLearning).toBeGreaterThanOrEqual(m.learningEvents);
    }
  }, 60_000);
});
