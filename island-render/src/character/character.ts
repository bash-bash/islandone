import {
  LoadAssetContainerAsync,
  Scalar,
  TransformNode,
  Vector3,
  type AnimationGroup,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { CHARACTER_RADIUS, DEEPEST_WADE, MAX_STEP_DOWN, MAX_STEP_UP, groundAt, moveWithCollision, type CollisionWorld } from "./collision";
import { buildWalkGrid, findPath, type Point, type WalkGrid } from "./pathfind";

// IO_Character_A (assets/character/character.json): 1.75 m, Mixamo skeleton, faces +Z.
// IslandOne's figure is autonomous; the viewer watches and does not steer it. island-sim
// drives it through `goTo` (src/sim/feedPlayer.ts); without a feed it wanders between camp
// spots on its own and idles in between. Finds a way around obstacles (pathfind.ts) and slides along them
// (collision.ts); when it gets stuck anyway it looks for a new way from where it stands.

const URL = import.meta.env.BASE_URL + "assets/character/IO_Character_A.glb";
const WALK_SPEED = 1.25; // m/s, matches the in-place Walk clip at this scale
const TURN_SPEED = 6; // rad/s
const BLEND_SPEED = 4; // weight per second
const WAYPOINT_REACHED = 0.3; // m: close enough to a corner to head for the next one
const MAX_REPLANS = 3; // new ways tried after getting stuck before giving up on a target

/** Stand-in behaviour until island-sim: places it likes to go to (fire, woodpile, workbench, shore, camp). */
const SPOTS: [number, number][] = [
  [-2.6, -1.6],
  [1.0, -2.9],
  [-1.5, 4.4],
  [3.4, 1.5],
  [-1.4, -0.6],
];

export interface Character {
  root: TransformNode;
  /** Walk to a point on the ground (the hook for island-sim). Stops the stand-in wandering for good. */
  goTo(point: Vector3): void;
  /** Whether it is still on its way to the last goTo point. */
  readonly walking: boolean;
  setCollision(world: CollisionWorld): void;
  update(dt: number): void;
}

export async function createCharacter(
  scene: Scene,
  shadows: ShadowGenerator,
  start: Vector3,
): Promise<Character> {
  const container = await LoadAssetContainerAsync(URL, scene);
  container.addAllToScene();
  // Babylon auto-plays the first clip on import; we drive them ourselves.
  container.animationGroups.forEach((g) => g.stop());

  const root = new TransformNode("Character", scene);
  container.rootNodes.forEach((n) => (n.parent = root));
  root.position.copyFrom(start);

  for (const m of container.meshes) {
    if (m.getTotalVertices() === 0) continue;
    m.receiveShadows = true;
    // Skinned bounds don't follow the pose; one character is cheap enough to never cull.
    m.alwaysSelectAsActiveMesh = true;
    shadows.addShadowCaster(m, false);
  }

  const clip = (name: string) => {
    const g = container.animationGroups.find((a) => a.name === name);
    if (!g) throw new Error(`IO_Character_A: animation "${name}" missing`);
    return g;
  };
  const idle = clip("Idle");
  const walk = clip("Walk");
  const loops: AnimationGroup[] = [idle, walk];
  const weights = new Map<AnimationGroup, number>([
    [idle, 1],
    [walk, 0],
  ]);
  for (const g of loops) {
    g.start(true);
    g.setWeightForAllAnimatables(weights.get(g)!);
  }

  let target: Vector3 | null = null;
  let world: CollisionWorld = { circles: [], boxes: [], decks: [] };
  let grid: WalkGrid | null = null;
  let path: Point[] = []; // corners still ahead, the last one is the target
  let replans = 0;
  let stuckFor = 0;
  let idleFor = 1;
  let spot = 0;
  let wander = true;

  /** Plans a way from where it stands to `target`; without one it walks straight at it. */
  const plan = () => {
    if (!target) return;
    const p = root.position;
    path = (grid && findPath(grid, { x: p.x, z: p.z }, { x: target.x, z: target.z })) ?? [{ x: target.x, z: target.z }];
    stuckFor = 0;
  };
  const setTarget = (point: Vector3) => {
    target = point.clone();
    replans = 0;
    plan();
  };

  return {
    root,
    goTo(point) {
      setTarget(point);
      wander = false;
    },
    get walking() {
      return target !== null;
    },
    setCollision(w) {
      world = w;
      grid = buildWalkGrid(w, {
        radius: CHARACTER_RADIUS,
        maxStep: Math.min(MAX_STEP_UP, MAX_STEP_DOWN),
        deepestWade: DEEPEST_WADE,
        ground: (x, z) => groundAt(w, x, z),
      });
      plan();
    },
    update(dt: number) {
      let move: Vector3 | null = null;
      let speed = WALK_SPEED;
      if (target && stuckFor > 0.6 && replans < MAX_REPLANS) {
        replans++;
        plan();
      }
      if (target) {
        // Skip corners already reached; the last waypoint is the target itself.
        let next = path[0] ?? target;
        const p = root.position;
        while (path.length > 1 && Math.hypot(next.x - p.x, next.z - p.z) < WAYPOINT_REACHED) {
          path.shift();
          next = path[0]!;
        }
        const to = new Vector3(next.x - p.x, 0, next.z - p.z);
        const dist = to.length();
        if ((path.length <= 1 && dist < 0.1) || stuckFor > 0.6) {
          target = null;
          path = [];
          idleFor = 3 + Math.random() * 4;
        } else {
          move = to;
          if (path.length <= 1) speed = Math.min(speed, dist / Math.max(dt, 1e-3));
        }
      } else if (wander && (idleFor -= dt) <= 0) {
        spot = (spot + 1 + Math.floor(Math.random() * (SPOTS.length - 1))) % SPOTS.length;
        const [x, z] = SPOTS[spot];
        setTarget(new Vector3(x, 0, z));
      }

      let walking = false;
      if (move) {
        walking = true;
        const heading = Math.atan2(move.x, move.z);
        let diff = heading - root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        root.rotation.y += Scalar.Clamp(diff, -TURN_SPEED * dt, TURN_SPEED * dt);
        // Slow down while turning sharply so it doesn't moonwalk around corners.
        const step = speed * dt * Math.max(0.2, Math.cos(diff));
        const dir = move.normalize();
        const next = moveWithCollision(world, root.position, dir.x * step, dir.z * step);
        const moved = Math.hypot(next.x - root.position.x, next.z - root.position.z);
        stuckFor = moved < step * 0.25 ? stuckFor + dt : 0;
        root.position.copyFrom(next);
      } else {
        root.position.copyFrom(moveWithCollision(world, root.position, 0, 0));
      }

      // Cross-fade between Idle and Walk.
      for (const g of loops) {
        const goal = (g === walk) === walking ? 1 : 0;
        const w = weights.get(g)!;
        const next = w + Scalar.Clamp(goal - w, -BLEND_SPEED * dt, BLEND_SPEED * dt);
        if (next !== w) {
          weights.set(g, next);
          g.setWeightForAllAnimatables(next);
        }
      }
    },
  };
}
