import { TICKS_PER_DAY } from "../core/time";
import type { ThinkingPace } from "../mind/routineMind";
import type { Thinker } from "../mind/thinking";
import { runSimulationAsync } from "../sim";
import { FeedRecorder } from "./feed";
import type { Feed } from "./feedTypes";

export interface FeedOptions {
  seed: number;
  /** Ticks covered: [fromTick, toTick). The run itself always starts at tick 0. */
  fromTick?: number;
  toTick: number;
  /** Without one, the rules of stage 4 run. */
  thinker?: Thinker;
  pace?: ThinkingPace;
}

/**
 * Computes the live feed for a stretch of island time (plan stage 7).
 *
 * The island's state is never stored: it is the seed plus the recorded
 * thoughts. To get from tick 0 to "now", the run is replayed from the
 * recording (no LLM, fractions of a second per island day) and only moments
 * not on file ask the thinker. The same seed, code and recording always give
 * the same feed.
 */
export async function computeFeed({ seed, fromTick = 0, toTick, thinker, pace }: FeedOptions): Promise<Feed> {
  if (!Number.isInteger(toTick) || toTick <= fromTick) throw new Error(`toTick must be an integer after fromTick, got ${fromTick}..${toTick}`);
  const recorder = new FeedRecorder(seed, thinker?.name ?? "rules", fromTick);
  await runSimulationAsync({
    seed,
    days: Math.ceil(toTick / TICKS_PER_DAY),
    untilTick: toTick,
    thinker,
    pace,
    onEvent: recorder.onEvent,
    onTick: recorder.onTick,
  });
  return recorder.feed();
}
