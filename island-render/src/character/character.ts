import {
  LoadAssetContainerAsync,
  PointerEventTypes,
  Scalar,
  TransformNode,
  Vector3,
  type AnimationGroup,
  type Mesh,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { terrainHeight } from "../world/terrain";

// IO_Character_A (assets/character/character.json): 1.75 m, Mixamo skeleton, faces +Z.
// For the render test it wanders between camp spots on its own and idles in between;
// clicking the sand sends it somewhere. No collision or path finding yet: it walks straight
// lines. The real behaviour will come from island-sim.

const URL = import.meta.env.BASE_URL + "assets/character/IO_Character_A.glb";
const WALK_SPEED = 1.25; // m/s, matches the in-place Walk clip at this scale
const TURN_SPEED = 6; // rad/s
const BLEND_SPEED = 4; // weight per second

/** Places it likes to go to: campfire, woodpile, workbench, shoreline, middle of camp. */
const SPOTS: [number, number][] = [
  [-2.6, -1.6],
  [1.0, -2.9],
  [-1.5, 4.4],
  [3.4, 1.5],
  [-1.4, -0.6],
];

export interface Character {
  root: TransformNode;
  update(dt: number): void;
}

export async function createCharacter(
  scene: Scene,
  shadows: ShadowGenerator,
  ground: Mesh,
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
  let idleFor = 1;
  let spot = 0;

  scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERTAP || info.event.button !== 0) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === ground);
    if (pick?.hit && pick.pickedPoint && terrainHeight(pick.pickedPoint.x, pick.pickedPoint.z) > 0.05) {
      target = pick.pickedPoint.clone();
    }
  });

  return {
    root,
    update(dt: number) {
      let walking = false;
      if (target) {
        const to = target.subtract(root.position);
        to.y = 0;
        const dist = to.length();
        if (dist < 0.08) {
          target = null;
          idleFor = 3 + Math.random() * 4;
        } else {
          walking = true;
          const heading = Math.atan2(to.x, to.z);
          let diff = heading - root.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          root.rotation.y += Scalar.Clamp(diff, -TURN_SPEED * dt, TURN_SPEED * dt);
          // Slow down while turning sharply so it doesn't moonwalk around corners.
          const step = Math.min(dist, WALK_SPEED * dt * Math.max(0.2, Math.cos(diff)));
          root.position.addInPlace(to.normalize().scale(step));
        }
      } else if ((idleFor -= dt) <= 0) {
        spot = (spot + 1 + Math.floor(Math.random() * (SPOTS.length - 1))) % SPOTS.length;
        const [x, z] = SPOTS[spot];
        target = new Vector3(x, 0, z);
      }
      root.position.y = terrainHeight(root.position.x, root.position.z);

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
