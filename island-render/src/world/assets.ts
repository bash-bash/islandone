import {
  Color3,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  Quaternion,
  TransformNode,
  Vector3,
  type AssetContainer,
  type Node,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { addWind, type WindSettings } from "./wind";

/**
 * Runtime catalogue of the Blender GLBs used by the beach test.
 * `lod` = max camera distance (m) per LOD level, taken from each asset's manifest
 * (palm.json, rock.json, campfire_stone.json …); beyond the last value the object is culled.
 */
export interface AssetDef {
  url: string;
  lod: number[];
  castShadow: boolean;
  wind?: WindSettings;
}

const PALM_WIND: WindSettings = { height: 6.6, sway: 0.2, flutter: 0.045, speed: 0.9 };
const BUSH_WIND: WindSettings = { height: 1.2, sway: 0.05, flutter: 0.025, speed: 1.4 };
const GRASS_WIND: WindSettings = { height: 0.45, sway: 0.06, flutter: 0.015, speed: 1.8 };

const BASE = import.meta.env.BASE_URL + "assets/";

export const ASSETS = {
  IO_Hut_A_Full: { url: "hut/glb/IO_Hut_A_Full.glb", lod: [400], castShadow: true },
  IO_Palm_A: { url: "palm/IO_Palm_A.glb", lod: [25, 50, 90, 400], castShadow: true, wind: PALM_WIND },
  IO_Palm_B: { url: "palm/IO_Palm_B.glb", lod: [25, 50, 90, 400], castShadow: true, wind: PALM_WIND },
  IO_Palm_Young_A: { url: "palm/IO_Palm_Young_A.glb", lod: [20, 40, 70, 150], castShadow: true, wind: { height: 3, sway: 0.12, flutter: 0.035, speed: 1.1 } },
  IO_Rock_Large_A: { url: "rock/glb/IO_Rock_Large_A.glb", lod: [30, 70, 400], castShadow: true },
  IO_Rock_Large_B: { url: "rock/glb/IO_Rock_Large_B.glb", lod: [30, 70, 400], castShadow: true },
  IO_Stone_Small_A: { url: "stone/IO_Stone_Small_A.glb", lod: [12, 25, 45], castShadow: false },
  IO_Campfire_Stone_A: { url: "campfire_stone/IO_Campfire_Stone_A.glb", lod: [12, 25, 70], castShadow: true },
  IO_Bush_Tropical_A: { url: "bush/IO_Bush_Tropical_A.glb", lod: [15, 35, 70, 120], castShadow: true, wind: BUSH_WIND },
  IO_Bush_Tropical_B: { url: "bush/IO_Bush_Tropical_B.glb", lod: [15, 35, 70, 120], castShadow: true, wind: BUSH_WIND },
  IO_Bush_Tropical_C: { url: "bush/IO_Bush_Tropical_C.glb", lod: [15, 35, 70, 120], castShadow: true, wind: BUSH_WIND },
  IO_Fern_A: { url: "fern/IO_Fern_A.glb", lod: [15, 30, 60, 100], castShadow: false, wind: { height: 0.7, sway: 0.05, flutter: 0.02, speed: 1.5 } },
  IO_Grass_Clump_A: { url: "grass/IO_Grass_Clump_A.glb", lod: [12, 25, 45, 70], castShadow: false, wind: GRASS_WIND },
  IO_Grass_Clump_B: { url: "grass/IO_Grass_Clump_B.glb", lod: [12, 25, 45, 70], castShadow: false, wind: GRASS_WIND },
  IO_Grass_Clump_C: { url: "grass/IO_Grass_Clump_C.glb", lod: [12, 25, 45, 70], castShadow: false, wind: GRASS_WIND },
  IO_Log_Long_A: { url: "log/IO_Log_Long_A.glb", lod: [20, 45, 90], castShadow: true },
  IO_Log_Short_A: { url: "log/IO_Log_Short_A.glb", lod: [20, 45, 90], castShadow: true },
  IO_Plank_Long_A: { url: "plank/IO_Plank_Long_A.glb", lod: [20, 45, 90], castShadow: true },
  IO_Plank_Short_A: { url: "plank/IO_Plank_Short_A.glb", lod: [20, 45, 90], castShadow: true },
  IO_Pole_Long_A: { url: "pole/IO_Pole_Long_A.glb", lod: [20, 45, 90], castShadow: true },
  IO_Fiber_Binding_A_Coil: { url: "fiber/IO_Fiber_Binding_A_Coil.glb", lod: [10, 20, 35], castShadow: false },
  IO_Workbench_A: { url: "workbench/IO_Workbench_A.glb", lod: [15, 30, 60, 120], castShadow: true },
  IO_Seagull_A: { url: "seagull/IO_Seagull_A.glb", lod: [12, 25, 50, 90], castShadow: true },
  IO_Starfish_A: { url: "starfish/IO_Starfish_A.glb", lod: [8, 16, 30, 45], castShadow: false },
} satisfies Record<string, AssetDef>;

export type AssetId = keyof typeof ASSETS;

export interface Placement {
  position: Vector3;
  /** Euler rotation in radians; most props only need `rotationY`. */
  rotation?: Vector3;
  rotationY?: number;
  scale?: number | Vector3;
  /** Per-instance colour multiplier (thin instances only); values above 1 are allowed. */
  color?: Color3;
}

const LOD_NAME = /_LOD(\d)$/;
const COL_NAME = /_COL(_\d+)?$/;

function placementMatrix(p: Placement): Matrix {
  const s = p.scale ?? 1;
  const scale = typeof s === "number" ? new Vector3(s, s, s) : s;
  const rot = p.rotation ?? new Vector3(0, p.rotationY ?? 0, 0);
  return Matrix.Compose(scale, Quaternion.FromEulerVector(rot), p.position);
}

interface LodEntry {
  center: Vector3;
  levels: Node[];
  maxDistance: number[];
  current: number;
}

export interface LibraryStats {
  loaded: number;
  total: number;
}

/**
 * Loads each GLB once and places it either as an individual object with
 * distance-based LOD switching, or as GPU thin instances (one draw call per mesh)
 * for repeated props and vegetation.
 */
export class AssetLibrary {
  private containers = new Map<AssetId, Promise<AssetContainer>>();
  private lodEntries: LodEntry[] = [];
  private frame = 0;
  readonly stats: LibraryStats = { loaded: 0, total: 0 };
  onProgress?: (stats: LibraryStats) => void;

  constructor(
    private scene: Scene,
    private shadows: ShadowGenerator,
  ) {}

  private load(id: AssetId): Promise<AssetContainer> {
    let p = this.containers.get(id);
    if (!p) {
      this.stats.total++;
      this.onProgress?.(this.stats);
      p = LoadAssetContainerAsync(BASE + ASSETS[id].url, this.scene).then((c) => {
        // Instances share the container's materials, so the wind plugin goes on once here.
        const wind = (ASSETS[id] as AssetDef).wind;
        if (wind) for (const m of c.materials) addWind(m, wind);
        this.stats.loaded++;
        this.onProgress?.(this.stats);
        return c;
      });
      this.containers.set(id, p);
    }
    return p;
  }

  /** Collect LOD nodes by index and hide collision proxies in a freshly instantiated hierarchy. */
  private prepare(root: Node): Node[] {
    const levels: Node[] = [];
    for (const n of root.getDescendants(false)) {
      const lod = LOD_NAME.exec(n.name);
      if (lod) levels[Number(lod[1])] = n;
      else if (COL_NAME.test(n.name)) n.setEnabled(false);
    }
    // Assets without LOD nodes (e.g. the hut, whose root mesh is LOD0) count as a single level.
    if (levels.length === 0) levels.push(root);
    return levels;
  }

  private instantiate(id: AssetId, name: string) {
    return this.load(id).then((c) => {
      const inst = c.instantiateModelsToScene((src) => `${name}/${src}`, false, { doNotInstantiate: true });
      const root = inst.rootNodes[0];
      return { root, levels: this.prepare(root) };
    });
  }

  /** One object with its own LOD switching, e.g. the hut, palms, large rocks. */
  async place(id: AssetId, placement: Placement, name: string = id): Promise<TransformNode> {
    const def = ASSETS[id];
    const holder = new TransformNode(name, this.scene);
    const m = placementMatrix(placement);
    const scale = new Vector3();
    const rot = new Quaternion();
    const pos = new Vector3();
    m.decompose(scale, rot, pos);
    holder.position = pos;
    holder.rotationQuaternion = rot;
    holder.scaling = scale;

    const { root, levels } = await this.instantiate(id, name);
    root.parent = holder;
    for (const mesh of holder.getChildMeshes(false)) {
      mesh.receiveShadows = true;
      if (def.castShadow && mesh.isEnabled(false) && mesh.getTotalVertices() > 0) this.shadows.addShadowCaster(mesh, false);
    }
    this.lodEntries.push({
      center: pos,
      levels,
      maxDistance: def.lod.slice(0, levels.length),
      current: -2,
    });
    return holder;
  }

  /**
   * Many copies of one asset as thin instances of a single LOD level.
   * Each instance matrix is built so the glTF handedness conversion on the
   * loader's __root__ node stays correct: M = W · D · W⁻¹.
   */
  async scatter(id: AssetId, placements: Placement[], lodLevel = 0, name: string = id): Promise<Mesh[]> {
    if (placements.length === 0) return [];
    const def = ASSETS[id];
    const { levels } = await this.instantiate(id, `${name}[x${placements.length}]`);
    const keep = levels[Math.min(lodLevel, levels.length - 1)];
    for (const level of levels) if (level !== keep) level.setEnabled(false);

    const meshes = [keep, ...keep.getDescendants(false)].filter(
      (n): n is Mesh => n instanceof Mesh && n.getTotalVertices() > 0,
    );
    const placementMatrices = placements.map(placementMatrix);
    for (const mesh of meshes) {
      const w = mesh.computeWorldMatrix(true).clone();
      const wInv = w.clone().invert();
      // Thin-instance buffers live on the geometry, which clones share: give each scatter its own.
      mesh.makeGeometryUnique();
      const buffer = new Float32Array(placementMatrices.length * 16);
      placementMatrices.forEach((d, i) => w.multiply(d).multiply(wInv).copyToArray(buffer, i * 16));
      mesh.thinInstanceSetBuffer("matrix", buffer, 16, true);
      if (placements.some((p) => p.color)) {
        const colors = new Float32Array(placements.length * 4);
        placements.forEach((p, i) => {
          const c = p.color ?? Color3.White();
          colors.set([c.r, c.g, c.b, 1], i * 4);
        });
        mesh.thinInstanceSetBuffer("color", colors, 4, true);
      }
      mesh.thinInstanceRefreshBoundingInfo(false);
      mesh.receiveShadows = true;
      mesh.alwaysSelectAsActiveMesh = false;
      if (def.castShadow) this.shadows.addShadowCaster(mesh, false);
    }
    return meshes;
  }

  /** Switch LOD levels by camera distance; checks a few times per second, not every frame. */
  update(cameraPosition: Vector3) {
    if (this.frame++ % 10 !== 0) return;
    for (const e of this.lodEntries) {
      const d = Vector3.Distance(cameraPosition, e.center);
      const level = e.maxDistance.findIndex((max) => d <= max); // -1 = beyond the last level: culled
      if (level === e.current) continue;
      e.levels.forEach((n, i) => n.setEnabled(i === level));
      e.current = level;
    }
  }
}
