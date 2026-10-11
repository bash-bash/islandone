import { ArcRotateCamera, Vector3, type Scene } from "@babylonjs/core";

/**
 * Elevated orbit camera (CAMERA_AND_MODULAR_BUILDING_RULES.md §1):
 * rotate freely around the focus, zoom, and tilt within a readable range.
 */
export function createOrbitCamera(scene: Scene, canvas: HTMLCanvasElement, target: Vector3) {
  // alpha = -π/4 puts the sea (+X) to the right of and in front of the camp, as in the reference image.
  const camera = new ArcRotateCamera("orbit", -Math.PI / 4, 0.9, 30, target, scene);
  camera.fov = 0.6; // slightly telephoto, flatter perspective like the reference
  camera.lowerBetaLimit = 0.35; // steepest top-down tilt
  camera.upperBetaLimit = 1.25; // never down to ground level
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 60;
  camera.wheelDeltaPercentage = 0.01;
  camera.pinchDeltaPercentage = 0.004;
  camera.panningSensibility = 120;
  camera.inertia = 0.85;
  camera.minZ = 0.1;
  camera.maxZ = 1500;
  camera.attachControl(canvas, true);
  return camera;
}
