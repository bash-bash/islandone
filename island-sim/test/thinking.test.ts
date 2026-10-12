import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/analytics/metrics";
import { RngStreams } from "../src/core/rng";
import type { MindView, Thinker, Thought } from "../src/mind/thinking";
import { runSimulation } from "../src/sim";
import { CuriousThinker } from "../src/thinkers/curious";
import { RecordedThinker } from "../src/thinkers/recorded";
import { burn, feed, rub, type Fire } from "../src/world/fire";
import { PLACES, THING_SPECS } from "../src/world/island";
import type { Item } from "../src/world/items";

const wood = (p: Partial<Item>): Item => ({
  id: "w",
  material: "wood",
  shape: "stick",
  length: 0.8,
  mass: 0.3,
  sharpness: 0,
  hardness: 0.4,
  area: 0,
  tieStrength: 0,
  wetness: 0,
  ...p,
});

describe("fire is physics, not a recipe (plan stage 5)", () => {
  it("dry wood rubbed on wood sometimes leaves glowing dust; wet wood never does", () => {
    const rng = new RngStreams(1).get("test");
    const drill = wood({});
    const base = wood({ id: "b", shape: "chunk", length: 1, mass: 2 });
    const dry = Array.from({ length: 200 }, () => rub(drill, base, rng));
    expect(dry.filter((r) => r === "glow").length).toBeGreaterThan(20);
    const wet = Array.from({ length: 200 }, () => rub({ ...drill, wetness: 0.7 }, { ...base, wetness: 0.7 }, rng));
    expect(wet.includes("glow")).toBe(false);
    expect(rub(drill, { ...base, material: "stone" }, rng)).toBe("nothing");
  });

  it("glowing dust flares up on something dry and fine, a flame eats wood and drowns in rain", () => {
    const rng = new RngStreams(2).get("test");
    const fiber = wood({ material: "fiber", shape: undefined, mass: 0.05 });
    const glow: Fire = { id: "f1", place: "p1", state: "glow", fuel: 8 };
    expect(feed(glow, fiber, rng)).toBe("flared up");
    expect(glow.state).toBe("flame");
    expect(feed(glow, wood({ mass: 1 }), rng)).toBe("burns");
    expect(glow.fuel).toBeGreaterThan(60);
    const dryMinutes = minutesToBurnOut({ ...glow }, false, rng);
    const rainMinutes = minutesToBurnOut({ ...glow }, true, rng);
    expect(rainMinutes).toBeLessThan(dryMinutes / 2);
  });
});

function minutesToBurnOut(fire: Fire, raining: boolean, rng: ReturnType<RngStreams["get"]>): number {
  let minutes = 0;
  while (fire.state === "flame" && minutes < 10_000) {
    burn(fire, raining, 1, rng);
    minutes++;
  }
  return minutes;
}

describe("a thinker decides what to do with free time (plan stage 5)", () => {
  it("the character thinks, follows its plans and is hardly ever idle", () => {
    const m = computeMetrics(runSimulation({ seed: 1, days: 5, keepEvents: true, thinker: new CuriousThinker() }));
    expect(m.thoughts).toBeGreaterThan(50);
    expect(m.timeShare.plan).toBeGreaterThan(0.05);
    expect(m.idleRate).toBeLessThan(0.1);
  });

  it("without being told, the curious stand-in finds out how to make a flame in most runs", () => {
    let lit = 0;
    for (let seed = 1; seed <= 10; seed++) {
      lit += computeMetrics(runSimulation({ seed, days: 15, keepEvents: true, thinker: new CuriousThinker() })).firesLit > 0 ? 1 : 0;
    }
    expect(lit).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it("plans that cannot be done lead to a setback and new thinking, not a crash", () => {
    const reasons: string[] = [];
    const confused: Thinker = {
      name: "confused",
      think(view: MindView): Thought {
        reasons.push(view.reason);
        return { text: "Ich nehme das Ding, das es nicht gibt.", plan: [{ kind: "take", source: "t999" }] };
      },
    };
    const r = runSimulation({ seed: 1, days: 1, keepEvents: true, thinker: confused });
    expect(r.world.death).toBeNull();
    expect(reasons).toContain("setback");
  });

  it("the thinker only ever sees the character's own view: no thing kinds, no place labels", () => {
    const forbidden = new Set<string>([...THING_SPECS.map((t) => t.kind), ...PLACES.map((p) => p.label)]);
    const views: MindView[] = [];
    const inner = new CuriousThinker();
    const spy: Thinker = { name: "spy", think: (view) => (views.push(view), inner.think(view)) };
    runSimulation({ seed: 4, days: 4, thinker: spy });
    expect(views.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (typeof v === "string" && forbidden.has(v)) offenders.push(`${path} = ${v}`);
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    views.forEach((v, i) => walk(v, `view[${i}]`));
    expect(offenders).toEqual([]);
  });

  it("a recorded run replays identically without asking the thinker again", () => {
    const file = join(mkdtempSync(join(tmpdir(), "island-")), "seed-2.jsonl");
    const recorder = new RecordedThinker(file, new CuriousThinker());
    const first = runSimulation({ seed: 2, days: 3, thinker: recorder });
    const replay = new RecordedThinker(file, null);
    const second = runSimulation({ seed: 2, days: 3, thinker: replay });
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(replay.stats.recorded).toBe(0);
    expect(replay.stats.replayed).toBe(recorder.stats.recorded + recorder.stats.replayed);
  });

  it("strategy fatigue and capability gaps come from the thinker's own words and are shown back to it", () => {
    const views: MindView[] = [];
    let n = 0;
    // Rubs the same two pieces again and again, until the tries in its own view make it say it is stuck.
    const stubborn: Thinker = {
      name: "stubborn",
      think(view: MindView): Thought {
        views.push(view);
        n++;
        const [a, b] = view.holding;
        const rubbing = view.tries?.find((t) => t.doing.startsWith("rub"));
        if (rubbing && rubbing.times >= 6 && !view.setAside) {
          return {
            text: "Ich reibe immer dasselbe, und es kommt nichts dabei heraus.",
            plan: [],
            stuck: { approach: "die beiden Stücke aneinander reiben", change: "material" },
            missing: { problem: "Wärme machen", wants: ["wird beim Reiben heiß"] },
          };
        }
        if (view.gaps && n > 40) return { text: "Das hat sich erledigt.", plan: [], solved: view.gaps.map((g) => g.id) };
        if (a && b) return { text: "Noch einmal.", plan: [{ kind: "rub", item: a.item, against: b.item }] };
        const here = view.things.filter((t) => t.place === view.here);
        const pick = here[n % Math.max(1, here.length)];
        return { text: "Ich nehme etwas auf.", plan: pick ? [{ kind: "take", source: pick.id }] : [{ kind: "idle", minutes: 30 }] };
      },
    };
    const r = runSimulation({ seed: 1, days: 2, keepEvents: true, thinker: stubborn });
    const m = computeMetrics(r);
    expect(views[0]!.tries).toBeUndefined();
    expect(views.some((v) => (v.tries?.[0]?.times ?? 0) >= 3)).toBe(true);
    expect(m.strategyFatigue).toBe(1);
    expect(m.fatigueChanges.material).toBe(1);
    expect(m.capabilityGapsOpened).toBe(1);
    const after = views.find((v) => v.setAside);
    expect(after?.setAside?.[0]).toMatchObject({ approach: "die beiden Stücke aneinander reiben", change: "material" });
    expect(after?.gaps?.[0]).toMatchObject({ id: "g1", wants: ["wird beim Reiben heiß"] });
    expect(m.capabilityGapsClosed).toBe(1);
    expect(m.capabilityGapsOpen).toBe(0);
    expect(m.longestSameTry).toBeGreaterThanOrEqual(3);
  });
});
