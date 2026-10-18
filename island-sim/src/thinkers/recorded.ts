import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalJson } from "../core/eventLog";
import { StreamHash } from "../core/hash";
import type { MindView, Thinker, Thought } from "../mind/thinking";

/**
 * Makes an LLM-driven run reproducible (Handoff §36: same seed, same result).
 *
 * Every answer is stored in a JSON-lines file under a hash of the exact view
 * the thinker was given. Replaying the same seed with the same code produces
 * the same views, so every answer comes from the file and the run is
 * identical, without calling the model again. A view that is not on file is
 * answered by the inner thinker ("record") or is an error ("replay").
 */
export class RecordedThinker implements Thinker {
  readonly name: string;
  private readonly answers = new Map<string, Thought>();
  /** Calls answered from the file, and calls that needed the inner thinker. */
  readonly stats = { replayed: 0, recorded: 0 };

  constructor(
    private readonly file: string,
    readonly inner: Thinker | null,
  ) {
    this.name = inner?.name ?? "replay";
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const { key, thought, by } = JSON.parse(line) as { key: string; thought: Thought; by: string };
        this.answers.set(key, thought);
        if (!inner) this.name = by;
      }
    }
  }

  think(view: MindView): Thought | Promise<Thought> {
    const key = keyOf(view);
    const known = this.answers.get(key);
    if (known) {
      this.stats.replayed++;
      return known;
    }
    if (!this.inner) throw new Error(`no recorded thought for this moment (${key}) in ${this.file}: the code or the run differs from the recording`);
    const answer = this.inner.think(view);
    const store = (thought: Thought) => {
      this.answers.set(key, thought);
      this.stats.recorded++;
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify({ key, by: this.inner!.name, view: { reason: view.reason, time: view.time }, thought }) + "\n");
      return thought;
    };
    return answer instanceof Promise ? answer.then(store) : store(answer);
  }
}

function keyOf(view: MindView): string {
  const hash = new StreamHash();
  hash.update(canonicalJson(view));
  return hash.digest();
}
