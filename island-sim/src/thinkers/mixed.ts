import type { MindView, Thinker, ThinkReason, Thought } from "../mind/thinking";

/**
 * Two thinkers sharing one head, to save cost: a cheap one for everyday
 * moments (a plan is done, free time) and a careful one for the moments that
 * decide how a story goes (something new happened, a plan failed, a new day).
 *
 * Only the careful thinker's words count for strategy fatigue, capability gaps,
 * hypotheses and lessons: in stage 6 the cheap one (Haiku) said it was stuck or
 * lacking something in almost every thought, which says nothing. From the
 * cheap one only the thought, the goal and the plan are kept.
 */
export const DEEP_REASONS: readonly ThinkReason[] = ["surprise", "setback", "woke", "need"];

export class MixedThinker implements Thinker {
  readonly name: string;
  readonly stats = { routine: 0, deep: 0 };

  constructor(
    readonly routine: Thinker,
    readonly deep: Thinker,
    private readonly deepReasons: readonly ThinkReason[] = DEEP_REASONS,
  ) {
    this.name = `mixed:${routine.name}+${deep.name}`;
  }

  think(view: MindView): Thought | Promise<Thought> {
    if (this.deepReasons.includes(view.reason)) {
      this.stats.deep++;
      return this.deep.think(view);
    }
    this.stats.routine++;
    const answer = this.routine.think(view);
    return answer instanceof Promise ? answer.then(everyday) : everyday(answer);
  }
}

function everyday(thought: Thought): Thought {
  return { text: thought.text, goal: thought.goal, plan: thought.plan };
}
