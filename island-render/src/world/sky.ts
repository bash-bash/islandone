import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  ReflectionProbe,
  RenderTargetTexture,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  type Mesh,
} from "@babylonjs/core";

const ZENITH = new Color3(0.27, 0.56, 0.9);
const HORIZON = new Color3(0.78, 0.9, 0.97);
const SUN_DIR = new Vector3(-0.55, -1, 0.45).normalize();

export interface SkyAndLight {
  sky: Mesh;
  sun: DirectionalLight;
  shadows: ShadowGenerator;
  /** Static cube capture of the sky, used for water reflections. */
  skyReflection: ReflectionProbe;
}

/**
 * Daytime only (handoff §21): gradient sky dome, one sun with soft shadows,
 * hemispheric fill light, light haze towards the horizon.
 */
export function createSkyAndLight(scene: Scene, shadowMapSize = 2048): SkyAndLight {
  scene.clearColor = new Color4(HORIZON.r, HORIZON.g, HORIZON.b, 1);
  scene.ambientColor = new Color3(0.25, 0.25, 0.25);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0045;
  scene.fogColor = HORIZON.clone();

  const sky = MeshBuilder.CreateSphere("sky", { diameter: 1000, segments: 24, sideOrientation: 1 }, scene);
  const positions = sky.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((positions.length / 3) * 4);
  const c = new Color3();
  for (let i = 0; i < positions.length; i += 3) {
    const up = Math.max(0, positions[i + 1] / 500);
    Color3.LerpToRef(HORIZON, ZENITH, Math.pow(up, 0.55), c);
    // Warm glow around the sun.
    const p = new Vector3(positions[i], positions[i + 1], positions[i + 2]).normalize();
    const sunGlow = Math.pow(Math.max(0, Vector3.Dot(p, SUN_DIR.negate())), 24) * 0.5;
    colors.set([c.r + sunGlow, c.g + sunGlow * 0.9, c.b + sunGlow * 0.6, 1], (i / 3) * 4);
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors);
  const skyMat = new StandardMaterial("skyMat", scene);
  skyMat.disableLighting = true;
  skyMat.emissiveColor = Color3.White();
  skyMat.fogEnabled = false;
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;

  const hemi = new HemisphericLight("skyFill", new Vector3(0.2, 1, -0.1), scene);
  hemi.intensity = 0.75;
  hemi.diffuse = new Color3(0.85, 0.93, 1.0);
  hemi.groundColor = new Color3(0.62, 0.52, 0.38); // bounce light off the sand

  const sun = new DirectionalLight("sun", SUN_DIR, scene);
  sun.position = SUN_DIR.scale(-60);
  sun.intensity = 2.6;
  sun.diffuse = new Color3(1.0, 0.94, 0.82);
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 140;

  const shadows = new ShadowGenerator(shadowMapSize, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0015;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.35;

  const skyReflection = new ReflectionProbe("skyProbe", 128, scene);
  skyReflection.renderList!.push(sky);
  skyReflection.position = new Vector3(0, 2, 0);
  skyReflection.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

  return { sky, sun, shadows, skyReflection };
}
