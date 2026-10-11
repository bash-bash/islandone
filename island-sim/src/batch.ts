import { StreamHash } from "./core/hash";
import { computeMetrics, type RunMetrics } from "./analytics/metrics";
import { summarize, type BatchSummary } from "./analytics/summary";
import { runSimulation } from "./sim";

export interface BatchOptions {
  firstSeed: number;
  count: number;
  days: number;
  onRun?: (metrics: RunMetrics) => void;
}

export interface BatchResult {
  runs: RunMetrics[];
  summary: BatchSummary;
}

export function runBatch({ firstSeed, count, days, onRun }: BatchOptions): BatchResult {
  const runs: RunMetrics[] = [];
  const hash = new StreamHash();
  for (let i = 0; i < count; i++) {
    const result = runSimulation({ seed: firstSeed + i, days, keepEvents: true });
    const metrics = computeMetrics(result);
    runs.push(metrics);
    hash.update(`${metrics.seed}:${metrics.fingerprint}\n`);
    onRun?.(metrics);
  }
  return { runs, summary: summarize(runs, hash.digest()) };
}
