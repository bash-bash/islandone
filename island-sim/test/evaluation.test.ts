import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBatch, runBatchAsync } from "../src/batch";
import { Creator } from "../src/creator/backlog";
import type { MindView, Thinker, Thought } from "../src/mind/thinking";
import { runSimulation } from "../src/sim";
import { CuriousThinker } from "../src/thinkers/curious";
import { MixedThinker } from "../src/thinkers/mixed";

describe("evaluation over many seeds (plan stage 6)", () => {
  it("running seeds side by side gives the same batch as one after another", async () => {
    const options = { firstSeed: 1, count: 4, days: 2, thinker: () => new CuriousThinker() };
    const serial = runBatch(options);
    const parallel = await runBatchAsync({ ...options, concurrency: 3 });
    expect(parallel.summary.batchFingerprint).toBe(serial.summary.batchFingerprint);
    expect(parallel.runs.map((r) => r.seed)).toEqual([1, 2, 3, 4]);
    expect(parallel.words).toHaveLength(4);
  });

  it("the Creator answers a gap it has judged before from its recording, and refuses to guess one it has not", async () => {
    const dir = mkdtempSync(join(tmpdir(), "creator-"));
    const file = join(dir, "creator.jsonl");
    const gap = { problem: "Wasser tragen", wants: ["hält Wasser", "lässt sich tragen"] };
    const verdict = { verdict: "missing", candidates: [], family: "Gefäß für Wasser", note: "Nichts in der Welt hält Wasser." };
    // Recorded by an earlier run: same key as Creator.check computes.
    const recorder = new Creator(file, {
      beta: { messages: { parse: async () => ({ parsed_output: verdict, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" }) } },
    } as never);
    expect(await recorder.check(gap)).toEqual(verdict);
    const replay = new Creator(file, null);
    expect(await replay.check(gap)).toEqual(verdict);
    expect(replay.stats.replayed).toBe(1);
    await expect(replay.check({ problem: "etwas anderes", wants: ["x"] })).rejects.toThrow(/no recorded Creator verdict/);
  });

  it("the mixed thinker asks the careful one at surprises and setbacks, and keeps only plans from the cheap one", () => {
    const asked: string[] = [];
    const chatty = (name: string): Thinker => ({
      name,
      think(view: MindView): Thought {
        asked.push(`${name}:${view.reason}`);
        return { text: name, plan: [{ kind: "idle", minutes: 30 }], stuck: { approach: "warten", change: "pause" }, guess: "nichts passiert" };
      },
    });
    const mixed = new MixedThinker(chatty("cheap"), chatty("careful"));
    const r = runSimulation({ seed: 1, days: 1, keepEvents: true, thinker: mixed });
    expect(asked.some((a) => a === "cheap:plan done")).toBe(true);
    expect(asked.some((a) => a === "careful:woke")).toBe(true);
    expect(asked.every((a) => a.startsWith("careful:") === ["surprise", "setback", "woke", "need"].includes(a.split(":")[1]!))).toBe(true);
    const fatigue = r.log.all().filter((e) => e.type === "strategy.fatigue").length;
    expect(fatigue).toBe(mixed.stats.deep);
  });
});
