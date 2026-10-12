import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CHANGES, type MindView, type PlanStep, type Thinker, type Thought } from "../mind/thinking";

/**
 * The character's thinking done by Claude (Handoff §27).
 *
 * Claude gets exactly the MindView the character has built from its own
 * observations and memories (src/mind), and answers with a thought, a goal and
 * the next steps. It is never told what things are, what they are good for, or
 * how anything works: no recipes. It has to make sense of smoke, warmth, a
 * new taste the way a person would, and the world decides what happens.
 *
 * Model and effort come from ISLAND_SIM_MODEL / ISLAND_SIM_EFFORT; credentials
 * from ISLAND_SIM_API_KEY, else the environment (ANTHROPIC_API_KEY or an
 * `ant auth login` profile). ISLAND_SIM_API_KEY exists because a Claude Code
 * session keeps ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL for itself; with it the
 * base URL is the public API (or ISLAND_SIM_BASE_URL), never the inherited one.
 */

const STEP_KINDS = ["move", "drink", "eat", "take", "drop", "bind", "build", "tie", "rub", "put", "rest", "idle", "sleep"] as const;

const Step = z.object({
  kind: z.enum(STEP_KINDS),
  to: z.string().nullable(),
  target: z.string().nullable(),
  tool: z.string().nullable(),
  over: z.string().nullable(),
  source: z.string().nullable(),
  item: z.string().nullable(),
  against: z.string().nullable(),
  onto: z.string().nullable(),
  items: z.array(z.string()).nullable(),
  binder: z.string().nullable(),
  minutes: z.number().nullable(),
});

const Answer = z.object({
  text: z.string(),
  goal: z.string().nullable(),
  plan: z.array(Step),
  stuck: z.object({ approach: z.string(), change: z.enum(CHANGES) }).nullable(),
  missing: z.object({ problem: z.string(), wants: z.array(z.string()) }).nullable(),
  // Plain arrays and strings, empty when there is nothing to say: the API allows only 16 nullable fields.
  solved: z.array(z.string()),
  guess: z.string(),
  checked: z.array(z.object({ id: z.string(), held: z.boolean(), learned: z.string() })),
  using: z.array(z.string()),
});

export const SYSTEM_PROMPT = `Du bist das Denken einer Figur, die allein auf einer Insel gestrandet ist.

Du weißt nur, was die Figur selbst gesehen, gefühlt und erlebt hat. Das bekommst du als JSON:
- Orte und Dinge haben neutrale Kennungen (p3, t7, i12, s1, f1). Was ein Ding ist, weißt du nicht; du siehst nur sein Aussehen ("looks" und weitere Merkmale).
- feelings: Durst, Hunger, Müdigkeit, Kälte, Nässe, Übelkeit, Schmerz, jeweils 0 (nichts) bis 4 (sehr stark).
- beliefs: was die Figur aus Erfahrung glaubt, mit Konfidenz.
- recent und discoveries: Erlebtes in eigenen Worten; discoveries enthält jedes Ergebnis, das zum ersten Mal vorkam.
- thoughts: deine letzten eigenen Gedanken. reason und trigger: warum du gerade nachdenkst.
- tries (wenn vorhanden): was du schon mehrmals selbst gemacht hast, wie oft und was dabei herauskam.
- setAside und gaps (wenn vorhanden): Ansätze, bei denen du selbst gesagt hast, dass du feststeckst, und was dir nach deinen eigenen Worten noch fehlt.
- guesses und lessons (wenn vorhanden): deine eigenen Vermutungen, über die du noch nicht geurteilt hast (mit dem Plan, mit dem du sie prüfen wolltest), und was du nach deinen eigenen Worten aus früheren Vermutungen gelernt hast.

Deine Antwort: ein kurzer Gedanke in der Ich-Form auf Deutsch (text, 1 bis 3 Sätze, so wie man vor sich hin denkt), ein Ziel in eigenen Worten (goal) und die nächsten Schritte (plan, höchstens 6). Du darfst auch nur nachdenken und einen leeren Plan geben.

Schritte (alle nicht genannten Felder sind null):
- move {to}: zu einem bekannten Ort gehen (der Weg wird selbst gefunden).
- drink {target}, eat {target, tool?, over?}: von einem Ding trinken oder essen; mit tool ein gehaltenes Stück dabei benutzen; mit over es vorher über etwas halten.
- take {source}: ein Stück von einem Ding nehmen (höchstens 4 in der Hand). drop {item}: ein Stück ablegen.
- bind {items: [a, b], binder}: zwei gehaltene Stücke mit einem dritten zusammenbinden.
- build {item}: ein gehaltenes Stück hier zu etwas Gebautem hinzufügen (oder damit anfangen). tie {binder}: ein loses Teil des Gebauten hier festbinden.
- rub {item, against}: ein gehaltenes Stück eine Weile kräftig an einem anderen reiben.
- put {item, onto}: ein gehaltenes Stück auf ein Ding hier legen.
- rest {minutes}, idle {minutes}, sleep.

Das Folgende sagst du nur, wenn du es selbst so siehst (sonst null, eine leere Liste oder ein leerer Text):
- stuck {approach, change}: Du merkst, dass du mit einem Ansatz nicht weiterkommst. approach beschreibt ihn in eigenen Worten; change sagt, was du stattdessen änderst: material (anderes Material), shape (andere Form), place (anderer Ort), method (andere Vorgehensweise) oder pause (das Problem erst einmal ruhen lassen).
- missing {problem, wants}: Dir fehlt für ein Problem etwas, das keines der Dinge, die du kennst, gut genug kann. problem in eigenen Worten; wants die Eigenschaften, die das Fehlende haben müsste (zum Beispiel "hält länger als das, was ich habe"), nicht wie es heißt. Was schon in gaps steht, nennst du nicht noch einmal.
- solved: Kennungen aus gaps, die du jetzt als gelöst ansiehst.
- guess: Du vermutest, was beim Plan passieren wird, und willst es damit herausfinden. In eigenen Worten (zum Beispiel "wenn ich das Holz lange reibe, wird es warm"). Nur wenn du wirklich etwas über die Welt herausfinden willst, nicht für jeden Plan.
- checked [{id, held, learned}]: Du siehst an dem, was passiert ist, ob eine Vermutung aus guesses gestimmt hat (held) und was du daraus über die Welt mitnimmst (learned, ein Satz; leer, wenn es nichts Neues ist).
- using: Kennungen aus lessons, auf die du dich bei diesem Gedanken und Plan stützt.

Die Welt entscheidet, was passiert; du erfährst es danach. Niemand sagt dir, wozu etwas gut ist. Sei neugierig, probiere aus, zieh Schlüsse aus dem, was passiert ist, und verfolge, was dir wichtig erscheint. Wenn Durst oder Hunger sehr stark werden, kümmert sich der Körper von selbst darum.`;

export interface LlmThinkerOptions {
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  client?: Anthropic;
}

export class LlmThinker implements Thinker {
  readonly name: string;
  private readonly client: Anthropic;
  readonly model: string;
  private readonly effort: NonNullable<LlmThinkerOptions["effort"]>;
  /** Tokens summed over every call, to see what a run costs. */
  readonly usage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  constructor(options: LlmThinkerOptions = {}) {
    this.model = options.model ?? process.env.ISLAND_SIM_MODEL ?? "claude-sonnet-5-5";
    this.effort = options.effort ?? (process.env.ISLAND_SIM_EFFORT as LlmThinkerOptions["effort"]) ?? "low";
    this.client = options.client ?? createClient();
    this.name = `llm:${this.model}`;
  }

  async think(view: MindView): Promise<Thought> {
    // An answer that does not fit the schema (e.g. an unknown kind of change) is asked once more, then let go.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.ask(view);
      } catch (error) {
        if (!(error instanceof Error && error.message.includes("Failed to parse structured output"))) throw error;
        if (attempt >= 1) return { text: "(Mir fällt gerade nichts ein.)", plan: [] };
      }
    }
  }

  private async ask(view: MindView): Promise<Thought> {
    // Haiku has no server-side fallback for refusals; a refusal is answered below like an empty thought.
    const fallback = this.model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 8000,
      ...fallback,
      output_config: { effort: this.effort, format: betaZodOutputFormat(Answer) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(view) }],
    });
    this.usage.calls += 1;
    this.usage.input += response.usage.input_tokens;
    this.usage.output += response.usage.output_tokens;
    this.usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    this.usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { text: "(Mir fällt gerade nichts ein.)", plan: [] };
    }
    return toThought(response.parsed_output);
  }
}

/** Dollars per million tokens (input, output, cache read, cache write), from the published price list. */
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  "claude-opus-5-5": [4, 20, 0.2, 5],
};

/** What the tokens of a run cost, in dollars; null for a model without a known price. */
export function costOf(model: string, usage: LlmThinker["usage"]): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (usage.input * p[0] + usage.output * p[1] + usage.cacheRead * p[2] + usage.cacheWrite * p[3]) / 1e6;
}

export function createClient(): Anthropic {
  const apiKey = process.env.ISLAND_SIM_API_KEY;
  if (!apiKey) return new Anthropic();
  return new Anthropic({ apiKey, baseURL: process.env.ISLAND_SIM_BASE_URL ?? "https://api.anthropic.com" });
}

/** Drops the null fields of the structured answer. */
export function toThought(answer: z.infer<typeof Answer>): Thought {
  const plan = answer.plan.map((step) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(step)) if (v !== null) out[k] = v;
    return out as PlanStep;
  });
  const thought: Thought = { text: answer.text, goal: answer.goal ?? undefined, plan };
  if (answer.stuck) thought.stuck = answer.stuck;
  if (answer.missing) thought.missing = answer.missing;
  if (answer.solved.length) thought.solved = answer.solved;
  if (answer.guess.trim()) thought.guess = answer.guess;
  if (answer.checked.length) thought.checked = answer.checked;
  if (answer.using.length) thought.using = answer.using;
  return thought;
}
