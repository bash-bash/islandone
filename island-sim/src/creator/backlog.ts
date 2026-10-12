import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { StreamHash } from "../core/hash";
import { CATALOG_VERSION, WORLD_CATALOG } from "./catalog";

/**
 * The Creator Backlog (Handoff §9). After a run, every capability gap the
 * thinker named is checked against what the world, including its latent part,
 * can offer (Handoff §8: search the latent world first). Only when nothing
 * fits does it become a backlog entry: a hint to the world's authors which
 * kind of content is missing. The character never sees any of this; it runs
 * outside the simulation, on the words the run left behind.
 *
 * The check is done by Claude in the role of the world's author, with the
 * world catalog in hand. Every verdict is recorded under a hash of the gap and
 * the catalog version, so a report can be rebuilt without asking again.
 */

export const VERDICTS = ["exists", "latent", "missing"] as const;

const Verdict = z.object({
  verdict: z.enum(VERDICTS),
  candidates: z.array(z.string()),
  family: z.string(),
  note: z.string(),
});
export type GapVerdict = z.infer<typeof Verdict>;

export interface Gap {
  problem: string;
  wants: string[];
}

const SYSTEM = `Du bist die Autorin einer kleinen Inselwelt, nicht die Figur darin. Die Figur hat beim Überleben gesagt, dass ihr für ein Problem etwas fehlt, und beschrieben, welche Eigenschaften es haben müsste.

Du bekommst den Katalog dessen, was es in der Welt gibt (kind, ob latent, und was es physikalisch bietet), und die Lücke der Figur. Entscheide:
- exists: Etwas Sichtbares in der Welt, allein oder kombiniert (binden, bauen, Feuer), erfüllt die gewünschten Eigenschaften gut genug. Die Figur hat es nur noch nicht gefunden oder nicht so benutzt.
- latent: Nur etwas Latentes erfüllt sie.
- missing: Nichts in der Welt erfüllt sie. Dann ist das ein Eintrag für das Creator Backlog.

candidates: die kinds aus dem Katalog, die passen (leer bei missing).
family: eine kurze Bezeichnung der Art von Inhalt, um die es geht, in wenigen Worten auf Deutsch (zum Beispiel "dauerhaftes Schneidematerial", "Gefäß für Wasser"), damit gleiche Lücken aus verschiedenen Läufen zusammengefasst werden können.
note: ein Satz Begründung; bei missing, welche Eigenschaften neuer Inhalt bräuchte.`;

export class Creator {
  private readonly verdicts = new Map<string, GapVerdict>();
  readonly stats = { replayed: 0, asked: 0 };
  readonly usage = { input: 0, output: 0 };

  constructor(
    private readonly file: string,
    private readonly client: Anthropic | null,
    readonly model = process.env.ISLAND_SIM_CREATOR_MODEL ?? "claude-sonnet-5-5",
  ) {
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const { key, verdict } = JSON.parse(line) as { key: string; verdict: GapVerdict };
        this.verdicts.set(key, verdict);
      }
    }
  }

  async check(gap: Gap): Promise<GapVerdict> {
    const key = keyOf(gap);
    const known = this.verdicts.get(key);
    if (known) {
      this.stats.replayed++;
      return known;
    }
    if (!this.client) throw new Error(`no recorded Creator verdict for "${gap.problem}" in ${this.file}`);
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(Verdict) },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ catalog: WORLD_CATALOG, gap }) }],
    });
    this.usage.input += response.usage.input_tokens;
    this.usage.output += response.usage.output_tokens;
    const verdict = response.parsed_output;
    if (!verdict) throw new Error(`Creator gave no verdict for "${gap.problem}" (${response.stop_reason})`);
    this.stats.asked++;
    this.verdicts.set(key, verdict);
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify({ key, by: this.model, gap, verdict }) + "\n");
    return verdict;
  }
}

function keyOf(gap: Gap): string {
  const hash = new StreamHash();
  hash.update(`${CATALOG_VERSION}\n${gap.problem}\n${gap.wants.join("\n")}`);
  return hash.digest();
}
