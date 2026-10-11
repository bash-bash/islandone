import { Color3, Constants, Matrix, Mesh, StandardMaterial, Vector3, VertexData, type AbstractMesh, type Scene } from "@babylonjs/core";
import { WATER_LEVEL, terrainHeight } from "./terrain";

const GRID = 6; // quads per side of each draped blob
const TINT = new Color3(0.62, 0.48, 0.38); // warm brown, like the contact shadows in the reference

/**
 * Soft, warm contact shadows under everything that stands on the sand (handoff §22):
 * a draped ellipse per object or thin instance, multiplied onto the ground.
 * Cheap stand-in for ambient occlusion (SSAO darkens the sea floor through the water).
 * One mesh, one draw call, built once after the beach is placed.
 */
export function createContactShadows(scene: Scene, candidates: AbstractMesh[]): Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const corner = new Vector3();

  const addBlob = (min: Vector3, max: Vector3, trunk: boolean) => {
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    const ground = terrainHeight(cx, cz);
    if (ground < WATER_LEVEL + 0.05) return; // under water the caustics and depth tint do the job
    if (min.y > ground + 0.35) return; // floating (roof parts, palm crowns)
    const sx = max.x - min.x;
    const sz = max.z - min.z;
    if (sx > 9 || sz > 9 || Math.max(sx, sz) < 0.06) return;
    // Palms: only the trunk base touches the ground (the crown has its own sun shadow).
    const rx = trunk ? 0.5 : sx * 0.62 + 0.12;
    const rz = trunk ? 0.5 : sz * 0.62 + 0.12;
    const strength = Math.min(1, 0.45 + Math.min(max.y - min.y, 2) * 0.3);
    const start = positions.length / 3;
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        const u = (i / GRID) * 2 - 1;
        const v = (j / GRID) * 2 - 1;
        const x = cx + u * rx;
        const z = cz + v * rz;
        positions.push(x, terrainHeight(x, z) + 0.012, z);
        const r = Math.hypot(u, v);
        const a = Math.max(0, 1 - r) ** 1.6 * strength;
        colors.push(1 + (TINT.r - 1) * a, 1 + (TINT.g - 1) * a, 1 + (TINT.b - 1) * a, 1);
        if (i < GRID && j < GRID) {
          const k = start + j * (GRID + 1) + i;
          indices.push(k, k + GRID + 1, k + 1, k + 1, k + GRID + 1, k + GRID + 2);
        }
      }
    }
  };

  for (const mesh of candidates) {
    const trunk = /Palm/.test(mesh.name);
    const box = mesh.getRawBoundingInfo().boundingBox;
    const world = mesh.computeWorldMatrix(true);
    const matrices =
      mesh instanceof Mesh && mesh.hasThinInstances
        ? mesh.thinInstanceGetWorldMatrices().map((m) => Matrix.FromArray(m.asArray()).multiply(world))
        : [world];
    for (const m of matrices) {
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const c of box.vectors) {
        Vector3.TransformCoordinatesToRef(c, m, corner);
        min.minimizeInPlace(corner);
        max.maximizeInPlace(corner);
      }
      addBlob(min, max, trunk);
    }
  }

  const mesh = new Mesh("contactShadows", scene);
  if (positions.length === 0) return mesh;
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.colors = colors;
  vd.applyToMesh(mesh);
  const mat = new StandardMaterial("contactShadowsMat", scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.White();
  mat.alphaMode = Constants.ALPHA_MULTIPLY;
  mat.alpha = 0.999; // transparent pass, so it multiplies onto the lit ground
  mat.fogEnabled = false;
  mat.disableDepthWrite = true;
  mat.zOffset = -2;
  mesh.material = mat;
  mesh.alphaIndex = 1;
  mesh.isPickable = false;
  return mesh;
}
