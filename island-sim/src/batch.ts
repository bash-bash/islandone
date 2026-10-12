import { StreamHash } from "./core/hash";
import { computeMetrics, type RunMetrics } from "./analytics/metrics";
import { summarize, type BatchSummary } from "./analytics/summary";
import type { Thinker } from "./mind/thinking";
import { runSimulation } from "./sim";

export interface BatchOptions {
  firstSeed: number;
  count: number;
  days: number;
  /** A fresh thinker per run (stage 5); without it the built-in rules think. */
  thinker?: () => Thinker;
  onRun?: (metrics: RunMetrics) => void;
}

export interface BatchResult {
  runs: RunMetrics[];
  summary: BatchSummary;
}

export function runBatch({ firstSeed, count, days, thinker, onRun }: BatchOptions): BatchResult {
  const runs: RunMetrics[] = [];
  const hash = new StreamHash();
  for (let i = 0; i < count; i++) {
    const result = runSimulation({ seed: firstSeed + i, days, keepEvents: true, thinker: thinker?.() });
    const metrics = computeMetrics(result);
    runs.push(metrics);
    hash.update(`${metrics.seed}:${metrics.fingerprint}\n`);
    onRun?.(metrics);
  }
  return { runs, summary: summarize(runs, hash.digest()) };
}
