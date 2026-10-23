import { canonicalJson } from "../core/eventLog";
import { StreamHash } from "../core/hash";
import { TICKS_PER_DAY, TICKS_PER_HOUR } from "../core/time";
import type { MindView, Thinker, Thought } from "../mind/thinking";
import { runSimulation } from "../sim";
import { CuriousThinker } from "../thinkers/curious";
import { costOf, type LlmThinker } from "../thinkers/llm";
import { RecordingPaused, StoredThinker, type RecordedLine } from "../thinkers/recorded";
import { REAL_MS_PER_TICK, type Feed } from "./feedTypes";
import { computeFeed } from "./live";

/**
 * The island that runs around the clock (plan stage 7, docs/ETAPPE_7_PLAN.md §3).
 *
 * Its whole state is the seed, the start time and the recorded thoughts. Every
 * minute `advanceIsland` replays the run from the recording up to "now" plus a
 * lead, asks the thinker only for moments not on record, stores the new
 * thoughts and a feed for viewers. Where it is kept is up to the store (Redis
 * on Vercel, memory in tests).
 */

export interface IslandMeta {
  /** e.g. "island-3"; the recording is kept under this id. */
  id: string;
  seed: number;
  /** Real time (ms) of tick 0. */
  startedAt: number;
  /** The simulation's behaviour when the island started (see simVersion). */
  simVersion: string;
}

export interface IslandStore {
  getMeta(): Promise<IslandMeta | null>;
  setMeta(meta: IslandMeta): Promise<void>;
  getThoughts(islandId: string): Promise<RecordedLine[]>;
  appendThoughts(islandId: string, lines: RecordedLine[]): Promise<void>;
  getFeed(): Promise<Feed | null>;
  setFeed(feed: Feed): Promise<void>;
  /** Only one advance at a time; true if the lock was taken. */
  lock(ttlMs: number): Promise<boolean>;
  unlock(): Promise<void>;
  /** Adds dollars to a month's spending and returns the new total. */
  addSpent(month: string, usd: number): Promise<number>;
  getSpent(month: string): Promise<number>;
}

export interface AdvanceOptions {
  /** Real time in ms. The clock stays outside the simulation code (determinism rule). */
  now: number;
  /** The calendar month of `now` ("2026-10"), for the monthly budget. */
  month: string;
  /** The thinker while the month's budget lasts (Sonnet). */
  createThinker: () => Thinker & { usage?: LlmThinker["usage"]; model?: string };
  /** Dollars per month; after that the free curious thinker takes over until the month ends. */
  monthlyBudgetUsd: number;
  /** How far ahead of real time the island is computed, so viewers never see a gap. */
  leadMs?: number;
  /** How much island time before "now" the feed keeps for viewers who just arrived. */
  feedBackTicks?: number;
  /** At most this many new thoughts per call; the next call carries on. */
  maxNewThoughts?: number;
}

export type AdvanceResult =
  | { status: "busy" }
  | { status: "paused"; island: string; newThoughts: number; spentUsd: number }
  | { status: "ok"; island: string; toTick: number; newThoughts: number; spentUsd: number; started?: string };

const DEFAULT_LEAD_MS = 10 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;

export async function advanceIsland(store: IslandStore, options: AdvanceOptions): Promise<AdvanceResult> {
  if (!(await store.lock(LOCK_MS))) return { status: "busy" };
  try {
    return await advanceLocked(store, options);
  } finally {
    await store.unlock();
  }
}

async function advanceLocked(store: IslandStore, options: AdvanceOptions): Promise<AdvanceResult> {
  const { now } = options;
  const version = simVersion();
  let meta = await store.getMeta();
  let started: string | undefined;
  const begin = async (seed: number, why: string) => {
    const n = meta ? Number(meta.id.replace(/\D/g, "")) + 1 : 1;
    meta = { id: `island-${n}`, seed, startedAt: now, simVersion: version };
    await store.setMeta(meta);
    started = why;
  };
  if (!meta) await begin(1, "first island");
  // Code that behaves differently cannot replay the old recording: a new island starts.
  else if (meta.simVersion !== version) await begin(meta.seed + 1, "the simulation changed");
  else {
    // The figure died: the death stays visible until the next island morning, then a new island starts.
    const last = await store.getFeed();
    if (last?.death && last.seed === meta.seed && last.startedAt === meta.startedAt) {
      const morning = (Math.floor(last.death.tick / TICKS_PER_DAY) + 1) * TICKS_PER_DAY + 6 * TICKS_PER_HOUR;
      if (now >= meta.startedAt + morning * REAL_MS_PER_TICK) await begin(meta.seed + 1, "the figure died");
      else return { status: "ok", island: meta.id, toTick: last.toTick, newThoughts: 0, spentUsd: 0 };
    }
  }
  const island: IslandMeta = meta!;

  const { month } = options;
  const spentBefore = await store.getSpent(month);
  const thinker = new BudgetedThinker(options.createThinker(), new CuriousThinker(), spentBefore, options.monthlyBudgetUsd);
  const fresh: RecordedLine[] = [];
  const stored = new StoredThinker(await store.getThoughts(island.id), thinker, (line) => fresh.push(line), options.maxNewThoughts ?? 12);

  const toTick = Math.max(1, Math.floor((now + (options.leadMs ?? DEFAULT_LEAD_MS) - island.startedAt) / REAL_MS_PER_TICK));
  const fromTick = Math.max(0, toTick - (options.feedBackTicks ?? 2 * TICKS_PER_HOUR));
  let feed: Feed | null = null;
  try {
    feed = await computeFeed({ seed: island.seed, fromTick, toTick, thinker: stored });
  } catch (error) {
    if (!(error instanceof RecordingPaused)) throw error;
  } finally {
    // Thoughts are paid for: keep them even if the run stopped early.
    if (fresh.length > 0) await store.appendThoughts(island.id, fresh);
    if (thinker.spentNow > 0) await store.addSpent(month, thinker.spentNow);
  }
  if (!feed) return { status: "paused", island: island.id, newThoughts: fresh.length, spentUsd: thinker.spentNow };
  await store.setFeed({ ...feed, startedAt: island.startedAt });
  return { status: "ok", island: island.id, toTick, newThoughts: fresh.length, spentUsd: thinker.spentNow, ...(started ? { started } : {}) };
}

/**
 * Claude while the month's money lasts, then the free curious thinker. Whoever
 * answered is recorded with the thought, so the island replays the same either way.
 */
export class BudgetedThinker implements Thinker {
  name: string;
  /** Dollars spent by this instance. */
  spentNow = 0;

  constructor(
    private readonly paid: Thinker & { usage?: LlmThinker["usage"]; model?: string },
    private readonly free: Thinker,
    private readonly spentBefore: number,
    private readonly limitUsd: number,
  ) {
    this.name = paid.name;
  }

  async think(view: MindView): Promise<Thought> {
    if (this.spentBefore + this.spentNow >= this.limitUsd) {
      this.name = this.free.name;
      return this.free.think(view);
    }
    this.name = this.paid.name;
    const before = this.paidCost();
    const thought = await this.paid.think(view);
    this.spentNow += this.paidCost() - before;
    return thought;
  }

  private paidCost(): number {
    return this.paid.usage && this.paid.model ? (costOf(this.paid.model, this.paid.usage) ?? 0) : 0;
  }
}

let version: string | null = null;

/**
 * A fingerprint of how the simulation behaves: one island day with the curious
 * thinker, including every view it was shown. If a code change alters what
 * happens or what the thinker sees, the recorded thoughts no longer fit and the
 * live island has to start afresh.
 */
export function simVersion(): string {
  if (version) return version;
  const views = new StreamHash();
  const curious = new CuriousThinker();
  const run = runSimulation({
    seed: 1,
    days: 1,
    thinker: {
      name: curious.name,
      think: (view) => {
        views.update(canonicalJson(view));
        return curious.think(view);
      },
    },
  });
  const hash = new StreamHash();
  hash.update(run.fingerprint);
  hash.update(views.digest());
  version = hash.digest();
  return version;
}

/** Keeps everything in memory: tests and local trials. */
export class MemoryIslandStore implements IslandStore {
  meta: IslandMeta | null = null;
  thoughts = new Map<string, RecordedLine[]>();
  feed: Feed | null = null;
  locked = false;
  spent = new Map<string, number>();

  async getMeta() {
    return this.meta;
  }
  async setMeta(meta: IslandMeta) {
    this.meta = meta;
  }
  async getThoughts(id: string) {
    return [...(this.thoughts.get(id) ?? [])];
  }
  async appendThoughts(id: string, lines: RecordedLine[]) {
    this.thoughts.set(id, [...(this.thoughts.get(id) ?? []), ...lines]);
  }
  async getFeed() {
    return this.feed;
  }
  async setFeed(feed: Feed) {
    this.feed = feed;
  }
  async lock() {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }
  async unlock() {
    this.locked = false;
  }
  async addSpent(month: string, usd: number) {
    const total = (this.spent.get(month) ?? 0) + usd;
    this.spent.set(month, total);
    return total;
  }
  async getSpent(month: string) {
    return this.spent.get(month) ?? 0;
  }
}
