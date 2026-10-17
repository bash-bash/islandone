import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { RunMetrics, RunWords } from "./analytics/metrics";
import { summaryMarkdown } from "./analytics/summary";
import { runBatch, runBatchAsync, type BatchResult } from "./batch";
import type { Thinker } from "./mind/thinking";
import { CuriousThinker } from "./thinkers/curious";
import { Budget, costOf, LlmThinker } from "./thinkers/llm";
import { MixedThinker } from "./thinkers/mixed";
import { FRUGAL_PACE } from "./mind/routineMind";
import { RecordedThinker } from "./thinkers/recorded";

const HELP = `island-sim – Simulation ohne Grafik

  npm run sim -- [--seeds 100] [--days 30] [--first-seed 1] [--out out] [--check]
                 [--thinker rules|curious|llm|mixed|replay] [--model claude-sonnet-5-5] [--concurrency 5] [--budget 4] [--frugal]

  --seeds        Anzahl der Läufe (Seeds first-seed … first-seed+seeds-1)
  --days         virtuelle Tage pro Lauf
  --first-seed   erster Seed
  --out          Ordner für run-<seed>.json, summary.json, summary.md
  --check        alles zweimal rechnen und die Fingerabdrücke vergleichen
  --thinker      wer in der freien Zeit denkt:
                   rules    eingebaute Regeln aus Etappe 4
                   curious  neugieriger Ersatz für das LLM, kein Rezept
                   llm      Claude denkt; jede Antwort wird aufgezeichnet
                   mixed    Haiku für Alltägliches, Sonnet bei Überraschung, Rückschlag, neuem Tag
                            (aufgezeichnet unter recordings/mixed-haiku-sonnet/)
                   replay   spielt die Aufzeichnungen ab, ohne Claude zu fragen
  --model        Modell für llm und Ordner der Aufzeichnungen (recordings/<model>/seed-<n>.jsonl)
  --concurrency  wie viele Seeds mit llm/replay gleichzeitig laufen
  --frugal       sparsam denken: längere Pläne, nach einem fertigen Plan eine Stunde Pause, höchstens 24
                 Gedanken am Tag, und Claude bekommt im Gespräch nur, was sich geändert hat
                 (Aufzeichnungen unter recordings/<model>-frugal/)
  --budget       höchstens so viele Dollar für Claude ausgeben, danach wird abgebrochen
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
      budget: { type: "string" },
      frugal: { type: "boolean", default: false },
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
  const budget = values.budget === undefined ? undefined : new Budget(Number(values.budget));
  if (budget && !(budget.limit > 0)) throw new Error(`--budget braucht einen Betrag in Dollar, bekam "${values.budget}"`);
  const model = values.thinker === "mixed" ? "mixed-haiku-sonnet" : values.model;
  const frugal = values.frugal;
  const pace = frugal ? FRUGAL_PACE : undefined;
  const conversation = frugal ? { resetAfter: 8 } : undefined;
  const recording = (seed: number) => join("recordings", frugal ? `${model}-frugal` : model, `seed-${seed}.jsonl`);

  let thinker: ((seed: number) => Thinker) | undefined;
  let asynchronous = false;
  switch (values.thinker) {
    case "rules":
      break;
    case "curious":
      thinker = () => new CuriousThinker();
      break;
    case "llm":
      thinker = (seed) => new RecordedThinker(recording(seed), new LlmThinker({ model, budget, conversation }));
      asynchronous = true;
      break;
    case "mixed":
      thinker = (seed) =>
        new RecordedThinker(
          recording(seed),
          new MixedThinker(new LlmThinker({ model: "claude-haiku-5-5", budget, conversation }), new LlmThinker({ model: "claude-sonnet-5-5", budget, conversation })),
        );
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
    const usage = usageOf(t instanceof RecordedThinker ? t.inner : null);
    dollars += usage?.dollars ?? 0;
    const thinkerName = t?.name ?? "rules";
    writeFileSync(join(values.out, `run-${run.seed}.json`), JSON.stringify({ thinker: thinkerName, ...run, words, usage }, null, 2) + "\n");
    if (asynchronous) process.stderr.write(`Seed ${run.seed}: ${run.thoughts} Gedanken${usage ? `, ${usage.dollars?.toFixed(2) ?? "?"} $` : ""}\n`);
  };
  const run = (): Promise<BatchResult> | BatchResult =>
    asynchronous ? runBatchAsync({ firstSeed, count, days, thinker, pace, onRun, concurrency }) : runBatch({ firstSeed, count, days, thinker, pace, onRun });

  const started = performance.now();
  const { summary } = await run();
  const seconds = (performance.now() - started) / 1000;

  writeFileSync(join(values.out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(values.out, "summary.md"), summaryMarkdown(summary));

  process.stdout.write(summaryMarkdown(summary));
  process.stdout.write(`\n${count} Läufe in ${seconds.toFixed(1)} s, Ergebnisse in ${values.out}/\n`);
  if (dollars > 0) process.stdout.write(`Kosten Claude (geschätzt): ${dollars.toFixed(2)} $\n`);
  if (budget) process.stdout.write(`Budget: ${budget.spent.toFixed(2)} von ${budget.limit} $ ausgegeben\n`);

  if (values.check) {
    if (values.thinker === "llm" || values.thinker === "mixed") throw new Error("--check mit llm würde Claude zweimal fragen: erst aufzeichnen, dann mit --thinker replay prüfen");
    const again = await run();
    const same = again.summary.batchFingerprint === summary.batchFingerprint;
    process.stdout.write(same ? "Reproduzierbar: ja\n" : "Reproduzierbar: NEIN – zweiter Durchlauf weicht ab\n");
    if (!same) return 1;
  }
  return 0;
}

/** Tokens and estimated dollars of the LLM thinkers behind a thinker (one, or two when mixed). */
function usageOf(t: Thinker | null) {
  const llms = t instanceof LlmThinker ? [t] : t instanceof MixedThinker ? [t.routine, t.deep].filter((x) => x instanceof LlmThinker) : [];
  if (llms.length === 0) return undefined;
  const sum = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, dollars: 0 as number | null };
  for (const llm of llms) {
    for (const k of ["calls", "input", "output", "cacheRead", "cacheWrite"] as const) sum[k] += llm.usage[k];
    const d = costOf(llm.model, llm.usage);
    sum.dollars = sum.dollars === null || d === null ? null : sum.dollars + d;
  }
  const mixed = t instanceof MixedThinker ? { routineThoughts: t.stats.routine, deepThoughts: t.stats.deep } : {};
  return { ...sum, ...mixed };
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
