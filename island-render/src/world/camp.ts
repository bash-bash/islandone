import {
  Color3,
  Color4,
  MeshBuilder,
  ParticleSystem,
  PBRMaterial,
  PointLight,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import type { AssetLibrary, Placement } from "./assets";
import { terrainHeight } from "./terrain";
import { createSoftParticleTexture } from "./textures";

// Camp pieces assembled from the modular kit (logs, planks, poles, campfire stones),
// as the handoff asks: no prefabricated dock or campfire GLB.

const ground = (x: number, z: number) => terrainHeight(x, z);

/** Stone ring, crossed firewood, pole tripod, a pot placeholder, flames and a flickering light. */
export async function buildCampfire(lib: AssetLibrary, scene: Scene, cx: number, cz: number) {
  const y = ground(cx, cz);
  const stones: Placement[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    stones.push({
      position: new Vector3(cx + Math.cos(a) * 0.6, y - 0.01, cz + Math.sin(a) * 0.6),
      rotationY: -a + Math.PI / 2 + (i % 3) * 0.3,
      scale: 0.9 + ((i * 7) % 5) * 0.06,
    });
  }
  const firewood: Placement[] = [0, 1, 2, 3].map((i) => ({
    position: new Vector3(cx, y + 0.08 + (i % 2) * 0.07, cz),
    rotation: new Vector3(0, (i / 4) * Math.PI + 0.2, 0.18),
    scale: new Vector3(0.55, 0.32, 0.32),
  }));

  // Tripod: three poles leaning together over the fire.
  const top = new Vector3(cx, y + 1.65, cz);
  const tripod: Placement[] = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const foot = new Vector3(cx + Math.cos(a) * 0.95, y - 0.05, cz + Math.sin(a) * 0.95);
    const dir = top.subtract(foot);
    const length = dir.length() + 0.25;
    const mid = foot.add(dir.scale(0.55));
    // Pole axis is X; yaw it towards the centre, then pitch it up.
    const yaw = Math.atan2(-dir.z, dir.x);
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    return { position: mid, rotation: new Vector3(0, yaw, pitch), scale: new Vector3(length / 3, 0.55, 0.55) };
  });

  await Promise.all([
    lib.scatter("IO_Campfire_Stone_A", stones, 0, "Campfire_Ring"),
    lib.scatter("IO_Log_Short_A", firewood, 0, "Campfire_Firewood"),
    lib.scatter("IO_Pole_Long_A", tripod, 0, "Campfire_Tripod"),
  ]);

  // Pot: placeholder until a pot asset exists.
  const pot = MeshBuilder.CreateSphere("Placeholder_Pot", { diameter: 0.42, slice: 0.62, segments: 16 }, scene);
  pot.rotation.x = Math.PI;
  pot.position.set(cx, y + 0.75, cz);
  const potMat = new PBRMaterial("placeholderPot", scene);
  potMat.albedoColor = new Color3(0.12, 0.11, 0.1);
  potMat.metallic = 0.6;
  potMat.roughness = 0.5;
  pot.material = potMat;
  const rope = MeshBuilder.CreateCylinder("Placeholder_PotRope", { height: 0.85, diameter: 0.015 }, scene);
  rope.position.set(cx, y + 1.2, cz);
  rope.material = potMat;

  // Flames (browser effect, handoff "Fire").
  const flameTex = createSoftParticleTexture(scene);
  const fire = new ParticleSystem("fire", 260, scene);
  fire.particleTexture = flameTex;
  fire.emitter = new Vector3(cx, y + 0.12, cz);
  fire.minEmitBox = new Vector3(-0.22, 0, -0.22);
  fire.maxEmitBox = new Vector3(0.22, 0.05, 0.22);
  fire.color1 = new Color4(1, 0.62, 0.15, 1);
  fire.color2 = new Color4(1, 0.35, 0.05, 1);
  fire.colorDead = new Color4(0.3, 0.05, 0, 0);
  fire.minSize = 0.18;
  fire.maxSize = 0.42;
  fire.minLifeTime = 0.25;
  fire.maxLifeTime = 0.6;
  fire.emitRate = 220;
  fire.blendMode = ParticleSystem.BLENDMODE_ADD;
  fire.direction1 = new Vector3(-0.15, 1.6, -0.15);
  fire.direction2 = new Vector3(0.15, 2.2, 0.15);
  fire.minEmitPower = 0.35;
  fire.maxEmitPower = 0.7;
  fire.gravity = new Vector3(0, 0.6, 0);
  fire.start();

  const smoke = new ParticleSystem("smoke", 80, scene);
  smoke.particleTexture = flameTex;
  smoke.emitter = new Vector3(cx, y + 0.9, cz);
  smoke.minEmitBox = new Vector3(-0.1, 0, -0.1);
  smoke.maxEmitBox = new Vector3(0.1, 0, 0.1);
  smoke.color1 = new Color4(0.75, 0.75, 0.75, 0.18);
  smoke.color2 = new Color4(0.85, 0.85, 0.85, 0.12);
  smoke.colorDead = new Color4(0.9, 0.9, 0.9, 0);
  smoke.minSize = 0.4;
  smoke.maxSize = 1.1;
  smoke.minLifeTime = 2.5;
  smoke.maxLifeTime = 4;
  smoke.emitRate = 14;
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  smoke.direction1 = new Vector3(0.1, 0.5, -0.05);
  smoke.direction2 = new Vector3(0.35, 0.8, 0.1);
  smoke.minEmitPower = 0.4;
  smoke.maxEmitPower = 0.7;
  smoke.start();

  const glow = new PointLight("fireLight", new Vector3(cx, y + 0.5, cz), scene);
  glow.diffuse = new Color3(1, 0.55, 0.2);
  glow.range = 6;
  glow.intensity = 1.2;
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    glow.intensity = 1.1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23.7) * 0.08;
  });
}

/**
 * Simple pier from the modular kit: pole posts, pole stringers and long planks as decking.
 * Runs from the beach (startX) out to sea along +X at the given z.
 */
export async function buildDock(lib: AssetLibrary, startX: number, length: number, z: number) {
  const deckY = 0.8;
  const halfWidth = 1.15;
  const pitch = 0.27; // plank width 0.25 m + gap

  const planks: Placement[] = [];
  for (let x = startX; x <= startX + length; x += pitch) {
    const i = planks.length;
    planks.push({
      position: new Vector3(x, deckY + (i % 3) * 0.006, z + ((i * 37) % 7) * 0.012 - 0.04),
      rotation: new Vector3(((i % 4) - 1.5) * 0.008, Math.PI / 2 + ((i * 13) % 5) * 0.006 - 0.012, 0),
    });
  }

  const stringers: Placement[] = [];
  for (let x = startX + 1.5; x < startX + length; x += 2.9) {
    for (const side of [-1, 1]) {
      stringers.push({ position: new Vector3(x, deckY - 0.12, z + side * (halfWidth - 0.15)) });
    }
  }

  const posts: Placement[] = [];
  const postHeight = 3;
  for (let x = startX + 0.2; x <= startX + length + 0.01; x += (length - 0.4) / 3) {
    for (const side of [-1, 1]) {
      const top = deckY + 0.35 + (side > 0 ? 0.05 : 0);
      posts.push({
        position: new Vector3(x, top - postHeight / 2, z + side * halfWidth),
        rotation: new Vector3(0, 0, Math.PI / 2),
      });
    }
  }

  await Promise.all([
    lib.scatter("IO_Plank_Long_A", planks, 0, "Dock_Decking"),
    lib.scatter("IO_Pole_Long_A", stringers, 0, "Dock_Stringers"),
    lib.scatter("IO_Pole_Long_A", posts, 0, "Dock_Posts"),
    lib.place(
      "IO_Fiber_Binding_A_Coil",
      { position: new Vector3(startX + length - 0.8, deckY + 0.03, z + 0.5), rotationY: 0.7 },
      "Dock_RopeCoil",
    ),
  ]);
}

/** Two stacked log layers, e.g. a woodpile. */
export function logPile(cx: number, cz: number, yaw: number, count: number): Placement[] {
  const out: Placement[] = [];
  const y0 = ground(cx, cz) + 0.16;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const put = (across: number, up: number, along: number) => {
    // Local frame: logs lie along X, stacked across Z.
    const x = cx + along * cos + across * sin;
    const z = cz - along * sin + across * cos;
    out.push({ position: new Vector3(x, y0 + up, z), rotation: new Vector3(across * 0.3, yaw, 0) });
  };
  const bottom = Math.ceil(count * 0.6);
  for (let i = 0; i < bottom; i++) put((i - (bottom - 1) / 2) * 0.35, 0, (i % 2) * 0.12);
  for (let i = 0; i < count - bottom; i++) put((i - (count - bottom - 1) / 2) * 0.35, 0.3, -0.1);
  return out;
}
