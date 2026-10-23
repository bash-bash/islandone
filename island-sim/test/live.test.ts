import { describe, expect, it } from "vitest";
import { FeedRecorder } from "../src/live/feed";
import { REAL_MS_PER_TICK } from "../src/live/feedTypes";
import { computeFeed } from "../src/live/live";
import { runSimulation } from "../src/sim";
import { CuriousThinker } from "../src/thinkers/curious";

describe("live feed (plan stage 7)", () => {
  it("one island day lasts 11 real hours", () => {
    expect(REAL_MS_PER_TICK * 1440).toBe(11 * 60 * 60 * 1000);
  });

  it("only watches: the run's fingerprint is the same with and without it", () => {
    const plain = runSimulation({ seed: 5, days: 2, thinker: new CuriousThinker() });
    const recorder = new FeedRecorder(5, "curious");
    const watched = runSimulation({ seed: 5, days: 2, thinker: new CuriousThinker(), onEvent: recorder.onEvent, onTick: recorder.onTick });
    expect(watched.fingerprint).toBe(plain.fingerprint);
    expect(recorder.feed().frames.length).toBeGreaterThan(2 * 144);
  });

  it("stopping at a tick gives the start of the longer run, so the island can be computed up to now", async () => {
    const short = await computeFeed({ seed: 2, toTick: 600, thinker: new CuriousThinker() });
    const long = await computeFeed({ seed: 2, toTick: 1200, thinker: new CuriousThinker() });
    expect(short.toTick).toBe(600);
    expect(long.frames.filter((f) => f.tick < 600)).toEqual(short.frames);
    expect(long.moments.filter((m) => m.tick < 600)).toEqual(short.moments);
  });

  it("a window starts with a full frame and matches the same stretch of the whole run", async () => {
    const whole = await computeFeed({ seed: 4, toTick: 900, thinker: new CuriousThinker() });
    const window = await computeFeed({ seed: 4, fromTick: 300, toTick: 900, thinker: new CuriousThinker() });
    expect(window.frames[0]!.tick).toBe(300);
    expect(window.frames.filter((f) => f.tick > 300)).toEqual(whole.frames.filter((f) => f.tick > 300));
    expect(window.moments).toEqual(whole.moments.filter((m) => m.tick >= 300));
  });

  it("tells viewers in plain words, with thoughts, goals and steps", async () => {
    const feed = await computeFeed({ seed: 1, toTick: 1440, thinker: new CuriousThinker() });
    const thought = feed.moments.find((m) => m.kind === "thought" && m.plan && m.plan.length > 0);
    expect(thought).toBeDefined();
    for (const step of thought!.plan!) expect(step).not.toMatch(/\b[tip]\d+\b|=/);
    for (const f of feed.frames) {
      expect(feed.places.map((p) => p.id)).toContain(f.place);
      expect(f.doing.label).not.toMatch(/\b[tip]\d+\b/);
      for (const v of Object.values(f.needs)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
