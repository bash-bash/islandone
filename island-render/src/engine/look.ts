import {
  ColorCurves,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  SSAO2RenderingPipeline,
  type Camera,
  type Scene,
} from "@babylonjs/core";

/**
 * Post-processing for the bright, saturated look of the reference image (handoff §22):
 * neutral tone mapping that keeps colours saturated, a saturation/warmth curve,
 * subtle bloom on sunlit highlights and screen-space ambient occlusion for
 * contact shadows. AO is opt-in with `?ao=1` (it darkens the seafloor through the
 * transparent water and costs a lot on mobile), `?post=0` everything.
 */
export function setupLook(scene: Scene, camera: Camera) {
  const params = new URLSearchParams(location.search);
  if (params.get("post") === "0") return;

  const pipeline = new DefaultRenderingPipeline("look", true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = false;

  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = 1.0;
  ip.contrast = 1.12;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 0.8;
  ip.vignetteColor.set(0.1, 0.18, 0.25, 0);

  const curves = new ColorCurves();
  curves.globalSaturation = 18;
  curves.highlightsHue = 50; // warmth comes from the sun colour, kept neutral here
  curves.highlightsDensity = 0;
  curves.shadowsHue = 210; // cool, bluish shadows
  curves.shadowsDensity = 25;
  ip.colorCurvesEnabled = true;
  ip.colorCurves = curves;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.9;
  pipeline.bloomWeight = 0.2;
  pipeline.bloomKernel = 48;
  pipeline.bloomScale = 0.5;

  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.25;

  if (params.get("ao") === "1" && SSAO2RenderingPipeline.IsSupported) {
    const ao = new SSAO2RenderingPipeline("ao", scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera]);
    ao.radius = 1.2;
    ao.totalStrength = 1.1;
    ao.base = 0.15;
    ao.samples = 16;
    ao.maxZ = 120;
    ao.expensiveBlur = true;
  }
}
