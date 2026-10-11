import {
  MaterialPluginBase,
  ShaderLanguage,
  type Material,
  type MaterialDefines,
  type UniformBuffer,
} from "@babylonjs/core";

/** Shared wind state: one clock and direction for all plants. */
export const windState = { time: 0, dirX: 0.8, dirZ: -0.6 };

export interface WindSettings {
  /** Height of the plant in metres; sway grows towards this height. */
  height: number;
  /** Sway at the top in metres. */
  sway: number;
  /** Leaf flutter in metres, per vertex. */
  flutter: number;
  /** Main sway speed (rad/s). */
  speed: number;
}

/**
 * Vertex wind for plants on PBR materials (handoff §19 / asset list "wind-animation friendly").
 * Bends each vertex along the wind by (height above the object origin / plant height)²,
 * with a slow sway, a gust term and a fast per-vertex flutter for leaves.
 * The phase comes from the instance's world position, so neighbouring thin instances
 * move out of step. Works in GLSL (WebGL 2) and WGSL (WebGPU).
 * The shadow map keeps the rest pose; at these amplitudes that is not noticeable.
 */
class WindPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private settings: WindSettings,
  ) {
    super(material, "IslandWind", 210, { ISLAND_WIND: false });
    this._enable(true);
  }

  override getClassName() {
    return "WindPlugin";
  }

  override isCompatible(lang: ShaderLanguage) {
    return lang === ShaderLanguage.GLSL || lang === ShaderLanguage.WGSL;
  }

  override prepareDefines(defines: MaterialDefines) {
    defines.ISLAND_WIND = true;
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "windA", size: 4, type: "vec4" },
        { name: "windB", size: 4, type: "vec4" },
      ],
      vertex: `#ifdef ISLAND_WIND
uniform vec4 windA;
uniform vec4 windB;
#endif`,
    };
  }

  override bindForSubMesh(ubo: UniformBuffer) {
    const s = this.settings;
    ubo.updateFloat4("windA", windState.time, 1 / s.height, s.sway, s.flutter);
    ubo.updateFloat4("windB", windState.dirX, windState.dirZ, s.speed, 0);
  }

  override getCustomCode(shaderType: string, lang?: ShaderLanguage) {
    if (shaderType !== "vertex") return null;
    if (lang === ShaderLanguage.WGSL) {
      return {
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef ISLAND_WIND
{
  let wA = uniforms.windA;
  let wB = uniforms.windB;
  let origin = finalWorld[3].xyz;
  let h = clamp(positionUpdated.y * wA.y, 0.0, 1.5);
  let k = h * h;
  let phase = dot(origin.xz, vec2f(0.37, 0.23));
  let sway = sin(wA.x * wB.z + phase) * 0.6 + sin(wA.x * wB.z * 0.43 + phase * 1.7) * 0.4 + 0.35;
  let flutter = sin(wA.x * 7.0 + dot(worldPos.xyz, vec3f(2.3, 1.7, 2.9))) * wA.w;
  let bend = (sway * wA.z + flutter) * k;
  worldPos = vec4f(worldPos.x + wB.x * bend, worldPos.y - abs(bend) * 0.15 * k + flutter * 0.4 * k, worldPos.z + wB.y * bend, worldPos.w);
  vertexOutputs.vPositionW = worldPos.xyz;
}
#endif
`,
      };
    }
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef ISLAND_WIND
{
  vec3 origin = finalWorld[3].xyz;
  float h = clamp(positionUpdated.y * windA.y, 0.0, 1.5);
  float k = h * h;
  float phase = dot(origin.xz, vec2(0.37, 0.23));
  float sway = sin(windA.x * windB.z + phase) * 0.6 + sin(windA.x * windB.z * 0.43 + phase * 1.7) * 0.4 + 0.35;
  float flutter = sin(windA.x * 7.0 + dot(worldPos.xyz, vec3(2.3, 1.7, 2.9))) * windA.w;
  float bend = (sway * windA.z + flutter) * k;
  worldPos.xz += vec2(windB.x, windB.y) * bend;
  worldPos.y += -abs(bend) * 0.15 * k + flutter * 0.4 * k;
  vPositionW = worldPos.xyz;
}
#endif
`,
    };
  }
}

export function addWind(material: Material, settings: WindSettings) {
  if (material.pluginManager?.getPlugin("IslandWind")) return;
  new WindPlugin(material, settings);
}
