import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { TICKS_PER_HOUR } from "../core/time";
import type { Thinker } from "../mind/thinking";
import { CuriousThinker } from "../thinkers/curious";
import { LlmThinker } from "../thinkers/llm";
import { RecordedThinker } from "../thinkers/recorded";
import { computeFeed } from "./live";

const HELP = `island-sim feed – Ereignisstrom für island-render (Etappe 7)

  npm run feed -- [--seed 1] [--from-hour 0] [--hours 24] [--thinker rules|curious|replay|llm]
                  [--model claude-sonnet-5-5] [--out ../island-render/public/feeds/seed-1.json]

  --from-hour, --hours  welcher Abschnitt der Inselzeit in den Strom kommt (Inselstunden ab Tag 1 0:00)
  --thinker replay      spielt recordings/<model>/seed-<n>.jsonl ab, ohne Claude zu fragen
  --thinker llm         Claude denkt, was noch nicht aufgezeichnet ist (kostet)

  Im Browser: island-render mit ?feed=feeds/seed-1.json (und &speed=60 für 60-fache Geschwindigkeit).
`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      seed: { type: "string", default: "1" },
      "from-hour": { type: "string", default: "0" },
      hours: { type: "string", default: "24" },
      thinker: { type: "string", default: "replay" },
      model: { type: "string", default: "claude-sonnet-5-5" },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const seed = Number(values.seed);
  const fromTick = Math.round(Number(values["from-hour"]) * TICKS_PER_HOUR);
  const toTick = fromTick + Math.round(Number(values.hours) * TICKS_PER_HOUR);
  const recording = join("recordings", values.model, `seed-${seed}.jsonl`);
  let thinker: Thinker | undefined;
  switch (values.thinker) {
    case "rules":
      break;
    case "curious":
      thinker = new CuriousThinker();
      break;
    case "replay":
      thinker = new RecordedThinker(recording, null);
      break;
    case "llm":
      thinker = new RecordedThinker(recording, new LlmThinker({ model: values.model }));
      break;
    default:
      throw new Error(`unknown thinker "${values.thinker}"`);
  }
  const feed = await computeFeed({ seed, fromTick, toTick, thinker });
  const out = values.out ?? join("out", "feeds", `seed-${seed}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(feed));
  process.stdout.write(`${out}: ${feed.frames.length} Bilder, ${feed.moments.length} Momente, Ticks ${feed.fromTick}–${feed.toTick} (${feed.thinker})\n`);
  return 0;
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
