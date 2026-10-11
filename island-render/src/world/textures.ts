import { DynamicTexture, Texture, type Scene } from "@babylonjs/core";
import { fbm, rng } from "./noise";

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

/**
 * Tileable caustic pattern: bright lines where two Worley cells meet (F2 − F1 small),
 * the network of light ridges sunlight forms on a shallow sea floor.
 */
export function createCausticTexture(scene: Scene, seed: number): DynamicTexture {
  const size = 256;
  const cells = 6;
  const r = rng(seed);
  const pts: number[] = [];
  for (let i = 0; i < cells * cells; i++) pts.push(r(), r());
  return makeTexture(`caustic${seed}`, scene, size, (u, v) => {
    // Tileable domain warp breaks up the regular cell shapes into wobbly light ridges.
    const gx = u * cells + (tileNoise(u, v, 1.3, seed + 3, 3) - 0.5) * 1.6;
    const gy = v * cells + (tileNoise(v, u, 1.3, seed + 9, 3) - 0.5) * 1.6;
    const cx = Math.floor(gx);
    const cy = Math.floor(gy);
    let f1 = 9;
    let f2 = 9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const ix = (((cx + ox) % cells) + cells) % cells;
        const iy = (((cy + oy) % cells) + cells) % cells;
        const k = (iy * cells + ix) * 2;
        const d = Math.hypot(cx + ox + pts[k] - gx, cy + oy + pts[k + 1] - gy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
    }
    const line = Math.pow(Math.max(0, 1 - (f2 - f1) * 6), 4);
    const c = Math.min(255, line * 255);
    return [c, c, c, 255];
  });
}
