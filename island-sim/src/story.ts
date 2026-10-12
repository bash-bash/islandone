import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { formatTime } from "./core/time";
import type { Thinker } from "./mind/thinking";
import { runSimulationAsync } from "./sim";
import { CuriousThinker } from "./thinkers/curious";
import { LlmThinker } from "./thinkers/llm";
import { RecordedThinker } from "./thinkers/recorded";

const HELP = `island-sim story – ein Lauf als Gedankenprotokoll

  npm run story -- [--seed 1] [--days 3] [--thinker curious|llm|replay] [--out out]

  --thinker curious  Ersatz ohne LLM (neugierige Regeln, kein Rezept)
  --thinker llm      Claude denkt; jede Antwort wird in recordings/ aufgezeichnet
  --thinker replay   spielt eine Aufzeichnung ab, ohne Claude zu fragen

  LLM: Zugangsdaten aus ANTHROPIC_API_KEY (oder ant auth login),
       Modell ISLAND_SIM_MODEL (Standard claude-sonnet-5-5), Aufwand ISLAND_SIM_EFFORT (Standard low).
`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      seed: { type: "string", default: "1" },
      days: { type: "string", default: "3" },
      thinker: { type: "string", default: "curious" },
      out: { type: "string", default: "out" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const seed = Number(values.seed);
  const days = Number(values.days);
  const recording = join("recordings", `seed-${seed}.jsonl`);
  let thinker: Thinker;
  const llm = values.thinker === "llm" ? new LlmThinker() : null;
  if (values.thinker === "curious") thinker = new CuriousThinker();
  else if (llm) thinker = new RecordedThinker(recording, llm);
  else if (values.thinker === "replay") thinker = new RecordedThinker(recording, null);
  else throw new Error(`unknown thinker "${values.thinker}"`);

  const result = await runSimulationAsync({ seed, days, keepEvents: true, thinker });
  const lines = [`# Insel, Seed ${seed}, ${days} Tage (${thinker.name})`, ""];
  for (const e of result.log.all()) {
    const d = e.data ?? {};
    const at = formatTime(e.tick);
    if (e.type === "thought") {
      lines.push(`**${at}** – _${String(d.text)}_${d.goal ? ` (Ziel: ${String(d.goal)})` : ""}`);
      const plan = d.plan as string[];
      if (plan.length > 0) lines.push(`  Plan: ${plan.join(" → ")}`);
    } else if (e.type === "action.end" && d.purpose === "plan" && d.kind !== "idle") {
      const what = d.rub ?? d.put ?? (d.success ? "ok" : `fehlgeschlagen (${String(d.reason)})`);
      lines.push(`  ${at} ${String(d.kind)}: ${String(what)}`);
    } else if (["weather.day", "fire.out", "death", "storm.washed_up"].includes(e.type)) {
      lines.push(`- ${at} ${e.type} ${JSON.stringify(d)}`);
    }
  }
  lines.push("", result.world.death ? `Gestorben: ${result.world.death.cause}` : "Am Ende lebt die Figur.", `Fingerabdruck: ${result.fingerprint}`);
  mkdirSync(values.out, { recursive: true });
  const file = join(values.out, `story-${seed}.md`);
  writeFileSync(file, lines.join("\n") + "\n");
  if (llm) process.stdout.write(`Tokens (${llm.usage.calls} Aufrufe): Eingabe ${llm.usage.input}, Ausgabe ${llm.usage.output}, Cache gelesen ${llm.usage.cacheRead}, Cache geschrieben ${llm.usage.cacheWrite}\n`);
  if (thinker instanceof RecordedThinker) process.stdout.write(`Gedanken aufgezeichnet: ${thinker.stats.recorded}, abgespielt: ${thinker.stats.replayed}\n`);
  process.stdout.write(`${file} geschrieben (Fingerabdruck ${result.fingerprint})\n`);
  return 0;
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
