// Tiny store the Babylon side writes and the React HUD reads.
import type { BenchResult, MemoryStats } from "./measure";
import type { QualityLevel } from "./quality";

export interface RenderStats {
  renderer: string;
  fps: number;
  drawCalls: number;
  triangles: number;
  assetsLoaded: number;
  assetsTotal: number;
  ready: boolean;
  quality: QualityLevel;
  memory?: MemoryStats;
  /** Running: "running"; done: the result. */
  bench?: "running" | BenchResult;
  error?: string;
}

let state: RenderStats = {
  renderer: "…",
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  assetsLoaded: 0,
  assetsTotal: 0,
  ready: false,
  quality: "high",
};
const listeners = new Set<() => void>();

export const statsStore = {
  get: () => state,
  set(patch: Partial<RenderStats>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
