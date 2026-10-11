import { Matrix, Mesh, Vector3, type Scene } from "@babylonjs/core";
import { terrainHeight } from "../world/terrain";

// Simple 2D collision for walking around the camp: circles and axis-aligned boxes on the
// ground plane, plus a height rule (no climbing walls, no wading into deep water, no stepping
// off the pier). Good enough for one character; island-sim will own this later.

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Walkable {
  /** Deck top height inside the rectangle, e.g. the pier. */
  rect: Box;
  y: number;
}

export interface CollisionWorld {
  circles: Circle[];
  boxes: Box[];
  decks: Walkable[];
}

export const CHARACTER_RADIUS = 0.28;
const MAX_STEP_UP = 0.6; // m: up onto the pier, not onto a rock
const MAX_STEP_DOWN = 0.6; // m: keeps the character on the pier
const DEEPEST_WADE = -0.45; // m below the water line

/** Ground height the character stands on: terrain, or a deck above it. */
export function groundAt(world: CollisionWorld, x: number, z: number): number {
  let y = terrainHeight(x, z);
  for (const d of world.decks) if (x >= d.rect.x0 && x <= d.rect.x1 && z >= d.rect.z0 && z <= d.rect.z1) y = Math.max(y, d.y);
  return y;
}

/**
 * Moves from `from` by (dx, dz), sliding along obstacles. Returns the new position on the ground.
 * Height rules are checked per axis so the character slides along the water line or the pier edge.
 */
export function moveWithCollision(world: CollisionWorld, from: Vector3, dx: number, dz: number): Vector3 {
  const fromY = groundAt(world, from.x, from.z);
  const ok = (x: number, z: number) => {
    const y = groundAt(world, x, z);
    if (y - fromY > MAX_STEP_UP || fromY - y > MAX_STEP_DOWN) return false;
    return y > DEEPEST_WADE;
  };
  let x = from.x;
  let z = from.z;
  if (ok(x + dx, z)) x += dx;
  if (ok(x, z + dz)) z += dz;

  // Push out of obstacles (two passes settle corners between neighbours).
  for (let pass = 0; pass < 2; pass++) {
    for (const c of world.circles) {
      const ox = x - c.x;
      const oz = z - c.z;
      const min = c.r + CHARACTER_RADIUS;
      const d2 = ox * ox + oz * oz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-4;
      x = c.x + (ox / d) * min;
      z = c.z + (oz / d) * min;
    }
    for (const b of world.boxes) {
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const ox = x - cx;
      const oz = z - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= CHARACTER_RADIUS * CHARACTER_RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = cx + (ox / d) * CHARACTER_RADIUS;
        z = cz + (oz / d) * CHARACTER_RADIUS;
      } else {
        // Centre inside the box: leave by the nearest side.
        const exits = [x - b.x0, b.x1 - x, z - b.z0, b.z1 - z];
        const i = exits.indexOf(Math.min(...exits));
        if (i === 0) x = b.x0 - CHARACTER_RADIUS;
        else if (i === 1) x = b.x1 + CHARACTER_RADIUS;
        else if (i === 2) z = b.z0 - CHARACTER_RADIUS;
        else z = b.z1 + CHARACTER_RADIUS;
      }
    }
  }
  if (!ok(x, z)) return new Vector3(from.x, fromY, from.z);
  return new Vector3(x, groundAt(world, x, z), z);
}

/**
 * Collects obstacles from the placed scene:
 * - the assets' own collision proxies (`*_COL`, hidden): hut walls, palm trunks, rocks, workbench;
 * - per-instance bounds of scattered props you can't walk through (woodpiles, crates, loose logs);
 * - the campfire as one circle.
 */
export function buildCollisionWorld(scene: Scene, extra: Partial<CollisionWorld> = {}): CollisionWorld {
  const world: CollisionWorld = { circles: [...(extra.circles ?? [])], boxes: [...(extra.boxes ?? [])], decks: [...(extra.decks ?? [])] };
  const min = new Vector3();
  const max = new Vector3();
  const corner = new Vector3();

  const bounds = (mesh: Mesh, m: Matrix) => {
    min.setAll(Infinity);
    max.setAll(-Infinity);
    for (const c of mesh.getRawBoundingInfo().boundingBox.vectors) {
      Vector3.TransformCoordinatesToRef(c, m, corner);
      min.minimizeInPlace(corner);
      max.maximizeInPlace(corner);
    }
    const ground = terrainHeight((min.x + max.x) / 2, (min.z + max.z) / 2);
    // Ignore what floats above head height (roof parts, the seagull) or lies flat (planks).
    return min.y < ground + 1.2 && max.y > ground + 0.25;
  };

  for (const mesh of scene.meshes) {
    if (!(mesh instanceof Mesh) || !/_COL(_\d+)?$/.test(mesh.name)) continue;
    // Scattered assets ("Name[xN]/…") keep an untransformed proxy at the origin: skip it.
    if (mesh.name.includes("[x")) continue;
    // Only proxies of placed objects; the holder (parent chain) must be live.
    if (mesh.parent && !mesh.parent.isEnabled()) continue;
    if (!bounds(mesh, mesh.computeWorldMatrix(true))) continue;
    const sx = max.x - min.x;
    const sz = max.z - min.z;
    if (/Palm/.test(mesh.name)) world.circles.push({ x: (min.x + max.x) / 2, z: (min.z + max.z) / 2, r: Math.min(sx, sz) / 2 });
    else if (/Rock|Seagull/.test(mesh.name)) world.circles.push({ x: (min.x + max.x) / 2, z: (min.z + max.z) / 2, r: ((sx + sz) / 4) * 0.85 });
    else world.boxes.push({ x0: min.x, z0: min.z, x1: max.x, z1: max.z });
  }

  for (const mesh of scene.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.hasThinInstances || !/^(Woodpile|Crates|LooseLogs)/.test(mesh.name)) continue;
    const world0 = mesh.computeWorldMatrix(true);
    for (const t of mesh.thinInstanceGetWorldMatrices()) {
      if (!bounds(mesh, Matrix.FromArray(t.asArray()).multiply(world0))) continue;
      world.boxes.push({ x0: min.x, z0: min.z, x1: max.x, z1: max.z });
    }
  }
  return world;
}
