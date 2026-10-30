import {
  MaterialPluginBase,
  ShaderLanguage,
  type Material,
  type MaterialDefines,
  type UniformBuffer,
} from "@babylonjs/core";

/**
 * Swim and flop for IO_Fish_A (fish/README.md in the asset folder, "Schwimmen").
 * Wired up through ASSETS (`swim: true`) in assets.ts.
 *
 * No bones: every vertex is pushed sideways (local X) by a wave that travels from head to tail.
 * The weight is the vertex's place along the fish, R = 0 at the snout .. 1 at the tail tip.
 * The GLB carries R in COLOR_0.r / TEXCOORD_1.x, but it equals the normalised local position
 * (glTF +Z = head), so the shader computes it from the position and needs no extra attribute.
 * Set mesh.useVertexColors = false so COLOR_0 (data, not colour) is not multiplied into the albedo.
 *
 * The phase comes from the instance's world position, so thin instances of one school swim
 * out of step. Works in GLSL (WebGL 2) and WGSL (WebGPU). Shadows keep the rest pose.
 */

/** Shared clock for all fish. */
export const fishState = { time: 0 };

export interface FishSwimSettings {
  /** 0 = swim (school), 1 = flop (caught fish lying on its side). */
  mode: 0 | 1;
  /** Swim: sideways amplitude at the tail in metres (0.016). */
  amplitude: number;
  /** Swim: tail beats per second (2.2 cruising, 4.5 darting). */
  frequency: number;
  /** Swim: waves along the body (0.85). */
  waves: number;
  /** Flop: lift of head and tail in metres (0.035). */
  flopAmplitude: number;
  /** Flop: flops per second (1.6). */
  flopFrequency: number;
  /** Flop: 1 right after the catch, fade to 0 over ~20 s, then the fish lies still. */
  flopStrength: number;
}

export const FISH_SWIM_DEFAULTS: FishSwimSettings = {
  mode: 0,
  amplitude: 0.016,
  frequency: 2.2,
  waves: 0.85,
  flopAmplitude: 0.035,
  flopFrequency: 1.6,
  flopStrength: 1,
};

/** IO_Fish_A: snout at glTF z = +0.15, tail tip at -0.15. */
const HEAD_Z = 0.15;
const LENGTH = 0.3;

class FishSwimPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    readonly settings: FishSwimSettings,
  ) {
    super(material, "IslandFishSwim", 211, { ISLAND_FISH: false });
    this._enable(true);
  }

  override getClassName() {
    return "FishSwimPlugin";
  }

  override isCompatible(lang: ShaderLanguage) {
    return lang === ShaderLanguage.GLSL || lang === ShaderLanguage.WGSL;
  }

  override prepareDefines(defines: MaterialDefines) {
    defines.ISLAND_FISH = true;
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "fishA", size: 4, type: "vec4" },
        { name: "fishB", size: 4, type: "vec4" },
        { name: "fishC", size: 4, type: "vec4" },
      ],
      vertex: `#ifdef ISLAND_FISH
uniform vec4 fishA;
uniform vec4 fishB;
uniform vec4 fishC;
#endif`,
    };
  }

  override bindForSubMesh(ubo: UniformBuffer) {
    const s = this.settings;
    ubo.updateFloat4("fishA", fishState.time, s.amplitude, s.waves, s.frequency);
    ubo.updateFloat4("fishB", s.mode, s.flopAmplitude, s.flopFrequency, s.flopStrength);
    ubo.updateFloat4("fishC", HEAD_Z, 1 / LENGTH, 0, 0);
  }

  override getCustomCode(shaderType: string, lang?: ShaderLanguage) {
    if (shaderType !== "vertex") return null;
    if (lang === ShaderLanguage.WGSL) {
      return {
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef ISLAND_FISH
{
  let fA = uniforms.fishA;
  let fB = uniforms.fishB;
  let fC = uniforms.fishC;
  let r = clamp((fC.x - positionUpdated.z) * fC.y, 0.0, 1.0);
  let phase = dot(finalWorld[3].xyz, vec3f(1.7, 0.0, 2.3));
  let swim = fA.y * (0.12 + 0.88 * r * r) * sin(6.2831853 * (fA.w * fA.x - fA.z * r) + phase);
  let e = (r - 0.45) / 0.55;
  let flop = fB.y * e * e * max(0.0, sin(6.2831853 * fB.z * fA.x + phase)) * fB.w;
  let off = mix(swim, flop, fB.x);
  worldPos = vec4f(worldPos.xyz + finalWorld[0].xyz * off, worldPos.w);
  vertexOutputs.vPositionW = worldPos.xyz;
}
#endif
`,
      };
    }
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef ISLAND_FISH
{
  float r = clamp((fishC.x - positionUpdated.z) * fishC.y, 0.0, 1.0);
  float phase = dot(finalWorld[3].xyz, vec3(1.7, 0.0, 2.3));
  float swim = fishA.y * (0.12 + 0.88 * r * r) * sin(6.2831853 * (fishA.w * fishA.x - fishA.z * r) + phase);
  float e = (r - 0.45) / 0.55;
  float flop = fishB.y * e * e * max(0.0, sin(6.2831853 * fishB.z * fishA.x + phase)) * fishB.w;
  float off = mix(swim, flop, fishB.x);
  worldPos.xyz += finalWorld[0].xyz * off;
  vPositionW = worldPos.xyz;
}
#endif
`,
    };
  }
}

/**
 * Adds the swim wave to a fish material. Use one material for the whole school (thin instances),
 * and a clone with mode 1 for a caught fish (and a tinted clone for a cooked one, see the README).
 * Returns the live settings object: change mode / flopStrength on it at runtime.
 */
export function addFishSwim(material: Material, settings: Partial<FishSwimSettings> = {}): FishSwimSettings {
  const existing = material.pluginManager?.getPlugin("IslandFishSwim") as FishSwimPlugin | null | undefined;
  if (existing) return Object.assign(existing.settings, settings);
  const s = { ...FISH_SWIM_DEFAULTS, ...settings };
  new FishSwimPlugin(material, s);
  return s;
}
