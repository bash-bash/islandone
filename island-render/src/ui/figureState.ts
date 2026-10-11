// What the observer HUD shows about the figure: time of day, needs, carried resources,
// current goals, the latest discovery and the tool belt.
// island-sim will own all of this. Until then a stub fills it with the values from the
// reference image and lets the clock run, so the HUD can be designed and tested.

export interface Need {
  id: "health" | "food" | "water" | "energy";
  value: number; // 0…100
}

export interface Goal {
  label: string;
  done: number;
  of: number;
}

export interface Slot {
  item: "axe" | "torch" | "log" | "plank" | "leaf" | "stone";
  count?: number;
}

export interface FigureState {
  day: number;
  minuteOfDay: number;
  needs: Need[];
  resources: { wood: number; stone: number; fiber: number };
  goalsTitle: string;
  goals: Goal[];
  discovery?: { title: string; text: string };
  belt: Slot[];
  selectedSlot: number;
}

let state: FigureState = {
  day: 1,
  minuteOfDay: 8 * 60 + 20,
  needs: [
    { id: "health", value: 100 },
    { id: "food", value: 70 },
    { id: "water", value: 65 },
    { id: "energy", value: 85 },
  ],
  resources: { wood: 12, stone: 8, fiber: 3 },
  goalsTitle: "Erste Schritte",
  goals: [
    { label: "3 Holz sammeln", done: 3, of: 3 },
    { label: "Lagerfeuer bauen", done: 0, of: 1 },
    { label: "Kleine Hütte bauen", done: 0, of: 1 },
  ],
  discovery: { title: "Neue Entdeckung!", text: "Möwen zeigen oft ressourcenreiche Orte in der Nähe." },
  belt: [
    { item: "axe" },
    { item: "torch" },
    { item: "log", count: 8 },
    { item: "plank", count: 4 },
    { item: "leaf", count: 6 },
    { item: "stone", count: 3 },
  ],
  selectedSlot: 0,
};

const listeners = new Set<() => void>();

export const figureStore = {
  get: () => state,
  set(patch: Partial<FigureState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const GAME_MINUTES_PER_SECOND = 0.5;
// Per game hour: the figure slowly gets hungry, thirsty and tired.
const DRAIN_PER_HOUR = { health: 0, food: 2.5, water: 4, energy: 1.5 };

/** Stand-in for island-sim: advances the clock and drains needs. Returns a stop function. */
export function startFigureStub(): () => void {
  let last = performance.now();
  const id = window.setInterval(() => {
    const now = performance.now();
    const minutes = ((now - last) / 1000) * GAME_MINUTES_PER_SECOND;
    last = now;
    const s = figureStore.get();
    let minuteOfDay = s.minuteOfDay + minutes;
    let day = s.day;
    if (minuteOfDay >= 24 * 60) {
      minuteOfDay -= 24 * 60;
      day++;
    }
    figureStore.set({
      day,
      minuteOfDay,
      needs: s.needs.map((n) => ({ ...n, value: Math.max(0, n.value - (DRAIN_PER_HOUR[n.id] * minutes) / 60) })),
    });
  }, 1000);
  return () => window.clearInterval(id);
}
