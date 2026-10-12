import { StreamHash } from "./core/hash";
import { computeMetrics, runWords, type RunMetrics, type RunWords } from "./analytics/metrics";
import { summarize, type BatchSummary } from "./analytics/summary";
import type { ThinkingPace } from "./mind/routineMind";
import type { Thinker } from "./mind/thinking";
import { runSimulation, runSimulationAsync } from "./sim";

export interface BatchOptions {
  firstSeed: number;
  count: number;
  days: number;
  /** A fresh thinker per run (stage 5); without it the built-in rules think. */
  thinker?: (seed: number) => Thinker;
  pace?: ThinkingPace;
  onRun?: (metrics: RunMetrics, words: RunWords, thinker?: Thinker) => void;
}

export interface BatchResult {
  runs: RunMetrics[];
  words: RunWords[];
  summary: BatchSummary;
}

export function runBatch({ firstSeed, count, days, thinker, pace, onRun }: BatchOptions): BatchResult {
  const runs: RunMetrics[] = [];
  const words: RunWords[] = [];
  for (let i = 0; i < count; i++) {
    const t = thinker?.(firstSeed + i);
    const result = runSimulation({ seed: firstSeed + i, days, keepEvents: true, thinker: t, pace });
    runs.push(computeMetrics(result));
    words.push(runWords(result));
    onRun?.(runs[i]!, words[i]!, t);
  }
  return { runs, words, summary: summarize(runs, batchFingerprint(runs)) };
}

/**
 * The same for thinkers that answer asynchronously (an LLM): up to
 * `concurrency` seeds run side by side. Each run is still deterministic on its
 * own, and results are kept in seed order, so the batch fingerprint does not
 * depend on which run finished first.
 */
export async function runBatchAsync(options: BatchOptions & { concurrency: number }): Promise<BatchResult> {
  const { firstSeed, count, days, thinker, pace, onRun } = options;
  const runs: RunMetrics[] = new Array(count);
  const words: RunWords[] = new Array(count);
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      const t = thinker?.(firstSeed + i);
      const result = await runSimulationAsync({ seed: firstSeed + i, days, keepEvents: true, thinker: t, pace });
      runs[i] = computeMetrics(result);
      words[i] = runWords(result);
      onRun?.(runs[i], words[i], t);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, count)) }, worker));
  return { runs, words, summary: summarize(runs, batchFingerprint(runs)) };
}

function batchFingerprint(runs: readonly RunMetrics[]): string {
  const hash = new StreamHash();
  for (const m of runs) hash.update(`${m.seed}:${m.fingerprint}\n`);
  return hash.digest();
}
