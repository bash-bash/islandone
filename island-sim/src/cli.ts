import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { RunMetrics, RunWords } from "./analytics/metrics";
import { summaryMarkdown } from "./analytics/summary";
import { runBatch, runBatchAsync, type BatchResult } from "./batch";
import type { Thinker } from "./mind/thinking";
import { CuriousThinker } from "./thinkers/curious";
import { costOf, LlmThinker } from "./thinkers/llm";
import { RecordedThinker } from "./thinkers/recorded";

const HELP = `island-sim – Simulation ohne Grafik

  npm run sim -- [--seeds 100] [--days 30] [--first-seed 1] [--out out] [--check]
                 [--thinker rules|curious|llm|replay] [--model claude-sonnet-5-5] [--concurrency 5]

  --seeds        Anzahl der Läufe (Seeds first-seed … first-seed+seeds-1)
  --days         virtuelle Tage pro Lauf
  --first-seed   erster Seed
  --out          Ordner für run-<seed>.json, summary.json, summary.md
  --check        alles zweimal rechnen und die Fingerabdrücke vergleichen
  --thinker      wer in der freien Zeit denkt:
                   rules    eingebaute Regeln aus Etappe 4
                   curious  neugieriger Ersatz für das LLM, kein Rezept
                   llm      Claude denkt; jede Antwort wird aufgezeichnet
                   replay   spielt die Aufzeichnungen ab, ohne Claude zu fragen
  --model        Modell für llm und Ordner der Aufzeichnungen (recordings/<model>/seed-<n>.jsonl)
  --concurrency  wie viele Seeds mit llm/replay gleichzeitig laufen
`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      seeds: { type: "string", default: "100" },
      days: { type: "string", default: "30" },
      "first-seed": { type: "string", default: "1" },
      out: { type: "string", default: "out" },
      check: { type: "boolean", default: false },
      thinker: { type: "string", default: "rules" },
      model: { type: "string", default: process.env.ISLAND_SIM_MODEL ?? "claude-sonnet-5-5" },
      concurrency: { type: "string", default: "5" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const count = toInt(values.seeds, "--seeds");
  const days = toInt(values.days, "--days");
  const firstSeed = toInt(values["first-seed"], "--first-seed");
  const concurrency = toInt(values.concurrency, "--concurrency");
  const model = values.model;
  const recording = (seed: number) => join("recordings", model, `seed-${seed}.jsonl`);

  let thinker: ((seed: number) => Thinker) | undefined;
  let asynchronous = false;
  switch (values.thinker) {
    case "rules":
      break;
    case "curious":
      thinker = () => new CuriousThinker();
      break;
    case "llm":
      thinker = (seed) => new RecordedThinker(recording(seed), new LlmThinker({ model }));
      asynchronous = true;
      break;
    case "replay":
      thinker = (seed) => new RecordedThinker(recording(seed), null);
      asynchronous = true;
      break;
    default:
      throw new Error(`--thinker braucht rules, curious, llm oder replay, bekam "${values.thinker}"`);
  }

  mkdirSync(values.out, { recursive: true });
  let dollars = 0;
  const onRun = (run: RunMetrics, words: RunWords, t?: Thinker) => {
    const llm = t instanceof RecordedThinker ? t.inner : null;
    const usage = llm instanceof LlmThinker ? { ...llm.usage, dollars: costOf(llm.model, llm.usage) } : undefined;
    dollars += usage?.dollars ?? 0;
    const thinkerName = t?.name ?? "rules";
    writeFileSync(join(values.out, `run-${run.seed}.json`), JSON.stringify({ thinker: thinkerName, ...run, words, usage }, null, 2) + "\n");
    if (asynchronous) process.stderr.write(`Seed ${run.seed}: ${run.thoughts} Gedanken${usage ? `, ${usage.dollars?.toFixed(2) ?? "?"} $` : ""}\n`);
  };
  const run = (): Promise<BatchResult> | BatchResult =>
    asynchronous ? runBatchAsync({ firstSeed, count, days, thinker, onRun, concurrency }) : runBatch({ firstSeed, count, days, thinker, onRun });

  const started = performance.now();
  const { summary } = await run();
  const seconds = (performance.now() - started) / 1000;

  writeFileSync(join(values.out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(values.out, "summary.md"), summaryMarkdown(summary));

  process.stdout.write(summaryMarkdown(summary));
  process.stdout.write(`\n${count} Läufe in ${seconds.toFixed(1)} s, Ergebnisse in ${values.out}/\n`);
  if (dollars > 0) process.stdout.write(`Kosten Claude (geschätzt): ${dollars.toFixed(2)} $\n`);

  if (values.check) {
    if (values.thinker === "llm") throw new Error("--check mit llm würde Claude zweimal fragen: erst aufzeichnen, dann mit --thinker replay prüfen");
    const again = await run();
    const same = again.summary.batchFingerprint === summary.batchFingerprint;
    process.stdout.write(same ? "Reproduzierbar: ja\n" : "Reproduzierbar: NEIN – zweiter Durchlauf weicht ab\n");
    if (!same) return 1;
  }
  return 0;
}

function toInt(text: string, name: string): number {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} braucht eine ganze Zahl ≥ 0, bekam "${text}"`);
  return n;
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
