import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MindView, PlanStep, Thinker, Thought } from "../mind/thinking";

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
});

export const SYSTEM_PROMPT = `Du bist das Denken einer Figur, die allein auf einer Insel gestrandet ist.

Du weißt nur, was die Figur selbst gesehen, gefühlt und erlebt hat. Das bekommst du als JSON:
- Orte und Dinge haben neutrale Kennungen (p3, t7, i12, s1, f1). Was ein Ding ist, weißt du nicht; du siehst nur sein Aussehen ("looks" und weitere Merkmale).
- feelings: Durst, Hunger, Müdigkeit, Kälte, Nässe, Übelkeit, Schmerz, jeweils 0 (nichts) bis 4 (sehr stark).
- beliefs: was die Figur aus Erfahrung glaubt, mit Konfidenz.
- recent und discoveries: Erlebtes in eigenen Worten; discoveries enthält jedes Ergebnis, das zum ersten Mal vorkam.
- thoughts: deine letzten eigenen Gedanken. reason und trigger: warum du gerade nachdenkst.

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

Die Welt entscheidet, was passiert; du erfährst es danach. Niemand sagt dir, wozu etwas gut ist. Sei neugierig, probiere aus, zieh Schlüsse aus dem, was passiert ist, und verfolge, was dir wichtig erscheint. Wenn Durst oder Hunger sehr stark werden, kümmert sich der Körper von selbst darum.`;

export interface LlmThinkerOptions {
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  client?: Anthropic;
}

export class LlmThinker implements Thinker {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: NonNullable<LlmThinkerOptions["effort"]>;

  constructor(options: LlmThinkerOptions = {}) {
    this.model = options.model ?? process.env.ISLAND_SIM_MODEL ?? "claude-opus-5-5";
    this.effort = options.effort ?? (process.env.ISLAND_SIM_EFFORT as LlmThinkerOptions["effort"]) ?? "low";
    this.client = options.client ?? createClient();
    this.name = `llm:${this.model}`;
  }

  async think(view: MindView): Promise<Thought> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.effort, format: betaZodOutputFormat(Answer) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(view) }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { text: "(Mir fällt gerade nichts ein.)", plan: [] };
    }
    return toThought(response.parsed_output);
  }
}

function createClient(): Anthropic {
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
  return { text: answer.text, goal: answer.goal ?? undefined, plan };
}
