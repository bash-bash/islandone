import { Constants, Mesh, type AbstractEngine, type ArcRotateCamera, type Scene } from "@babylonjs/core";

// FPS and memory measurement for the graphics test (handoff §35).
// Memory: the JS heap (Chrome only) plus an estimate of what the scene holds on the GPU,
// counted from textures, render targets and geometry buffers. Browsers expose no real GPU
// memory figure, so the GPU number is an estimate and marked with "~" in the HUD.

export interface MemoryStats {
  /** JS heap in use, MB; undefined outside Chromium. */
  jsHeapMB?: number;
  /** Estimated GPU memory, MB. */
  gpuMB: number;
  texturesMB: number;
  geometryMB: number;
}

export interface BenchResult {
  seconds: number;
  frames: number;
  avgFps: number;
  /** FPS of the slowest 1 % of frames. */
  low1Fps: number;
  p95FrameMs: number;
  memory: MemoryStats;
}

const MB = 1024 * 1024;

function bytesPerPixel(type: number) {
  if (type === Constants.TEXTURETYPE_FLOAT) return 16;
  if (type === Constants.TEXTURETYPE_HALF_FLOAT) return 8;
  return 4;
}

export function measureMemory(engine: AbstractEngine, scene: Scene): MemoryStats {
  let textures = 0;
  for (const t of engine.getLoadedTexturesCache()) {
    if (!t.width || !t.height) continue;
    let bytes = t.width * t.height * Math.max(1, t.depth || 1) * bytesPerPixel(t.type);
    if (t.isCube) bytes *= 6;
    if (t.generateMipMaps) bytes *= 4 / 3;
    if (t.samples > 1) bytes *= t.samples;
    textures += bytes;
  }

  let geometry = 0;
  const seen = new Set<unknown>();
  for (const g of scene.geometries) {
    for (const vb of Object.values(g.getVertexBuffers() ?? {})) {
      const data = vb.getData();
      if (!data || seen.has(data)) continue;
      seen.add(data);
      geometry += Array.isArray(data) ? data.length * 4 : data.byteLength;
    }
    const indices = g.getIndices(false, false);
    if (indices && !seen.has(indices)) {
      seen.add(indices);
      geometry += indices.length * 4;
    }
  }
  for (const m of scene.meshes) if (m instanceof Mesh && m.hasThinInstances) geometry += m.thinInstanceCount * 20 * 4; // matrix + colour

  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  return {
    jsHeapMB: heap !== undefined ? Math.round(heap / MB) : undefined,
    gpuMB: Math.round((textures + geometry) / MB),
    texturesMB: Math.round(textures / MB),
    geometryMB: Math.round(geometry / MB),
  };
}

/**
 * Benchmark (?bench, ?bench=30 for 30 s): one slow full turn around the camp, recording every
 * frame time. Returns average FPS, the 1 % low and the 95th percentile frame time.
 */
export function runBenchmark(engine: AbstractEngine, scene: Scene, camera: ArcRotateCamera, seconds: number): Promise<BenchResult> {
  return new Promise((resolve) => {
    const frameMs: number[] = [];
    const startAlpha = camera.alpha;
    let elapsed = 0;
    const obs = scene.onAfterRenderObservable.add(() => {
      const dt = engine.getDeltaTime();
      if (dt <= 0) return;
      frameMs.push(dt);
      elapsed += dt / 1000;
      camera.alpha = startAlpha + (elapsed / seconds) * Math.PI * 2;
      if (elapsed < seconds) return;
      scene.onAfterRenderObservable.remove(obs);
      camera.alpha = startAlpha;
      const sorted = [...frameMs].sort((a, b) => a - b);
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      resolve({
        seconds: Math.round(elapsed),
        frames: frameMs.length,
        avgFps: Math.round((frameMs.length / elapsed) * 10) / 10,
        low1Fps: Math.round((1000 / at(0.99)) * 10) / 10,
        p95FrameMs: Math.round(at(0.95) * 10) / 10,
        memory: measureMemory(engine, scene),
      });
    });
  });
}
