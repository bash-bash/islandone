import { Constants, Matrix, Mesh, RawTexture, Vector3, Vector4, VertexBuffer, type AbstractMesh, type FloatArray, type Scene } from "@babylonjs/core";
import { WATER_LEVEL, terrainHeight } from "../world/terrain";

// Region around the beach test (metres) and resolution of the foam field.
const X0 = -14;
const Z0 = -28;
const SIZE_X = 48;
const SIZE_Z = 56;
const RES = 0.1;
const BINS = 32;

/**
 * Distance field for the water shader's foam, baked once on the CPU (handoff §19):
 * R = distance to the shoreline, G = distance to objects that break the surface
 * (rocks, stones, dock posts). Objects get their outline at the waterline from
 * the vertices near y = 0, as a polar profile around their centre.
 * Stored as an RGBA8 texture with 1 cm steps up to 2.55 m.
 */
export function buildFoamField(scene: Scene, candidates: AbstractMesh[]): { texture: RawTexture; region: Vector4 } {
  const w = Math.round(SIZE_X / RES);
  const h = Math.round(SIZE_Z / RES);
  const shore = new Float32Array(w * h);
  const objects = new Float32Array(w * h).fill(1e9);

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = X0 + (i + 0.5) * RES;
      const z = Z0 + (j + 0.5) * RES;
      shore[j * w + i] = terrainHeight(x, z) > WATER_LEVEL ? 0 : 1e9;
    }
  }

  for (const outline of waterlineOutlines(candidates)) {
    const { cx, cz, radius } = outline;
    const rMax = Math.max(...radius);
    const i0 = Math.max(0, Math.floor((cx - rMax - X0) / RES));
    const i1 = Math.min(w - 1, Math.ceil((cx + rMax - X0) / RES));
    const j0 = Math.max(0, Math.floor((cz - rMax - Z0) / RES));
    const j1 = Math.min(h - 1, Math.ceil((cz + rMax - Z0) / RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = X0 + (i + 0.5) * RES - cx;
        const dz = Z0 + (j + 0.5) * RES - cz;
        const a = ((Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1) * BINS;
        const b = Math.floor(a) % BINS;
        const t = a - Math.floor(a);
        const r = radius[b] * (1 - t) + radius[(b + 1) % BINS] * t;
        if (Math.hypot(dx, dz) <= r) objects[j * w + i] = 0;
      }
    }
  }

  distanceTransform(shore, w, h);
  distanceTransform(objects, w, h);

  const data = new Uint8Array(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    const i = k % w;
    const j = (k / w) | 0;
    const border = i === 0 || j === 0 || i === w - 1 || j === h - 1;
    data[k * 4] = border ? 255 : Math.min(255, Math.round(shore[k] * RES * 100));
    data[k * 4 + 1] = border ? 255 : Math.min(255, Math.round(objects[k] * RES * 100));
    data[k * 4 + 2] = 0;
    data[k * 4 + 3] = 255;
  }
  const texture = RawTexture.CreateRGBATexture(data, w, h, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
  texture.name = "foamField";
  texture.wrapU = texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  return { texture, region: new Vector4(X0, Z0, 1 / SIZE_X, 1 / SIZE_Z) };
}

/** Two-pass chamfer distance transform in cell units (0 = source). */
function distanceTransform(d: Float32Array, w: number, h: number) {
  const D = 1;
  const D2 = Math.SQRT2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + D);
      if (j > 0) {
        v = Math.min(v, d[k - w] + D);
        if (i > 0) v = Math.min(v, d[k - w - 1] + D2);
        if (i < w - 1) v = Math.min(v, d[k - w + 1] + D2);
      }
      d[k] = v;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      let v = d[k];
      if (i < w - 1) v = Math.min(v, d[k + 1] + D);
      if (j < h - 1) {
        v = Math.min(v, d[k + w] + D);
        if (i < w - 1) v = Math.min(v, d[k + w + 1] + D2);
        if (i > 0) v = Math.min(v, d[k + w - 1] + D2);
      }
      d[k] = v;
    }
  }
}

interface Outline {
  cx: number;
  cz: number;
  radius: number[];
}

/** Outline at the waterline of every mesh (and thin instance) that crosses y = 0. */
function waterlineOutlines(candidates: AbstractMesh[]): Outline[] {
  const out: Outline[] = [];
  const p = new Vector3();
  for (const mesh of candidates) {
    const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!pos) continue;
    const world = mesh.computeWorldMatrix(true);
    const matrices =
      mesh instanceof Mesh && mesh.hasThinInstances
        ? mesh.thinInstanceGetWorldMatrices().map((m) => Matrix.FromArray(m.asArray()).multiply(world))
        : [world];
    for (const m of matrices) {
      const o = outline(pos, m, p);
      if (o) out.push(o);
    }
  }
  return out;
}

function outline(pos: FloatArray, world: Matrix, p: Vector3): Outline | null {
  const pts: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(pos[i], pos[i + 1], pos[i + 2], world, p);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
    if (Math.abs(p.y - WATER_LEVEL) < 0.2) pts.push(p.x, p.z);
  }
  if (minY > WATER_LEVEL - 0.03 || maxY < WATER_LEVEL + 0.05) return null;

  let cx = (minX + maxX) / 2;
  let cz = (minZ + maxZ) / 2;
  const radius = new Array<number>(BINS).fill(0);
  if (pts.length >= 6) {
    cx = 0;
    cz = 0;
    for (let i = 0; i < pts.length; i += 2) {
      cx += pts[i];
      cz += pts[i + 1];
    }
    cx /= pts.length / 2;
    cz /= pts.length / 2;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - cx;
      const dz = pts[i + 1] - cz;
      const b = Math.floor(((Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1) * BINS) % BINS;
      radius[b] = Math.max(radius[b], Math.hypot(dx, dz));
    }
  } else {
    // A long thin pole has few vertices near the waterline: use its bounds.
    radius.fill(Math.min(maxX - minX, maxZ - minZ) / 2);
  }
  if (!radius.some((r) => r > 0)) return null;
  for (let pass = 0; pass < BINS && radius.some((r) => r === 0); pass++) {
    for (let b = 0; b < BINS; b++) {
      if (radius[b] > 0) continue;
      radius[b] = Math.max(radius[(b + BINS - 1) % BINS], radius[(b + 1) % BINS]);
    }
  }
  const smooth = radius.map((r, b) => (radius[(b + BINS - 1) % BINS] + r * 2 + radius[(b + 1) % BINS]) / 4);
  return { cx, cz, radius: smooth };
}
