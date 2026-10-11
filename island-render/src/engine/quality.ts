import { ShadowGenerator } from "@babylonjs/core";

// Quality profiles LOW / MEDIUM / HIGH (handoff §24). One profile is picked at start:
// ?quality=low|medium|high, else the viewer's last choice from the settings panel, else a guess
// from the device (touch devices start on MEDIUM). Switching reloads the page, because shadow map
// size and post-processing are set up once.

export type QualityLevel = "low" | "medium" | "high";

export interface QualityProfile {
  level: QualityLevel;
  /** Upper bound for the device pixel ratio the canvas renders at. */
  maxPixelRatio: number;
  /** Extra factor on the render resolution (below 1 renders smaller and upscales). */
  renderScale: number;
  shadowMapSize: number;
  shadowFilter: number;
  msaaSamples: number;
  bloom: boolean;
  sharpen: boolean;
  /** Animated light patterns on the seafloor. */
  caustics: boolean;
  /** Share of bushes, ferns and grass placed (1 = all). */
  vegetationDensity: number;
  /** Multiplies every LOD switch distance: smaller switches to coarser meshes sooner. */
  lodScale: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    level: "low",
    maxPixelRatio: 1,
    renderScale: 0.75,
    shadowMapSize: 1024,
    shadowFilter: ShadowGenerator.QUALITY_LOW,
    msaaSamples: 1,
    bloom: false,
    sharpen: false,
    caustics: false,
    vegetationDensity: 0.5,
    lodScale: 0.6,
  },
  medium: {
    level: "medium",
    maxPixelRatio: 1.5,
    renderScale: 1,
    shadowMapSize: 2048,
    shadowFilter: ShadowGenerator.QUALITY_LOW,
    msaaSamples: 2,
    bloom: true,
    sharpen: false,
    caustics: true,
    vegetationDensity: 0.75,
    lodScale: 0.8,
  },
  high: {
    level: "high",
    maxPixelRatio: 2,
    renderScale: 1,
    shadowMapSize: 2048,
    shadowFilter: ShadowGenerator.QUALITY_MEDIUM,
    msaaSamples: 4,
    bloom: true,
    sharpen: true,
    caustics: true,
    vegetationDensity: 1,
    lodScale: 1,
  },
};

const STORAGE_KEY = "islandone.quality";
const isLevel = (v: unknown): v is QualityLevel => v === "low" || v === "medium" || v === "high";

export function pickQuality(): QualityProfile {
  const fromUrl = new URLSearchParams(location.search).get("quality");
  if (isLevel(fromUrl)) return QUALITY_PROFILES[fromUrl];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLevel(saved)) return QUALITY_PROFILES[saved];
  } catch {
    // storage blocked: fall through to the device guess
  }
  const touch = matchMedia("(pointer: coarse)").matches;
  return QUALITY_PROFILES[touch ? "medium" : "high"];
}

/** Remembers the choice and reloads with it (an explicit ?quality= in the URL is replaced). */
export function switchQuality(level: QualityLevel) {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // without storage the URL parameter below still carries it
  }
  const url = new URL(location.href);
  url.searchParams.set("quality", level);
  location.replace(url);
}

/** Hardware scaling level for the engine: 1 / (capped pixel ratio × render scale). */
export function hardwareScaling(profile: QualityProfile): number {
  const ratio = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio) * profile.renderScale;
  return 1 / ratio;
}
