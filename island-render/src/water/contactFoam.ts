import { Color3, Matrix, Mesh, StandardMaterial, Vector3, VertexBuffer, VertexData, type AbstractMesh, type FloatArray, type Scene } from "@babylonjs/core";
import { createFoamTexture } from "../world/textures";
import { WATER_LEVEL } from "../world/terrain";

const BINS = 32;
const WIDTH = 0.55; // how far the foam reaches out from the object, metres

/**
 * Foam where objects break the water surface: rocks, dock posts, stones (handoff §19).
 * For every mesh crossing the waterline, the vertices near the waterline give a
 * polar outline; a ring follows that outline outwards with fading alpha. All rings
 * share one mesh (one draw call); the alpha pulses as if small waves slosh around.
 */
export function createContactFoam(scene: Scene, candidates: AbstractMesh[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const baseAlpha: number[] = [];
  const phase: number[] = [];
  const p = new Vector3();

  for (const mesh of candidates) {
    const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!pos) continue;
    const world = mesh.computeWorldMatrix(true);
    // Thin instances (dock posts, scattered stones) each get their own ring.
    const matrices =
      mesh instanceof Mesh && mesh.hasThinInstances
        ? Array.from({ length: mesh.thinInstanceCount }, (_, i) =>
            Matrix.FromArray(mesh.thinInstanceGetWorldMatrices()[i].asArray()).multiply(world),
          )
        : [world];
    for (const m of matrices) addRing(pos, m);
  }

  function addRing(pos: FloatArray, world: Matrix) {
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
    if (minY > WATER_LEVEL - 0.03 || maxY < WATER_LEVEL + 0.05) return;

    let cx = 0;
    let cz = 0;
    const radius = new Float32Array(BINS);
    if (pts.length >= 6) {
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
      // Too few vertices near the waterline (a long thin pole): use the bounds.
      cx = (minX + maxX) / 2;
      cz = (minZ + maxZ) / 2;
      radius.fill(Math.min(maxX - minX, maxZ - minZ) / 2);
    }
    // Fill empty bins from their neighbours, then smooth the outline.
    const filled = Array.from(radius);
    if (!filled.some((r) => r > 0)) return;
    for (let pass = 0; pass < BINS && filled.some((r) => r === 0); pass++) {
      for (let b = 0; b < BINS; b++) {
        if (filled[b] > 0) continue;
        const l = filled[(b + BINS - 1) % BINS];
        const r = filled[(b + 1) % BINS];
        if (l > 0 || r > 0) filled[b] = Math.max(l, r);
      }
    }
    const smooth = filled.map((r, b) => (filled[(b + BINS - 1) % BINS] + r * 2 + filled[(b + 1) % BINS]) / 4);
    const objPhase = cx * 0.7 + cz * 1.3;
    const width = Math.min(WIDTH, 0.25 + Math.max(...smooth) * 0.35);

    const start = positions.length / 3;
    for (let b = 0; b <= BINS; b++) {
      const a = ((b % BINS) / BINS) * Math.PI * 2;
      const r = smooth[b % BINS];
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      for (const [off, alpha] of [
        [-0.08, 0.9],
        [width * 0.35, 0.65],
        [width, 0],
      ] as const) {
        const x = cx + dx * (r + off);
        const z = cz + dz * (r + off);
        positions.push(x, WATER_LEVEL + 0.025, z);
        uvs.push(x / 2.5, z / 2.5);
        baseAlpha.push(alpha);
        phase.push(objPhase + a * 2);
      }
      if (b < BINS) {
        const i = start + b * 3;
        for (const k of [0, 1]) indices.push(i + k, i + k + 3, i + k + 1, i + k + 1, i + k + 3, i + k + 4);
      }
    }
  }

  const mesh = new Mesh("contactFoam", scene);
  if (positions.length === 0) return { mesh, update() {} };
  const colors = new Float32Array((positions.length / 3) * 4).fill(1);
  const vd = new VertexData();
  vd.positions = positions;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.colors = colors;
  vd.normals = new Array(positions.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0));
  vd.applyToMesh(mesh, true);
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.alphaIndex = 11; // after the water surface (10)

  const tex = createFoamTexture(scene);
  const mat = new StandardMaterial("contactFoamMat", scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(0.95, 0.98, 1);
  mat.opacityTexture = tex;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.zOffset = -2;
  mesh.material = mat;

  return {
    mesh,
    update(t: number) {
      tex.uOffset = t * 0.01;
      tex.vOffset = t * 0.006;
      for (let i = 0; i < baseAlpha.length; i++) {
        const pulse = 0.55 + 0.45 * Math.sin(t * 1.4 + phase[i]);
        colors[i * 4 + 3] = baseAlpha[i] * pulse;
      }
      mesh.updateVerticesData(VertexBuffer.ColorKind, colors);
    },
  };
}
