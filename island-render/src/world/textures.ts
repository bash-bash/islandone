import { DynamicTexture, Texture, type Scene } from "@babylonjs/core";
import { fbm } from "./noise";

// Textures generated on a 2D canvas at startup. They work the same on WebGPU and
// WebGL 2 and stand in until proper Blender-baked textures exist.

function makeTexture(
  name: string,
  scene: Scene,
  size: number,
  pixel: (u: number, v: number) => [number, number, number, number],
): DynamicTexture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Tileable value noise: sample on a torus so the texture repeats seamlessly. */
function tileNoise(u: number, v: number, freq: number, seed: number, octaves = 4): number {
  const a = u * Math.PI * 2;
  const b = v * Math.PI * 2;
  // Two circles mapped into 2D noise space; blending them keeps the edges continuous.
  const n1 = fbm(Math.cos(a) * freq + 50, Math.sin(a) * freq + Math.cos(b) * freq, octaves, seed);
  const n2 = fbm(Math.sin(b) * freq + 90, Math.cos(a) * freq * 0.5 + Math.sin(a) * freq, octaves, seed + 7);
  return (n1 + n2) * 0.5;
}

/** Height field → tangent-space normal map, tileable. Used for the moving water surface. */
export function createWaterNormalTexture(scene: Scene, seed: number): DynamicTexture {
  const size = 256;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      heights[y * size + x] = tileNoise(x / size, y / size, 1.6, seed, 5);
    }
  }
  const h = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)];
  const strength = 6;
  return makeTexture(`waterNormal${seed}`, scene, size, (u, v) => {
    const x = Math.round(u * size);
    const y = Math.round(v * size);
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
    const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    return [((-dx / len) * 0.5 + 0.5) * 255, ((-dy / len) * 0.5 + 0.5) * 255, (1 / len) * 0.5 * 255 + 127, 255];
  });
}

/** Soft round particle for flames and smoke. */
export function createSoftParticleTexture(scene: Scene): DynamicTexture {
  return makeTexture("softParticle", scene, 64, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.max(0, 1 - d);
    return [255, 255, 255, a * a * 255];
  });
}
