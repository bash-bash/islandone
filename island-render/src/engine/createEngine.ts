import { Engine, WebGPUEngine, type AbstractEngine } from "@babylonjs/core";

export type RendererKind = "WebGPU" | "WebGL2";

/**
 * WebGPU when the browser supports it, WebGL 2 otherwise.
 * `?renderer=webgl2` forces the fallback for comparison.
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
): Promise<{ engine: AbstractEngine; renderer: RendererKind }> {
  const forced = new URLSearchParams(location.search).get("renderer");

  if (forced !== "webgl2" && (await WebGPUEngine.IsSupportedAsync)) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true });
      await engine.initAsync();
      return { engine, renderer: "WebGPU" };
    } catch (err) {
      console.warn("WebGPU init failed, falling back to WebGL 2", err);
    }
  }

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  return { engine, renderer: "WebGL2" };
}
