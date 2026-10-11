import { ArcRotateCamera, Vector3, type Scene } from "@babylonjs/core";
import { terrainHeight } from "../world/terrain";

export interface ViewPose {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

// Start view framed like the reference image: hut top centre, fire left, sea and pier right.
// Closer than this cuts off the hut and pier, because our camp is spread wider than the reference.
export const HOME_VIEW: ViewPose = { alpha: -1.05, beta: 1.0, radius: 20, target: new Vector3(-0.8, 0.5, -1.8) };

/**
 * Elevated orbit camera (CAMERA_AND_MODULAR_BUILDING_RULES.md §1):
 * rotate freely around the focus, zoom, and tilt within a readable range.
 */
export function createOrbitCamera(scene: Scene, canvas: HTMLCanvasElement) {
  const camera = new ArcRotateCamera("orbit", HOME_VIEW.alpha, HOME_VIEW.beta, HOME_VIEW.radius, HOME_VIEW.target.clone(), scene);
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

export interface CameraRig {
  /** Focus Event: glide to a spot in the world, e.g. where the figure discovered something. */
  focus(x: number, z: number, lift?: number): void;
  /** Reset View: glide back to the start view. */
  reset(): void;
}

const GLIDE_SECONDS = 1.2;
const FOCUS_RADIUS = 10;

/** Smooth camera moves on top of the orbit controls. Any drag or wheel by the viewer cancels a move. */
export function createCameraRig(camera: ArcRotateCamera, canvas: HTMLCanvasElement): CameraRig {
  let from: ViewPose | null = null;
  let to: ViewPose | null = null;
  let t = 0;

  const cancel = () => (to = null);
  canvas.addEventListener("pointerdown", cancel);
  canvas.addEventListener("wheel", cancel, { passive: true });

  const glide = (pose: ViewPose) => {
    from = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone() };
    // Turn the short way round.
    const turn = Math.atan2(Math.sin(pose.alpha - from.alpha), Math.cos(pose.alpha - from.alpha));
    to = { ...pose, alpha: from.alpha + turn };
    t = 0;
  };

  camera.getScene().onBeforeRenderObservable.add(() => {
    if (!from || !to) return;
    t = Math.min(1, t + camera.getEngine().getDeltaTime() / 1000 / GLIDE_SECONDS);
    const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in-out
    camera.target = Vector3.Lerp(from.target, to.target, k);
    camera.alpha = from.alpha + (to.alpha - from.alpha) * k;
    camera.beta = from.beta + (to.beta - from.beta) * k;
    camera.radius = from.radius + (to.radius - from.radius) * k;
    if (t >= 1) to = null;
  });

  return {
    focus(x, z, lift = 1) {
      glide({
        alpha: camera.alpha,
        beta: Math.min(camera.beta, 1.1),
        radius: Math.min(camera.radius, FOCUS_RADIUS),
        target: new Vector3(x, terrainHeight(x, z) + lift, z),
      });
    },
    reset() {
      glide({ ...HOME_VIEW, target: HOME_VIEW.target.clone() });
    },
  };
}

/** Lets the HUD reach the rig without importing the scene. */
export const cameraRigRef: { current: CameraRig | null } = { current: null };
