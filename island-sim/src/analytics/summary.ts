import type { RunMetrics } from "./metrics";
import { PENDING_METRICS } from "./metrics";

export interface Stats {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
}

export interface BatchSummary {
  runs: number;
  days: number;
  seeds: { first: number; last: number };
  /** Number of different fingerprints among the runs: a first, coarse measure of run diversity. */
  distinctFingerprints: number;
  /** Hash over all run fingerprints in seed order: one value to compare whole batches. */
  batchFingerprint: string;
  metrics: Record<string, Stats>;
  pending: readonly string[];
}

export function stats(values: readonly number[]): Stats {
  if (values.length === 0) return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, median, min: sorted[0]!, max: sorted[n - 1]!, stdDev: Math.sqrt(variance) };
}

/** Collects every numeric metric (nested one level, e.g. weatherDays.rain) into flat names. */
function numericFields(m: RunMetrics): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(m)) {
    if (key === "seed" || key === "days") continue;
    if (typeof value === "number") out[key] = value;
    else if (value && typeof value === "object") {
      for (const [sub, v] of Object.entries(value)) if (typeof v === "number") out[`${key}.${sub}`] = v;
    }
  }
  return out;
}

export function summarize(runs: readonly RunMetrics[], batchFingerprint: string): BatchSummary {
  const fields = new Map<string, number[]>();
  for (const run of runs) {
    for (const [k, v] of Object.entries(numericFields(run))) {
      let list = fields.get(k);
      if (!list) fields.set(k, (list = []));
      list.push(v);
    }
  }
  const metrics: Record<string, Stats> = {};
  for (const k of [...fields.keys()].sort()) metrics[k] = stats(fields.get(k)!);
  return {
    runs: runs.length,
    days: runs[0]?.days ?? 0,
    seeds: { first: runs[0]?.seed ?? 0, last: runs[runs.length - 1]?.seed ?? 0 },
    distinctFingerprints: new Set(runs.map((r) => r.fingerprint)).size,
    batchFingerprint,
    metrics,
    pending: PENDING_METRICS,
  };
}

export function summaryMarkdown(s: BatchSummary): string {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3));
  const lines = [
    `# island-sim – Auswertung`,
    ``,
    `${s.runs} Läufe × ${s.days} Tage, Seeds ${s.seeds.first}–${s.seeds.last}`,
    ``,
    `Batch-Fingerabdruck: \`${s.batchFingerprint}\`  `,
    `Verschiedene Lauf-Fingerabdrücke: ${s.distinctFingerprints} von ${s.runs}`,
    ``,
    `| Kennzahl | Mittel | Median | Min | Max | Std.-Abw. |`,
    `|---|---|---|---|---|---|`,
    ...Object.entries(s.metrics).map(
      ([k, v]) => `| ${k} | ${fmt(v.mean)} | ${fmt(v.median)} | ${fmt(v.min)} | ${fmt(v.max)} | ${fmt(v.stdDev)} |`,
    ),
    ``,
    `Noch nicht gemessen (spätere Etappen): ${s.pending.join(", ")}`,
    ``,
  ];
  return lines.join("\n");
}
