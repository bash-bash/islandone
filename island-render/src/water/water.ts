import {
  Color3,
  Mesh,
  PBRMaterial,
  VertexBuffer,
  VertexData,
  type BaseTexture,
  type Scene,
} from "@babylonjs/core";
import { noise2 } from "../world/noise";
import { createWaterNormalTexture } from "../world/textures";
import { WATER_LEVEL, waterDepth } from "../world/terrain";

// First water pass (handoff §19), kept engine-agnostic so it runs on WebGPU and WebGL 2:
// - depth colour and transparency baked into vertex colours from the terrain height
// - two normal maps scrolling in different directions (bump + clear-coat bump)
// - Fresnel reflection of the sky capture
// - shoreline foam band moving in and out, updated on the CPU for shallow vertices only
// Caustics live in caustics.ts. Refraction and a proper shader come with the water step later.

// Linear colours: the post-process pipeline blends in linear space, so these look
// much lighter on screen than their numbers suggest.
const SHALLOW = new Color3(0.03, 0.62, 0.55);
const MID = new Color3(0.0, 0.3, 0.42);
const DEEP = new Color3(0.0, 0.08, 0.24);
const FOAM = new Color3(0.97, 0.99, 1.0);

/** Grid axis coordinates: 0.5 m steps around the beach, coarser towards the horizon. */
function axis(): number[] {
  const out = [-500, -300, -180, -110, -75, -55];
  for (let v = -45; v <= 45; v += 0.5) out.push(v);
  out.push(55, 75, 110, 180, 300, 500);
  return out;
}

function depthColor(depth: number, out: { r: number; g: number; b: number; a: number }) {
  const d = Math.max(0, depth);
  if (d < 1.2) {
    const t = d / 1.2;
    out.r = SHALLOW.r + (MID.r - SHALLOW.r) * t;
    out.g = SHALLOW.g + (MID.g - SHALLOW.g) * t;
    out.b = SHALLOW.b + (MID.b - SHALLOW.b) * t;
  } else {
    const t = Math.min(1, (d - 1.2) / 3.5);
    out.r = MID.r + (DEEP.r - MID.r) * t;
    out.g = MID.g + (DEEP.g - MID.g) * t;
    out.b = MID.b + (DEEP.b - MID.b) * t;
  }
  // Shallow water is clear enough to show the sand, deep water is nearly opaque.
  out.a = Math.min(0.96, 0.42 + d * 0.36);
}

export interface Water {
  mesh: Mesh;
  update(timeSeconds: number): void;
}

export function createWater(scene: Scene, reflection: BaseTexture): Water {
  const xs = axis();
  const n = xs.length;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 4);
  const uvs = new Float32Array(n * n * 2);
  const indices: number[] = [];
  const baseColors = new Float32Array(n * n * 4);
  const shoreVerts: number[] = [];
  const shoreDepth: number[] = [];
  const shorePhase: number[] = [];
  const col = { r: 0, g: 0, b: 0, a: 0 };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i;
      const x = xs[i];
      const z = xs[j];
      positions.set([x, WATER_LEVEL, z], v * 3);
      uvs.set([x / 12, z / 12], v * 2);
      const depth = waterDepth(x, z);
      depthColor(depth, col);
      baseColors.set([col.r, col.g, col.b, col.a], v * 4);
      if (depth > -0.25 && depth < 0.8) {
        shoreVerts.push(v);
        shoreDepth.push(depth);
        shorePhase.push(noise2(x * 0.15, z * 0.15, 77) * 2.5 + z * 0.05);
      }
      if (i < n - 1 && j < n - 1) {
        indices.push(v, v + n, v + 1, v + 1, v + n, v + n + 1);
      }
    }
  }
  colors.set(baseColors);

  const mesh = new Mesh("water", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.uvs = uvs;
  vd.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh, true);
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.alphaIndex = 10;

  const mat = new PBRMaterial("IO_MAT_Water", scene);
  mat.albedoColor = Color3.White();
  mat.metallic = 0;
  mat.roughness = 0.08;
  mat.reflectionTexture = reflection;
  mat.environmentIntensity = 0.7;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.backFaceCulling = false;
  mat.forceDepthWrite = false;

  const normalA = createWaterNormalTexture(scene, 1);
  normalA.level = 0.45;
  mat.bumpTexture = normalA;
  mat.clearCoat.isEnabled = true;
  mat.clearCoat.intensity = 0.6;
  mat.clearCoat.roughness = 0.04;
  const normalB = createWaterNormalTexture(scene, 2);
  normalB.uScale = 0.6;
  normalB.vScale = 0.6;
  mat.clearCoat.bumpTexture = normalB;
  mesh.material = mat;

  return {
    mesh,
    update(t: number) {
      normalA.uOffset = t * 0.012;
      normalA.vOffset = t * 0.007;
      normalB.uOffset = -t * 0.006;
      normalB.vOffset = t * 0.011;

      // Wave front: swash runs from 0.7 m depth up onto the sand, breaks, fades, retreats.
      for (let k = 0; k < shoreVerts.length; k++) {
        const v = shoreVerts[k];
        const cycle = (t * 0.16 + shorePhase[k]) % 1;
        const front = 0.7 - cycle * 0.95;
        const fade = cycle < 0.75 ? 1 : 1 - (cycle - 0.75) / 0.25;
        const dist = shoreDepth[k] - front;
        const band = Math.exp(-(dist * dist) / 0.006) * fade;
        const trail = dist < 0 && dist > -0.3 ? (1 + dist / 0.3) * 0.35 * fade : 0;
        const foam = Math.min(1, band + trail);

        const o = v * 4;
        const onSand = shoreDepth[k] < 0.02;
        const baseA = onSand ? 0 : baseColors[o + 3];
        colors[o] = baseColors[o] + (FOAM.r - baseColors[o]) * foam;
        colors[o + 1] = baseColors[o + 1] + (FOAM.g - baseColors[o + 1]) * foam;
        colors[o + 2] = baseColors[o + 2] + (FOAM.b - baseColors[o + 2]) * foam;
        // Water creeps onto the sand behind the wave front.
        const wet = onSand && shoreDepth[k] > front ? 0.35 * fade : 0;
        colors[o + 3] = Math.min(1, Math.max(baseA, wet) + foam * 0.85);
      }
      mesh.updateVerticesData(VertexBuffer.ColorKind, colors);
    },
  };
}
