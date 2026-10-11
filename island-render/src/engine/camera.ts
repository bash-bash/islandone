import { ArcRotateCamera, Vector3, type Scene } from "@babylonjs/core";

/**
 * Elevated orbit camera (CAMERA_AND_MODULAR_BUILDING_RULES.md §1):
 * rotate freely around the focus, zoom, and tilt within a readable range.
 */
export function createOrbitCamera(scene: Scene, canvas: HTMLCanvasElement, target: Vector3) {
  // Start view framed like the reference image: hut top centre, fire left, sea and pier right.
  // Closer than this cuts off the hut and pier, because our camp is spread wider than the reference.
  const camera = new ArcRotateCamera("orbit", -1.05, 1.0, 20, target, scene);
  camera.fov = 0.6; // slightly telephoto, flatter perspective like the reference
  camera.lowerBetaLimit = 0.35; // steepest top-down tilt
  camera.upperBetaLimit = 1.4; // flat enough to see the horizon and clouds, never down to ground level
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
