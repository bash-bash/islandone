import { describe, expect, it } from "vitest";
import { runBatch } from "../src/batch";
import { runSimulation } from "../src/sim";

describe("determinism (Handoff §36: same seed, same result)", () => {
  it("produces the same fingerprint and events for the same seed", () => {
    const a = runSimulation({ seed: 17, days: 30, keepEvents: true });
    const b = runSimulation({ seed: 17, days: 30, keepEvents: true });
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.log.all()).toEqual(a.log.all());
  });

  it("produces different runs for different seeds", () => {
    const fingerprints = new Set(
      Array.from({ length: 20 }, (_, i) => runSimulation({ seed: i + 1, days: 30 }).fingerprint),
    );
    expect(fingerprints.size).toBe(20);
  });

  it("does not depend on whether events are kept in memory", () => {
    expect(runSimulation({ seed: 5, days: 10, keepEvents: false }).fingerprint).toBe(
      runSimulation({ seed: 5, days: 10, keepEvents: true }).fingerprint,
    );
  });

  it("runs 100 seeds × 30 days reproducibly", () => {
    const a = runBatch({ firstSeed: 1, count: 100, days: 30 });
    const b = runBatch({ firstSeed: 1, count: 100, days: 30 });
    expect(b.summary.batchFingerprint).toBe(a.summary.batchFingerprint);
    expect(b.runs).toEqual(a.runs);
  });

  // Golden fingerprints: change only on purpose, when simulation behaviour is meant to change.
  // Update with `npx vitest run -u` and say why in the commit message.
  it("matches the golden fingerprints", () => {
    const golden = [1, 2, 3].map((seed) => runSimulation({ seed, days: 30 }).fingerprint);
    expect(golden).toMatchSnapshot();
  });
});
