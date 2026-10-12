import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { RunMetrics, RunWords } from "./analytics/metrics";
import { stats, type Stats } from "./analytics/summary";
import { Creator, type GapVerdict } from "./creator/backlog";
import { createClient } from "./thinkers/llm";

const HELP = `island-sim report – Läufe nebeneinanderstellen, Creator Backlog bilden

  npm run report -- <ordner> [<ordner> …] [--out report.md] [--creator ask|replay|off]

  Jeder Ordner ist die Ausgabe von npm run sim (run-<seed>.json).
  --creator ask     neue Lücken von Claude als Weltautorin prüfen lassen (aufgezeichnet in recordings/creator.jsonl)
  --creator replay  nur aufgezeichnete Urteile benutzen (Standard)
  --creator off     kein Creator Backlog
`;

type Run = RunMetrics & { thinker: string; words: RunWords; usage?: { calls: number; dollars: number | null } };

interface Batch {
  dir: string;
  thinker: string;
  days: number;
  runs: Run[];
}

/** The §36 numbers plus what shows whether runs differ (plan §9, stage 6). */
const ROWS: [key: string, label: string, get: (r: Run) => number | null][] = [
  ["survived", "Überlebt (Anteil)", (r) => r.survived],
  ["survivalDays", "Tage gelebt", (r) => r.survivalDays],
  ["hypothesesProposed", "Hypothesen", (r) => r.hypothesesProposed],
  ["hypothesesTested", "… davon geprüft", (r) => r.hypothesesTested],
  ["hypothesesSupported", "… bestätigt", (r) => r.hypothesesSupported],
  ["hypothesesRefuted", "… widerlegt", (r) => r.hypothesesRefuted],
  ["capabilityGapsOpened", "Capability Gaps genannt", (r) => r.capabilityGapsOpened],
  ["capabilityGapsClosed", "… davon gelöst", (r) => r.capabilityGapsClosed],
  ["strategyChanges", "Strategiewechsel", (r) => r.strategyChanges],
  ["strategyFatigue", "Strategy Fatigue (feststecken)", (r) => r.strategyFatigue],
  ["learningEvents", "Lernereignisse", (r) => r.learningEvents],
  ["idleRate", "Idle Rate", (r) => r.idleRate],
  ["thoughts", "Gedanken", (r) => r.thoughts],
  ["firesLit", "Feuer entfacht", (r) => r.firesLit],
  ["hoursToFirstFire", "Stunden bis zum ersten Feuer", (r) => r.hoursToFirstFire],
  ["hoursToFreshWater", "Stunden bis zum Süßwasser", (r) => r.hoursToFreshWater],
  ["categoriesDiscovered", "Arten von Dingen entdeckt", (r) => r.categoriesDiscovered],
  ["constructions", "Gebautes und Gebundenes", (r) => r.constructions],
  ["toolMeals", "Mahlzeiten mit Werkzeug", (r) => r.toolMeals],
  ["longestSameTry", "Längste Wiederholung ohne Neues", (r) => r.longestSameTry],
];

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", default: "report.md" },
      creator: { type: "string", default: "replay" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    return values.help ? 0 : 1;
  }
  const batches = positionals.map(load);
  const lines = [`# island-sim – Auswertung Etappe 6`, ``, ...overview(batches), ``, ...comparison(batches), ``, ...spread(batches)];
  if (values.creator !== "off") {
    const client = values.creator === "ask" ? createClient() : null;
    const creator = new Creator(join("recordings", "creator.jsonl"), client);
    lines.push("", ...(await backlog(batches, creator)));
    if (creator.stats.asked > 0) process.stderr.write(`Creator: ${creator.stats.asked} Lücken neu geprüft, ${creator.stats.replayed} aus der Aufzeichnung\n`);
  }
  writeFileSync(values.out, lines.join("\n") + "\n");
  process.stdout.write(`${values.out} geschrieben\n`);
  return 0;
}

function load(dir: string): Batch {
  const runs = readdirSync(dir)
    .filter((f) => /^run-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Run)
    .sort((a, b) => a.seed - b.seed);
  if (runs.length === 0) throw new Error(`${dir}: keine run-<seed>.json`);
  return { dir, thinker: runs[0]!.thinker ?? "rules", days: runs[0]!.days, runs };
}

function label(b: Batch): string {
  return `${b.thinker}, ${b.days} T.`;
}

function overview(batches: Batch[]): string[] {
  const lines = [`| Lauf | Denker | Seeds | Tage | Gedanken | Kosten dieses Aufrufs (geschätzt) |`, `|---|---|---|---|---|---|`];
  for (const b of batches) {
    const thoughts = b.runs.reduce((s, r) => s + r.thoughts, 0);
    const dollars = b.runs.reduce((s, r) => s + (r.usage?.dollars ?? 0), 0);
    const seeds = `${b.runs[0]!.seed}–${b.runs[b.runs.length - 1]!.seed}`;
    lines.push(`| \`${b.dir}\` | ${b.thinker} | ${seeds} (${b.runs.length}) | ${b.days} | ${thoughts} | ${dollars > 0 ? `${dollars.toFixed(2)} $` : "–"} |`);
  }
  lines.push(``, `Abgespielte Gedanken aus einer Aufzeichnung kosten nichts und zählen in der Kostenspalte nicht mit.`);
  return lines;
}

function comparison(batches: Batch[]): string[] {
  const lines = [
    `## Kennzahlen (§36), Mittelwert pro Lauf (Median)`,
    ``,
    `| Kennzahl | ${batches.map(label).join(" | ")} |`,
    `|---|${batches.map(() => "---").join("|")}|`,
  ];
  for (const [, name, get] of ROWS) {
    const cells = batches.map((b) => {
      const s = statsOf(b, get);
      if (s.n === 0) return "–";
      const missing = s.n < b.runs.length ? ` [${s.n}/${b.runs.length}]` : "";
      return `${fmt(s.mean)} (${fmt(s.median)})${missing}`;
    });
    lines.push(`| ${name} | ${cells.join(" | ")} |`);
  }
  lines.push(``, `[n/m]: nur n von m Läufen haben einen Wert (z. B. nie Feuer gemacht).`);
  return lines;
}

/** Plan §3 decision 7: runs must differ measurably, above all in strategy changes and discovery times. */
function spread(batches: Batch[]): string[] {
  const keys = ["strategyChanges", "strategyFatigue", "hoursToFirstFire", "hoursToFreshWater", "capabilityGapsOpened", "learningEvents"];
  const lines = [
    `## Streuung über die Seeds`,
    ``,
    `Standardabweichung / Anzahl verschiedener Werte. Ein Skript in Verkleidung hätte überall 0 / 1.`,
    ``,
    `| Kennzahl | ${batches.map(label).join(" | ")} |`,
    `|---|${batches.map(() => "---").join("|")}|`,
  ];
  for (const key of keys) {
    const [, name, get] = ROWS.find(([k]) => k === key)!;
    const cells = batches.map((b) => {
      const values = b.runs.map(get).filter((v): v is number => v !== null);
      if (values.length === 0) return "–";
      return `${fmt(stats(values).stdDev)} / ${new Set(values).size}`;
    });
    lines.push(`| ${name} | ${cells.join(" | ")} |`);
  }
  const fingerprints = batches.map((b) => `${new Set(b.runs.map((r) => r.fingerprint)).size} von ${b.runs.length}`);
  lines.push(`| Verschiedene Läufe (Fingerabdruck) | ${fingerprints.join(" | ")} |`);
  return lines;
}

/**
 * Handoff §9: every gap the thinkers named, checked against the world catalog.
 * Gaps with the same words are checked once; the backlog lists what the world
 * does not have, grouped by the kind of content.
 */
async function backlog(batches: Batch[], creator: Creator): Promise<string[]> {
  const found = new Map<string, { problem: string; wants: string[]; where: Set<string> }>();
  for (const b of batches) {
    for (const r of b.runs) {
      for (const g of r.words?.gaps ?? []) {
        const key = `${g.problem}\n${g.wants.join("\n")}`;
        const entry = found.get(key) ?? { problem: g.problem, wants: g.wants, where: new Set<string>() };
        entry.where.add(`${b.thinker.replace(/^llm:/, "")} #${r.seed}`);
        found.set(key, entry);
      }
    }
  }
  const lines = [`## Creator Backlog (Handoff §9)`, ``];
  if (found.size === 0) return [...lines, `Kein Denker hat eine Lücke genannt.`];
  const judged: { problem: string; wants: string[]; where: Set<string>; verdict: GapVerdict }[] = [];
  for (const g of found.values()) {
    try {
      judged.push({ ...g, verdict: await creator.check(g) });
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  const count = (v: string) => judged.filter((j) => j.verdict.verdict === v).length;
  lines.push(
    `${found.size} verschiedene Lücken, ${judged.length} geprüft: ${count("exists")} gibt es schon in der Welt, ${count("latent")} nur latent, ${count("missing")} fehlen wirklich.`,
    ``,
  );
  const missing = judged.filter((j) => j.verdict.verdict === "missing");
  if (missing.length > 0) {
    lines.push(`### Fehlt in der Welt`, ``);
    const families = new Map<string, typeof missing>();
    for (const m of missing) families.set(m.verdict.family, [...(families.get(m.verdict.family) ?? []), m]);
    for (const [family, list] of [...families].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`- **${family}** (${list.length}×, ${[...new Set(list.flatMap((l) => [...l.where]))].join(", ")})`);
      for (const l of list.slice(0, 3)) lines.push(`  - „${l.problem}“ – bräuchte: ${l.wants.join("; ")}. _${l.verdict.note}_`);
    }
    lines.push(``);
  }
  const present = judged.filter((j) => j.verdict.verdict !== "missing");
  if (present.length > 0) {
    lines.push(`### Gibt es schon (die Figur hat es nur noch nicht gefunden)`, ``);
    const families = new Map<string, typeof present>();
    for (const p of present) families.set(p.verdict.family, [...(families.get(p.verdict.family) ?? []), p]);
    const sorted = [...families].sort((a, b) => b[1].length - a[1].length);
    for (const [family, list] of sorted.slice(0, 10)) {
      const candidates = [...new Set(list.flatMap((l) => l.verdict.candidates))].join(", ");
      lines.push(`- **${family}** (${list.length}×): ${candidates}${list.some((l) => l.verdict.verdict === "latent") ? " (latent)" : ""}`);
    }
    if (sorted.length > 10) lines.push(`- … und ${sorted.length - 10} weitere Arten mit ${sorted.slice(10).reduce((s, [, l]) => s + l.length, 0)} Lücken`);
  }
  return lines;
}

function statsOf(b: Batch, get: (r: Run) => number | null): Stats {
  return stats(b.runs.map(get).filter((v): v is number => v !== null));
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
