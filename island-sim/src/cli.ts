import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { summaryMarkdown } from "./analytics/summary";
import { runBatch } from "./batch";

const HELP = `island-sim – Simulation ohne Grafik

  npm run sim -- [--seeds 100] [--days 30] [--first-seed 1] [--out out] [--check]

  --seeds       Anzahl der Läufe (Seeds first-seed … first-seed+seeds-1)
  --days        virtuelle Tage pro Lauf
  --first-seed  erster Seed
  --out         Ordner für run-<seed>.json, summary.json, summary.md
  --check       alles zweimal rechnen und die Fingerabdrücke vergleichen
`;

function main(): number {
  const { values } = parseArgs({
    options: {
      seeds: { type: "string", default: "100" },
      days: { type: "string", default: "30" },
      "first-seed": { type: "string", default: "1" },
      out: { type: "string", default: "out" },
      check: { type: "boolean", default: false },
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

  const started = performance.now();
  const { runs, summary } = runBatch({ firstSeed, count, days });
  const seconds = (performance.now() - started) / 1000;

  mkdirSync(values.out, { recursive: true });
  for (const run of runs) writeFileSync(join(values.out, `run-${run.seed}.json`), JSON.stringify(run, null, 2) + "\n");
  writeFileSync(join(values.out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(values.out, "summary.md"), summaryMarkdown(summary));

  process.stdout.write(summaryMarkdown(summary));
  process.stdout.write(`\n${count} Läufe in ${seconds.toFixed(1)} s, Ergebnisse in ${values.out}/\n`);

  if (values.check) {
    const again = runBatch({ firstSeed, count, days });
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

process.exitCode = main();
