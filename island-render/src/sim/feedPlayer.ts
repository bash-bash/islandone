import { Vector3 } from "@babylonjs/core";
import type { Feed, FeedFrame, FeedMoment, MomentKind } from "../../../island-sim/src/live/feedTypes";
import type { Character } from "../character/character";
import { terrainHeight } from "../world/terrain";
import { figureStore, type Goal, type Slot } from "../ui/figureState";
import { spotOf } from "./placeMap";

// Plays island-sim's live feed (plan stage 7): moves the figure with `goTo` and fills the HUD.
// Without `startedAt` in the feed the clock starts at the feed's first tick when the page
// loads; ?speed=60 plays it 60 times faster. With `startedAt` (the live island on Vercel) the
// clock is the real one, one island day per 11 hours, and the feed is fetched again regularly.

const REFETCH_MS = 30_000;

/** ?feed=feeds/seed-3.json (relative to the page), else the live island when built for Vercel. */
export function feedUrl(): string | null {
  return new URLSearchParams(location.search).get("feed") ?? (import.meta.env.VITE_LIVE_FEED as string | undefined) ?? null;
}

async function load(url: string): Promise<Feed> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`feed ${url}: ${res.status}`);
  const feed = (await res.json()) as Feed;
  if (feed.version !== 1 || feed.frames.length === 0) throw new Error(`feed ${url}: unknown version or empty`);
  return feed;
}

const TITLES: Record<MomentKind, string> = {
  thought: "Gedanke",
  discovery: "Neue Entdeckung!",
  guess: "Vermutung",
  lesson: "Gelernt",
  stuck: "Neuer Versuch",
  gap: "Es fehlt etwas",
  solved: "Gelöst!",
  weather: "Wetter",
  fire: "Feuer!",
  storm: "Sturm",
  sickness: "Übelkeit",
  death: "Gestorben",
};

export async function startFeedPlayer(character: Character, url: string): Promise<() => void> {
  let feed = await load(url);
  const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;
  const loadedAt = performance.now();
  const tickNow = () =>
    feed.startedAt !== undefined
      ? (Date.now() - feed.startedAt) / feed.msPerTick
      : feed.fromTick + ((performance.now() - loadedAt) / feed.msPerTick) * speed;

  const ground = (x: number, z: number) => new Vector3(x, terrainHeight(x, z), z);
  let shown: FeedFrame | null = null;
  let heading: string | null = null; // place the figure is walking to (or standing at)
  let lastMoment = -1;

  const step = () => {
    const tick = Math.min(tickNow(), feed.toTick - 1e-6);
    const i = lastIndexAtOrBefore(feed.frames, tick);
    const frame = feed.frames[Math.max(0, i)]!;
    if (frame !== shown) {
      if (!shown) {
        // First frame: put the figure where the simulation has it.
        const spot = spotOf(frame.place);
        character.root.position.copyFrom(ground(spot.x, spot.z));
        heading = frame.place;
      }
      const target = frame.doing.kind === "move" && frame.doing.to ? frame.doing.to : frame.place;
      if (target !== heading) {
        // Leaving a place off the beach: reappear at its exit point.
        character.root.setEnabled(true);
        const spot = spotOf(target);
        character.goTo(ground(spot.x, spot.z));
        heading = target;
      }
      shown = frame;
      showFrame(feed, frame, tick);
    } else {
      figureStore.set(clock(tick));
    }
    // Off the test beach: gone once arrived at the exit point.
    character.root.setEnabled(spotOf(heading ?? frame.place).visible || character.walking);

    const m = lastIndexAtOrBefore(feed.moments, tick);
    if (m !== lastMoment) {
      lastMoment = m;
      showMoments(feed, m, character);
    }
  };
  step();
  const id = window.setInterval(step, 250);
  // A live island moves on: fetch the newest stretch now and then (a failed fetch keeps the old one).
  const refetch =
    feed.startedAt !== undefined
      ? window.setInterval(() => {
          load(url).then(
            (next) => {
              feed = next;
              lastMoment = -1;
            },
            (err) => console.warn(err),
          );
        }, REFETCH_MS)
      : 0;
  return () => {
    window.clearInterval(id);
    window.clearInterval(refetch);
  };
}

function clock(tick: number) {
  return { day: Math.floor(tick / 1440) + 1, minuteOfDay: tick % 1440 };
}

function showFrame(feed: Feed, f: FeedFrame, tick: number) {
  const c = f.carrying;
  const belt: Slot[] = [];
  if (c.wood + c.bound > 0) belt.push({ item: "log", count: c.wood + c.bound });
  if (c.stone > 0) belt.push({ item: "stone", count: c.stone });
  if (c.leaf + c.fiber > 0) belt.push({ item: "leaf", count: c.leaf + c.fiber });
  figureStore.set({
    ...clock(tick),
    needs: [
      { id: "health", value: f.needs.health },
      { id: "food", value: f.needs.food },
      { id: "water", value: f.needs.water },
      { id: "energy", value: f.needs.energy },
    ],
    resources: { wood: c.wood + c.bound, stone: c.stone, fiber: c.fiber + c.leaf },
    belt,
    selectedSlot: -1,
    ...goals(feed, f.tick),
  });
}

/** The latest thought's goal and steps, ticked off as the figure does them. */
function goals(feed: Feed, tick: number): { goalsTitle: string; goals: Goal[] } {
  const i = lastIndexAtOrBefore(feed.moments, tick, (m) => m.kind === "thought");
  const thought = i >= 0 ? feed.moments[i]! : null;
  if (!thought) return { goalsTitle: "Erste Schritte", goals: [] };
  const plan = thought.plan ?? [];
  // Walk through the frames since the thought: a step is done once the figure has done it and moved on.
  let done = 0;
  let doing = false;
  for (const f of feed.frames) {
    if (f.tick < thought.tick || f.tick > tick || done >= plan.length) continue;
    if (f.doing.label === plan[done]) doing = true;
    else if (doing) {
      done++;
      doing = f.doing.label === plan[done];
    }
  }
  return {
    goalsTitle: thought.goal ?? "Nächste Schritte",
    goals: plan.map((label, k) => ({ label, done: k < done ? 1 : 0, of: 1 })),
  };
}

function showMoments(feed: Feed, index: number, character: Character) {
  if (index < 0) return;
  const m = latestToShow(feed.moments, index);
  if (!m) return;
  const p = character.root.position;
  const text = m.text.replace(/^(Gelernt|Vermutung|Gelöst|Entdeckt|Es fehlt etwas): /, "");
  figureStore.set({
    discovery: {
      title: m.kind === "discovery" ? `Entdeckt: ${text}` : TITLES[m.kind],
      text: m.kind === "discovery" ? `${feed.places.find((pl) => pl.id === m.place)?.label ?? ""}` : text,
      at: { x: p.x, z: p.z, lift: 1.2 },
    },
  });
}

/** Among moments at the same tick, the most telling one (a lesson over the thought that led to it). */
function latestToShow(moments: FeedMoment[], index: number): FeedMoment | null {
  const tick = moments[index]!.tick;
  const same = moments.filter((m) => m.tick === tick);
  const rank: MomentKind[] = ["death", "fire", "solved", "gap", "lesson", "discovery", "stuck", "storm", "sickness", "thought", "guess", "weather"];
  return same.sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind))[0] ?? null;
}

/** Index of the last entry with tick <= t (entries sorted by tick), or -1. */
function lastIndexAtOrBefore<T extends { tick: number }>(list: T[], t: number, keep: (x: T) => boolean = () => true): number {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.tick <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  while (found >= 0 && !keep(list[found]!)) found--;
  return found;
}
