import { Color3, MeshBuilder, PBRMaterial, TransformNode, Vector3, type Scene, type ShadowGenerator } from "@babylonjs/core";

/**
 * Stand-in for IO_Character_A (1.75 m) until the rigged character with Idle/Walk is exported.
 * The small box on the front shows which way it faces.
 */
export function createCharacterPlaceholder(scene: Scene, shadows: ShadowGenerator, position: Vector3, yaw: number) {
  const root = new TransformNode("IO_Character_A (Platzhalter)", scene);
  root.position = position;
  root.rotation.y = yaw;

  const skin = new PBRMaterial("placeholderSkin", scene);
  skin.albedoColor = new Color3(0.78, 0.52, 0.36);
  skin.roughness = 0.7;
  skin.metallic = 0;
  const cloth = new PBRMaterial("placeholderCloth", scene);
  cloth.albedoColor = new Color3(0.38, 0.33, 0.24);
  cloth.roughness = 0.9;
  cloth.metallic = 0;

  const body = MeshBuilder.CreateCapsule("body", { height: 1.4, radius: 0.24 }, scene);
  body.position.y = 0.95;
  body.material = skin;
  const legs = MeshBuilder.CreateCapsule("legs", { height: 0.85, radius: 0.22 }, scene);
  legs.position.y = 0.48;
  legs.material = cloth;
  const head = MeshBuilder.CreateSphere("head", { diameter: 0.3 }, scene);
  head.position.y = 1.6;
  head.material = skin;
  const nose = MeshBuilder.CreateBox("facing", { width: 0.08, height: 0.06, depth: 0.08 }, scene);
  nose.position.set(0, 1.6, 0.16);
  nose.material = cloth;

  for (const m of [body, legs, head, nose]) {
    m.parent = root;
    m.receiveShadows = true;
    shadows.addShadowCaster(m);
  }

  // Idle breathing so it reads as a living thing from the orbit camera.
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    body.scaling.y = 1 + Math.sin(t * 2.2) * 0.012;
    head.position.y = 1.6 + Math.sin(t * 2.2) * 0.008;
  });
  return root;
}
