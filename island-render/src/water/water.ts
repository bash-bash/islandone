import {
  Color3,
  Color4,
  Constants,
  Mesh,
  RawTexture,
  ShaderLanguage,
  ShaderMaterial,
  ShaderStore,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  VertexData,
  type Camera,
  type Scene,
  type BaseTexture,
} from "@babylonjs/core";
import { createLaceTexture, createWaterNormalTexture } from "../world/textures";
import { WATER_LEVEL } from "../world/terrain";
import { GLSL_FRAGMENT, GLSL_VERTEX, WATER_SAMPLERS, WATER_UNIFORMS, WGSL_FRAGMENT, WGSL_VERTEX } from "./waterShader";

// Water look (handoff §19, reference image "Tropisches Inselcamp am Strand"):
// glass-clear turquoise water that shows the sand, rocks and caustics underneath,
// deepening to teal-blue; lace foam along the shore and around rocks and posts;
// small sun glints on the ripples. See waterShader.ts for how it is drawn.
// Colours are linear (the post-process pipeline works in linear space).

export const WATER_LOOK = {
  shallowColor: new Color3(0.0, 0.3, 0.58), // in-scattered light in shallow water
  deepColor: new Color3(0.0, 0.11, 0.28), // asymptotic colour of deep water
  absorb: new Vector3(1.7, 0.78, 0.42), // per metre: red goes first, the water turns cyan
  scatter: 0.8,
  waveStrength: 0.55,
};

export interface WaterOptions {
  camera: Camera;
  sunDirection: Vector3;
  sunColor: Color3;
  zenith: Color3;
  horizon: Color3;
}

/** Grid axis: 1 m steps around the beach (the swash needs vertices), coarse towards the horizon. */
function axis(): number[] {
  const out = [-500, -300, -180, -110, -75, -55];
  for (let v = -45; v <= 45; v += 1) out.push(v);
  out.push(55, 75, 110, 180, 300, 500);
  return out;
}

export interface Water {
  mesh: Mesh;
  update(timeSeconds: number): void;
  setFoamField(field: { texture: BaseTexture; region: Vector4 }): void;
}

export function createWater(scene: Scene, o: WaterOptions): Water {
  const xs = axis();
  const n = xs.length;
  const positions = new Float32Array(n * n * 3);
  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions.set([xs[i], WATER_LEVEL, xs[j]], (j * n + i) * 3);
      if (i < n - 1 && j < n - 1) {
        const v = j * n + i;
        indices.push(v, v + n, v + 1, v + 1, v + n, v + n + 1);
      }
    }
  }
  const mesh = new Mesh("water", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true; // the swash moves it a few cm above its bounds

  // Scene depth behind the water, as camera-space z (half float is enough at this scale).
  const depthRenderer = scene.enableDepthRenderer(o.camera, false, false, Texture.NEAREST_SAMPLINGMODE, true);
  depthRenderer.clearColor = new Color4(1e4, 0, 0, 1);
  const depthMap = depthRenderer.getDepthMap();

  const webgpu = scene.getEngine().isWebGPU;
  ShaderStore.ShadersStore["ioWaterVertexShader"] = GLSL_VERTEX;
  ShaderStore.ShadersStore["ioWaterFragmentShader"] = GLSL_FRAGMENT;
  ShaderStore.ShadersStoreWGSL["ioWaterVertexShader"] = WGSL_VERTEX;
  ShaderStore.ShadersStoreWGSL["ioWaterFragmentShader"] = WGSL_FRAGMENT;

  const normalA = createWaterNormalTexture(scene, 1);
  const normalB = createWaterNormalTexture(scene, 2);
  const lace = createLaceTexture(scene);
  // Until the beach is built: no foam field (everything "far away").
  let foamField: BaseTexture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 0, 255]), 1, 1, scene);
  let foamRegion = new Vector4(0, 0, 1, 1);

  const makeMaterial = (name: string, tint: boolean) => {
    const mat = new ShaderMaterial(
      name,
      scene,
      { vertex: "ioWater", fragment: "ioWater" },
      {
        attributes: ["position"],
        uniforms: WATER_UNIFORMS,
        samplers: WATER_SAMPLERS,
        defines: tint ? ["#define TINT"] : [],
        needAlphaBlending: true,
        shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      },
    );
    mat.alphaMode = tint ? Constants.ALPHA_MULTIPLY : Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.setTexture("depthTex", depthMap);
    mat.setTexture("normalA", normalA);
    mat.setTexture("normalB", normalB);
    mat.setTexture("laceTex", lace);
    return mat;
  };
  const tintMat = makeMaterial("IO_MAT_Water_Tint", true);
  const lightMat = makeMaterial("IO_MAT_Water", false);

  // Same geometry twice: multiply first, then add light.
  const tintMesh = mesh.clone("waterTint");
  tintMesh.material = tintMat;
  tintMesh.alphaIndex = 9;
  tintMesh.isPickable = false;
  tintMesh.alwaysSelectAsActiveMesh = true;
  mesh.material = lightMat;
  mesh.alphaIndex = 10;
  depthRenderer.getDepthMap().renderList = null; // all opaque meshes; transparent ones are skipped anyway

  const toSun = o.sunDirection.negate().normalize();
  const screen = new Vector2();
  return {
    mesh,
    setFoamField(field) {
      foamField = field.texture;
      foamRegion = field.region;
    },
    update(t: number) {
      const engine = scene.getEngine();
      screen.set(engine.getRenderWidth(), engine.getRenderHeight());
      const cam = scene.activeCamera ?? o.camera;
      for (const mat of [tintMat, lightMat]) {
        mat.setFloat("time", t);
        mat.setVector3("camPos", cam.globalPosition);
        mat.setVector2("screenSize", screen);
        mat.setVector3("toSun", toSun);
        mat.setColor3("sunColor", o.sunColor);
        mat.setColor3("zenithColor", o.zenith);
        mat.setColor3("horizonColor", o.horizon);
        mat.setColor3("fogColor", scene.fogColor);
        mat.setFloat("fogDensity", scene.fogMode === 0 ? 0 : scene.fogDensity);
        mat.setColor3("shallowColor", WATER_LOOK.shallowColor);
        mat.setColor3("deepColor", WATER_LOOK.deepColor);
        mat.setVector3("absorb", WATER_LOOK.absorb);
        mat.setFloat("scatter", WATER_LOOK.scatter);
        mat.setFloat("waveStrength", WATER_LOOK.waveStrength);
        mat.setVector4("foamRegion", foamRegion);
        mat.setTexture("foamField", foamField);
      }
    },
  };
}
