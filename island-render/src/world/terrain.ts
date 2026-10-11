import { Color3, MeshBuilder, PBRMaterial, VertexBuffer, VertexData, type Mesh, type Scene } from "@babylonjs/core";
import { fbm } from "./noise";
import { createSandDetailTexture } from "./textures";

/**
 * Procedural stand-in for IO_Terrain_Beach_Test_30m / IO_Seafloor_Test_30m until the
 * Blender terrain exists. Land is -X, the sea is +X, water level is y = 0.
 */
export const TERRAIN_SIZE = 90;
export const WATER_LEVEL = 0;

/** Seaward distance (m) from the beach crest, which wiggles along Z. */
function shoreDistance(x: number, z: number): number {
  const crestX = 3 + 1.6 * Math.sin(z * 0.22) + 0.8 * Math.sin(z * 0.07 + 1);
  return x - crestX;
}

/** Ground height at a world position. Placement and water depth both use this. */
export function terrainHeight(x: number, z: number): number {
  const d = shoreDistance(x, z);
  let h: number;
  if (d <= 0) {
    // Beach rising gently inland, then a steeper jungle bank.
    const inland = -d;
    h = 0.25 + Math.min(inland, 12) * 0.05 + Math.max(0, inland - 12) * 0.14;
    h += (fbm(x * 0.08, z * 0.08, 3, 11) - 0.5) * Math.min(1, inland / 6) * 0.9;
  } else {
    // Shallow shelf (sand visible through the water), then deeper sea floor.
    h = 0.25 - Math.min(d, 9) * 0.17 - Math.max(0, d - 9) * 0.09;
    h = Math.max(h, -5);
    h += (fbm(x * 0.15, z * 0.15, 3, 21) - 0.5) * 0.25;
  }
  // Small dunes everywhere.
  h += (fbm(x * 0.35, z * 0.35, 2, 5) - 0.5) * 0.08;
  return h;
}

export function waterDepth(x: number, z: number): number {
  if (Math.abs(x) > TERRAIN_SIZE / 2 || Math.abs(z) > TERRAIN_SIZE / 2) return 6;
  return WATER_LEVEL - terrainHeight(x, z);
}

const DRY_SAND = new Color3(0.98, 0.8, 0.52);
const WET_SAND = new Color3(0.72, 0.54, 0.34);
const SEABED = new Color3(0.9, 0.76, 0.5);
const JUNGLE_FLOOR = new Color3(0.42, 0.44, 0.2);

export function createTerrain(scene: Scene): Mesh {
  const ground = MeshBuilder.CreateGround(
    "IO_Terrain_Beach_Test",
    { width: TERRAIN_SIZE, height: TERRAIN_SIZE, subdivisions: 180, updatable: true },
    scene,
  );

  const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((positions.length / 3) * 4);
  const tmp = new Color3();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    const h = terrainHeight(x, z);
    positions[i + 1] = h;

    const inland = -shoreDistance(x, z);
    if (h < -0.05) {
      Color3.LerpToRef(WET_SAND, SEABED, Math.min(1, -h / 1.5), tmp);
    } else if (h < 0.32) {
      Color3.LerpToRef(WET_SAND, DRY_SAND, Math.max(0, (h - 0.05) / 0.27), tmp);
    } else {
      Color3.LerpToRef(DRY_SAND, JUNGLE_FLOOR, Math.min(1, Math.max(0, (inland - 9) / 6)), tmp);
    }
    const c = (i / 3) * 4;
    colors[c] = tmp.r;
    colors[c + 1] = tmp.g;
    colors[c + 2] = tmp.b;
    colors[c + 3] = 1;
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, positions);
  ground.setVerticesData(VertexBuffer.ColorKind, colors);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, ground.getIndices()!, normals);
  ground.updateVerticesData(VertexBuffer.NormalKind, normals);

  const mat = new PBRMaterial("IO_MAT_Sand", scene);
  const detail = createSandDetailTexture(scene);
  detail.uScale = TERRAIN_SIZE / 2.5;
  detail.vScale = TERRAIN_SIZE / 2.5;
  mat.albedoTexture = detail;
  mat.metallic = 0;
  mat.roughness = 0.95;
  ground.material = mat;
  ground.receiveShadows = true;
  ground.isPickable = true;
  ground.freezeWorldMatrix();
  return ground;
}
