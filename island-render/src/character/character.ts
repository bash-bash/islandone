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
import { moveWithCollision, type CollisionWorld } from "./collision";

// IO_Character_A (assets/character/character.json): 1.75 m, Mixamo skeleton, faces +Z.
// Driven by the player (playerControl.ts): a move direction from the keyboard, or a point to
// walk to from a click. Walks straight, slides along obstacles (collision.ts); no path finding.

const URL = import.meta.env.BASE_URL + "assets/character/IO_Character_A.glb";
const WALK_SPEED = 1.25; // m/s, matches the in-place Walk clip at this scale
const RUN_FACTOR = 2; // no Run clip yet: the Walk clip plays faster
const TURN_SPEED = 8; // rad/s
const BLEND_SPEED = 5; // weight per second

export interface Character {
  root: TransformNode;
  /** Keyboard input: world-space direction on the ground (length 0…1), or null to stop. */
  drive(direction: Vector3 | null, run: boolean): void;
  /** Click input: walk to a point; cancelled by keyboard input. */
  goTo(point: Vector3): void;
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
  let input: Vector3 | null = null;
  let running = false;
  let world: CollisionWorld = { circles: [], boxes: [], decks: [] };
  let stuckFor = 0;

  return {
    root,
    drive(direction, run) {
      input = direction && direction.lengthSquared() > 1e-4 ? direction : null;
      running = run;
      if (input) target = null;
    },
    goTo(point) {
      target = point.clone();
      stuckFor = 0;
    },
    setCollision(w) {
      world = w;
    },
    update(dt: number) {
      let move: Vector3 | null = null;
      let speed = WALK_SPEED * (running ? RUN_FACTOR : 1);
      if (input) {
        move = input.clone();
        speed *= Math.min(1, input.length());
      } else if (target) {
        const to = target.subtract(root.position);
        to.y = 0;
        const dist = to.length();
        if (dist < 0.1 || stuckFor > 0.6) target = null;
        else {
          move = to;
          speed = Math.min(speed, dist / Math.max(dt, 1e-3));
        }
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
      walk.speedRatio = running && walking ? RUN_FACTOR : 1;

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
