import { LoadAssetContainerAsync, type AbstractMesh, type Scene } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

/**
 * Beach test ground from Blender (assets/terrain, islandone_terrain.py):
 * IO_Terrain_Beach_Test_30m, IO_Seafloor_Test_30m and a low-detail surround,
 * plus a float32 height grid for placement and water depth.
 * Land is -X, the sea is +X, water level is y = 0.
 */
export const WATER_LEVEL = 0;

const BASE = import.meta.env.BASE_URL + "assets/terrain/";
const PIECES = ["IO_Terrain_Beach_Test_30m", "IO_Seafloor_Test_30m", "IO_Terrain_Surround_Test"];

interface HeightGrid {
  data: Float32Array;
  originX: number;
  originZ: number;
  step: number;
  columns: number;
  rows: number;
}

let grid: HeightGrid | null = null;

/** Ground height at a world position (bilinear on the exported height grid, clamped at its edges). */
export function terrainHeight(x: number, z: number): number {
  if (!grid) throw new Error("terrainHeight() called before loadTerrain()");
  const { data, originX, originZ, step, columns, rows } = grid;
  const fx = Math.min(Math.max((x - originX) / step, 0), columns - 1.001);
  const fz = Math.min(Math.max((z - originZ) / step, 0), rows - 1.001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const i = iz * columns + ix;
  const a = data[i] + (data[i + 1] - data[i]) * tx;
  const b = data[i + columns] + (data[i + columns + 1] - data[i + columns]) * tx;
  return a + (b - a) * tz;
}

export function waterDepth(x: number, z: number): number {
  if (!grid) throw new Error("waterDepth() called before loadTerrain()");
  const { originX, originZ, step, columns, rows } = grid;
  const outside = x < originX || z < originZ || x > originX + (columns - 1) * step || z > originZ + (rows - 1) * step;
  return outside ? 6 : WATER_LEVEL - terrainHeight(x, z);
}

export async function loadTerrain(scene: Scene): Promise<AbstractMesh[]> {
  const manifest = await fetch(BASE + "terrain.json").then((r) => r.json());
  const h = manifest.heights;
  const [bin, ...containers] = await Promise.all([
    fetch(BASE + h.file).then((r) => r.arrayBuffer()),
    ...PIECES.map((name) => LoadAssetContainerAsync(BASE + name + ".glb", scene)),
  ]);
  grid = {
    data: new Float32Array(bin),
    originX: h.origin_xz[0],
    originZ: h.origin_xz[1],
    step: h.step_m,
    columns: h.columns,
    rows: h.rows,
  };
  if (grid.data.length !== grid.columns * grid.rows) throw new Error("terrain height grid size mismatch");

  const meshes: AbstractMesh[] = [];
  for (const c of containers) {
    c.addAllToScene();
    for (const m of c.meshes) {
      if (m.getTotalVertices() === 0) continue;
      m.receiveShadows = true;
      m.isPickable = true;
      m.freezeWorldMatrix();
      meshes.push(m);
    }
  }
  return meshes;
}
