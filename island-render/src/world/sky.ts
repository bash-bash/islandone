import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  Mesh,
  VertexData,
} from "@babylonjs/core";
import { createCloudTexture } from "./textures";

export const ZENITH = new Color3(0.16, 0.5, 0.96);
export const HORIZON = new Color3(0.68, 0.87, 1.0);
const SUN_DIR = new Vector3(-0.7, -0.85, 0.5).normalize(); // ~40° high: soft relief and longer shadows like the reference

export interface SkyAndLight {
  sky: Mesh;
  clouds: Mesh;
  sun: DirectionalLight;
  shadows: ShadowGenerator;
}

/**
 * Daytime only (handoff §21): gradient sky dome, one sun with soft shadows,
 * hemispheric fill light, light haze towards the horizon.
 */
export function createSkyAndLight(scene: Scene, shadowMapSize = 2048, shadowFilter = ShadowGenerator.QUALITY_MEDIUM): SkyAndLight {
  scene.clearColor = new Color4(HORIZON.r, HORIZON.g, HORIZON.b, 1);
  scene.ambientColor = new Color3(0.25, 0.25, 0.25);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0028;
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

  const clouds = createClouds(scene);

  const hemi = new HemisphericLight("skyFill", new Vector3(0.2, 1, -0.1), scene);
  hemi.intensity = 0.95;
  hemi.diffuse = new Color3(0.78, 0.9, 1.0);
  hemi.groundColor = new Color3(0.8, 0.72, 0.6); // bounce light off the sand

  const sun = new DirectionalLight("sun", SUN_DIR, scene);
  sun.position = SUN_DIR.scale(-60);
  sun.intensity = 3.3;
  sun.diffuse = new Color3(1.0, 0.96, 0.88);
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 140;

  const shadows = new ShadowGenerator(shadowMapSize, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = shadowFilter;
  shadows.bias = 0.0015;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.3;

  return { sky, clouds, sun, shadows };
}

/** Ring of cumulus clouds from the horizon up to ~45°, drifting slowly. */
function createClouds(scene: Scene): Mesh {
  const radius = 470;
  const cols = 64;
  const rows = 10;
  const maxElev = (45 * Math.PI) / 180;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const e = v * maxElev - 0.02; // start just below the horizon line
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const a = u * Math.PI * 2;
      positions.push(Math.cos(a) * Math.cos(e) * radius, Math.sin(e) * radius, Math.sin(a) * Math.cos(e) * radius);
      uvs.push(u, 1 - v); // DynamicTexture rows arrive flipped
      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        indices.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
      }
    }
  }
  const mesh = new Mesh("clouds", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  const tex = createCloudTexture(scene);
  const mat = new StandardMaterial("cloudsMat", scene);
  mat.disableLighting = true;
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  mat.disableDepthWrite = true;
  mesh.material = mat;
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  mesh.alphaIndex = 0;
  scene.onBeforeRenderObservable.add(() => {
    tex.uOffset += scene.getEngine().getDeltaTime() * 0.0000012;
  });
  return mesh;
}
