import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBatch, runBatchAsync } from "../src/batch";
import { Creator } from "../src/creator/backlog";
import { CuriousThinker } from "../src/thinkers/curious";

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
});
