import { describe, expect, it } from "vitest";
import { Rng, RngStreams } from "../src/core/rng";

describe("Rng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it("gives different sequences for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 100 }, () => a.nextU32() === b.nextU32()).filter(Boolean).length;
    expect(same).toBeLessThan(3);
  });

  it("keeps a fixed sequence across code changes (golden values)", () => {
    const rng = new Rng(12345);
    expect(Array.from({ length: 4 }, () => rng.nextU32())).toMatchSnapshot();
  });

  it("stays in range and is roughly uniform", () => {
    const rng = new Rng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      buckets[Math.floor(x * 10)]++;
    }
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(500);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(3, 5);
      expect(n === 3 || n === 4 || n === 5).toBe(true);
    }
  });
});

describe("RngStreams", () => {
  it("keeps streams independent: draws in one do not shift another", () => {
    const quiet = new RngStreams(9);
    const busy = new RngStreams(9);
    for (let i = 0; i < 500; i++) busy.get("weather").nextU32();
    const a = Array.from({ length: 20 }, () => quiet.get("mind").nextU32());
    const b = Array.from({ length: 20 }, () => busy.get("mind").nextU32());
    expect(b).toEqual(a);
  });

  it("gives different named streams different sequences", () => {
    const s = new RngStreams(9);
    expect(s.get("weather").nextU32()).not.toBe(s.get("mind").nextU32());
  });
});
