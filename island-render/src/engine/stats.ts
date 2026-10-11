// Tiny store the Babylon side writes and the React HUD reads.

export interface RenderStats {
  renderer: string;
  fps: number;
  drawCalls: number;
  triangles: number;
  assetsLoaded: number;
  assetsTotal: number;
  ready: boolean;
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
