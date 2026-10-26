// Water shader in GLSL (WebGL 2) and WGSL (WebGPU), same maths in both.
//
// The surface is drawn twice with the same geometry:
//   TINT pass  (multiply blend): scene behind × transmission  → clear water that turns cyan with depth
//   LIGHT pass (additive blend): in-scattered turquoise + sky reflection + sun glints + foam
// The water thickness per pixel comes from the scene depth (camera-space z) behind the surface,
// so underwater rocks near the surface stay visible and the shoreline fades out softly.
// Foam: a lace texture dissolved by a foam amount from a baked distance field
// (R = distance to shore, G = distance to rocks/posts, B = which way the rock edge faces).
// Rocks only foam when a swell crest reaches them: the swell rolls in from the sea (+X),
// hits the seaward side first, the foam spreads out and fades; between crests and in the
// lee there is none. Crests vary in strength, some barely foam at all.

export const WATER_UNIFORMS = [
  "world",
  "view",
  "viewProjection",
  "time",
  "camPos",
  "screenSize",
  "toSun",
  "sunColor",
  "zenithColor",
  "horizonColor",
  "fogColor",
  "fogDensity",
  "shallowColor",
  "deepColor",
  "absorb",
  "scatter",
  "foamRegion",
  "waveStrength",
];
export const WATER_SAMPLERS = ["depthTex", "normalA", "normalB", "laceTex", "foamField"];

const GLSL_SWASH = `
float swash(vec3 p, float t) {
  return 0.03 * sin(t * 0.7 + p.z * 0.13) + 0.016 * sin(t * 1.17 + p.z * 0.29 + 1.7) + 0.01;
}`;

export const GLSL_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 view;
uniform mat4 viewProjection;
uniform float time;
varying vec3 vWorld;
varying float vViewZ;
${GLSL_SWASH}
void main(void) {
  vec4 w = world * vec4(position, 1.0);
  w.y += swash(w.xyz, time);
  vWorld = w.xyz;
  vViewZ = (view * w).z;
  gl_Position = viewProjection * w;
}`;

export const GLSL_FRAGMENT = `
precision highp float;
varying vec3 vWorld;
varying float vViewZ;
uniform float time;
uniform vec3 camPos;
uniform vec2 screenSize;
uniform vec3 toSun;
uniform vec3 sunColor;
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform vec3 absorb;
uniform float scatter;
uniform vec4 foamRegion;
uniform float waveStrength;
uniform sampler2D depthTex;
uniform sampler2D normalA;
uniform sampler2D normalB;
uniform sampler2D laceTex;
uniform sampler2D foamField;

vec3 skyColor(vec3 d) {
  return mix(horizonColor, zenithColor, pow(clamp(d.y, 0.0, 1.0), 0.55));
}

void main(void) {
  vec2 xz = vWorld.xz;
  vec3 toCam = camPos - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // Ripples: three scrolling normal-map layers.
  vec3 nA = texture2D(normalA, xz * 0.09 + vec2(0.011, 0.006) * time).xyz * 2.0 - 1.0;
  vec3 nB = texture2D(normalB, xz * 0.21 + vec2(-0.008, 0.013) * time).xyz * 2.0 - 1.0;
  vec3 nC = texture2D(normalA, xz * 0.57 + vec2(0.019, -0.015) * time).xyz * 2.0 - 1.0;
  vec2 slope = (nA.xy * 0.5 + nB.xy * 0.35 + nC.xy * 0.3) * waveStrength;
  vec3 N = normalize(vec3(slope.x, 1.0, slope.y));

  // Water thickness along the view ray from the scene depth behind this pixel.
  vec2 suv = gl_FragCoord.xy / screenSize + slope * 0.004;
  float sceneZ = texture2D(depthTex, suv).r;
  float ratio = max(sceneZ / vViewZ, 1.0);
  // Mostly vertical depth: keeps the shallows glass-clear at flat viewing angles (stylised).
  float D = max(camPos.y - vWorld.y, 0.0) * (ratio - 1.0);
  float L = min(mix(D * 1.4, dist * (ratio - 1.0), 0.35), 80.0);

  // Foam amount from the baked distance field, dissolved through the lace texture.
  vec2 fuv = (xz - foamRegion.xy) * foamRegion.zw;
  vec4 field = texture2D(foamField, fuv);
  float dShore = field.r * 2.55;
  float dObj = field.g * 2.55;
  float lace1 = texture2D(laceTex, xz * 0.75 + vec2(0.010, 0.006) * time).r;
  float lace2 = texture2D(laceTex, xz * 1.45 + vec2(-0.007, 0.011) * time + 0.37).r;
  float lace = max(lace1, lace2 * 0.9);
  float faceX = field.b * 2.0 - 1.0;
  float ph = time / 7.0 + (xz.x - faceX * dObj) / 7.5;
  float age = fract(ph) * 7.0;
  float strength = smoothstep(0.1, 0.7, 0.5 + 0.5 * sin(floor(ph) * 2.39 + xz.y * 0.23));
  float spread = 0.15 + 1.3 * (1.0 - exp(-age / 1.3));
  float burst = (1.0 - smoothstep(spread - 0.35, spread, dObj)) * exp(-age / 2.0) * smoothstep(0.0, 0.3, age);
  float splash = exp(-dObj / 0.18) * exp(-age / 0.8) * 1.2 * smoothstep(0.0, 0.15, age);
  float fObj = (burst * 0.9 + splash) * strength * smoothstep(-0.6, 0.7, faceX);
  float cyc = fract(time * 0.085 + sin(xz.y * 0.09) * 0.25);
  float front = (1.0 - cyc) * 2.4;
  float bandD = dShore - front;
  float band = exp(-bandD * bandD / 0.012) * smoothstep(0.0, 0.2, cyc) * (0.35 + 0.65 * cyc);
  float trail = exp(-max(-bandD, 0.0) / 0.5) * step(bandD, 0.0) * 0.3 * cyc;
  float fShore = exp(-dShore / 0.22) * 0.9 + band * 0.8 + trail;
  // Thin water at a rock's foot only foams while a crest washes over it.
  float contact = exp(-L / 0.05) * 0.5 * mix(clamp(fObj * 2.0, 0.0, 1.0), 1.0, smoothstep(0.15, 0.6, dObj));
  float f = clamp(max(fObj, fShore) + contact, 0.0, 1.0);
  float foam = smoothstep(1.0 - f, 1.0 - f + 0.2, lace) * smoothstep(0.0, 0.08, f);

  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float fogF = 1.0 - exp(-pow(dist * fogDensity, 2.0));

#ifdef TINT
  vec3 T = exp(-absorb * L) * (1.0 - fres) * (1.0 - foam) * (1.0 - fogF);
  gl_FragColor = vec4(T, 1.0);
#else
  vec3 inscatter = mix(shallowColor, deepColor, 1.0 - exp(-L / 3.0)) * (1.0 - exp(-L * scatter));
  vec3 R = reflect(-V, N);
  vec3 H = normalize(toSun + V);
  float ridge = length(nC.xy * 0.6 + nB.xy * 0.4);
  float sparkle = smoothstep(0.3, 0.6, ridge) * smoothstep(0.55, 0.9, lace2) * 2.5;
  float glint = pow(max(dot(N, H), 0.0), 1400.0) * 14.0 + pow(max(dot(R, toSun), 0.0), 300.0) * 6.0 + sparkle;
  vec3 col = inscatter * (1.0 - fres) * (1.0 - foam)
           + skyColor(R) * fres * 0.65 * (1.0 - foam)
           + sunColor * glint * (1.0 - foam) * smoothstep(0.03, 0.3, L)
           + vec3(1.0, 1.04, 1.06) * foam * 0.9;
  col = col * (1.0 - fogF) + fogColor * fogF;
  gl_FragColor = vec4(col, 1.0);
#endif
}`;

const WGSL_SWASH = `
fn swash(p: vec3f, t: f32) -> f32 {
  return 0.03 * sin(t * 0.7 + p.z * 0.13) + 0.016 * sin(t * 1.17 + p.z * 0.29 + 1.7) + 0.01;
}`;

export const WGSL_VERTEX = `
attribute position: vec3f;
uniform world: mat4x4f;
uniform view: mat4x4f;
uniform viewProjection: mat4x4f;
uniform time: f32;
varying vWorld: vec3f;
varying vViewZ: f32;
${WGSL_SWASH}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var w = uniforms.world * vec4f(vertexInputs.position, 1.0);
  w.y += swash(w.xyz, uniforms.time);
  vertexOutputs.vWorld = w.xyz;
  vertexOutputs.vViewZ = (uniforms.view * w).z;
  vertexOutputs.position = uniforms.viewProjection * w;
}`;

export const WGSL_FRAGMENT = `
varying vWorld: vec3f;
varying vViewZ: f32;
uniform time: f32;
uniform camPos: vec3f;
uniform screenSize: vec2f;
uniform toSun: vec3f;
uniform sunColor: vec3f;
uniform zenithColor: vec3f;
uniform horizonColor: vec3f;
uniform fogColor: vec3f;
uniform fogDensity: f32;
uniform shallowColor: vec3f;
uniform deepColor: vec3f;
uniform absorb: vec3f;
uniform scatter: f32;
uniform foamRegion: vec4f;
uniform waveStrength: f32;
var depthTexSampler: sampler;
var depthTex: texture_2d<f32>;
var normalASampler: sampler;
var normalA: texture_2d<f32>;
var normalBSampler: sampler;
var normalB: texture_2d<f32>;
var laceTexSampler: sampler;
var laceTex: texture_2d<f32>;
var foamFieldSampler: sampler;
var foamField: texture_2d<f32>;

fn skyColor(d: vec3f) -> vec3f {
  return mix(uniforms.horizonColor, uniforms.zenithColor, pow(clamp(d.y, 0.0, 1.0), 0.55));
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let t = uniforms.time;
  let xz = fragmentInputs.vWorld.xz;
  let toCam = uniforms.camPos - fragmentInputs.vWorld;
  let dist = length(toCam);
  let V = toCam / dist;

  let nA = textureSample(normalA, normalASampler, xz * 0.09 + vec2f(0.011, 0.006) * t).xyz * 2.0 - 1.0;
  let nB = textureSample(normalB, normalBSampler, xz * 0.21 + vec2f(-0.008, 0.013) * t).xyz * 2.0 - 1.0;
  let nC = textureSample(normalA, normalASampler, xz * 0.57 + vec2f(0.019, -0.015) * t).xyz * 2.0 - 1.0;
  let slope = (nA.xy * 0.5 + nB.xy * 0.35 + nC.xy * 0.3) * uniforms.waveStrength;
  let N = normalize(vec3f(slope.x, 1.0, slope.y));

  let suv = fragmentInputs.position.xy / uniforms.screenSize + slope * 0.004;
  let sceneZ = textureSampleLevel(depthTex, depthTexSampler, suv, 0.0).r;
  let ratio = max(sceneZ / fragmentInputs.vViewZ, 1.0);
  let D = max(uniforms.camPos.y - fragmentInputs.vWorld.y, 0.0) * (ratio - 1.0);
  let L = min(mix(D * 1.4, dist * (ratio - 1.0), 0.35), 80.0);

  let fuv = (xz - uniforms.foamRegion.xy) * uniforms.foamRegion.zw;
  let field = textureSample(foamField, foamFieldSampler, fuv);
  let dShore = field.r * 2.55;
  let dObj = field.g * 2.55;
  let lace1 = textureSample(laceTex, laceTexSampler, xz * 0.75 + vec2f(0.010, 0.006) * t).r;
  let lace2 = textureSample(laceTex, laceTexSampler, xz * 1.45 + vec2f(-0.007, 0.011) * t + 0.37).r;
  let lace = max(lace1, lace2 * 0.9);
  let faceX = field.b * 2.0 - 1.0;
  let ph = t / 7.0 + (xz.x - faceX * dObj) / 7.5;
  let age = fract(ph) * 7.0;
  let strength = smoothstep(0.1, 0.7, 0.5 + 0.5 * sin(floor(ph) * 2.39 + xz.y * 0.23));
  let spread = 0.15 + 1.3 * (1.0 - exp(-age / 1.3));
  let burst = (1.0 - smoothstep(spread - 0.35, spread, dObj)) * exp(-age / 2.0) * smoothstep(0.0, 0.3, age);
  let splash = exp(-dObj / 0.18) * exp(-age / 0.8) * 1.2 * smoothstep(0.0, 0.15, age);
  let fObj = (burst * 0.9 + splash) * strength * smoothstep(-0.6, 0.7, faceX);
  let cyc = fract(t * 0.085 + sin(xz.y * 0.09) * 0.25);
  let front = (1.0 - cyc) * 2.4;
  let bandD = dShore - front;
  let band = exp(-bandD * bandD / 0.012) * smoothstep(0.0, 0.2, cyc) * (0.35 + 0.65 * cyc);
  let trail = exp(-max(-bandD, 0.0) / 0.5) * step(bandD, 0.0) * 0.3 * cyc;
  let fShore = exp(-dShore / 0.22) * 0.9 + band * 0.8 + trail;
  let contact = exp(-L / 0.05) * 0.5 * mix(clamp(fObj * 2.0, 0.0, 1.0), 1.0, smoothstep(0.15, 0.6, dObj));
  let f = clamp(max(fObj, fShore) + contact, 0.0, 1.0);
  let foam = smoothstep(1.0 - f, 1.0 - f + 0.2, lace) * smoothstep(0.0, 0.08, f);

  let fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  let fogF = 1.0 - exp(-pow(dist * uniforms.fogDensity, 2.0));

#ifdef TINT
  let T = exp(-uniforms.absorb * L) * (1.0 - fres) * (1.0 - foam) * (1.0 - fogF);
  fragmentOutputs.color = vec4f(T, 1.0);
#else
  let inscatter = mix(uniforms.shallowColor, uniforms.deepColor, 1.0 - exp(-L / 3.0)) * (1.0 - exp(-L * uniforms.scatter));
  let R = reflect(-V, N);
  let H = normalize(uniforms.toSun + V);
  let ridge = length(nC.xy * 0.6 + nB.xy * 0.4);
  let sparkle = smoothstep(0.3, 0.6, ridge) * smoothstep(0.55, 0.9, lace2) * 2.5;
  let glint = pow(max(dot(N, H), 0.0), 1400.0) * 14.0 + pow(max(dot(R, uniforms.toSun), 0.0), 300.0) * 6.0 + sparkle;
  var col = inscatter * (1.0 - fres) * (1.0 - foam)
          + skyColor(R) * fres * 0.65 * (1.0 - foam)
          + uniforms.sunColor * glint * (1.0 - foam) * smoothstep(0.03, 0.3, L)
          + vec3f(1.0, 1.04, 1.06) * foam * 0.9;
  col = col * (1.0 - fogF) + uniforms.fogColor * fogF;
  fragmentOutputs.color = vec4f(col, 1.0);
#endif
}`;
