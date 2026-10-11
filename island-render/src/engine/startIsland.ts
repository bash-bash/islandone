import { ImageProcessingConfiguration, Scene, SceneInstrumentation, Vector3 } from "@babylonjs/core";
import { createCharacter, type Character } from "../character/character";
import { createCharacterPlaceholder } from "../character/placeholder";
import { createWater } from "../water/water";
import { AssetLibrary } from "../world/assets";
import { buildBeach } from "../world/beachLayout";
import { createSkyAndLight } from "../world/sky";
import { createTerrain, terrainHeight } from "../world/terrain";
import { createOrbitCamera } from "./camera";
import { createEngine } from "./createEngine";
import { statsStore } from "./stats";

export async function startIsland(canvas: HTMLCanvasElement) {
  const { engine, renderer } = await createEngine(canvas);
  statsStore.set({ renderer });

  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;

  // Tone mapping and a touch of contrast/saturation for the stylised look (handoff §22).
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.05;
  ip.contrast = 1.12;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.2;

  const camera = createOrbitCamera(scene, canvas, new Vector3(-1.5, 0.8, 1));
  // ?cam=alpha,beta,radius,x,y,z reproduces a view, e.g. for comparing screenshots.
  const cam = new URLSearchParams(location.search).get("cam")?.split(",").map(Number);
  if (cam?.length === 6 && cam.every(Number.isFinite)) {
    camera.target = new Vector3(cam[3], cam[4], cam[5]); // set first: the setter recomputes alpha/beta/radius
    [camera.alpha, camera.beta, camera.radius] = cam;
  }
  const { shadows, skyReflection } = createSkyAndLight(scene);
  const terrain = createTerrain(scene);
  const water = createWater(scene, skyReflection.cubeTexture);
  const characterStart = new Vector3(-1.4, terrainHeight(-1.4, -0.6), -0.6);
  let character: Character | null = null;

  const library = new AssetLibrary(scene, shadows);
  library.onProgress = (s) => statsStore.set({ assetsLoaded: s.loaded, assetsTotal: s.total });

  const instrumentation = new SceneInstrumentation(scene);
  instrumentation.captureFrameTime = false;
  let statTimer = 0;

  const start = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    water.update((performance.now() - start) / 1000);
    library.update(camera.position);
    character?.update(Math.min(engine.getDeltaTime(), 100) / 1000);
  });
  scene.onAfterRenderObservable.add(() => {
    if ((statTimer += engine.getDeltaTime()) < 500) return;
    statTimer = 0;
    statsStore.set({
      fps: Math.round(engine.getFps()),
      drawCalls: instrumentation.drawCallsCounter.current,
      triangles: Math.round(scene.getActiveIndices() / 3),
    });
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  try {
    await Promise.all([
      buildBeach(library, scene, shadows),
      createCharacter(scene, shadows, terrain, characterStart)
        .then((c) => (character = c))
        .catch((err) => {
          // Keep the scene usable if the character file is missing or broken.
          console.error("IO_Character_A failed to load, using placeholder", err);
          createCharacterPlaceholder(scene, shadows, characterStart, -0.9);
        }),
    ]);
    statsStore.set({ ready: true });
  } catch (err) {
    console.error(err);
    statsStore.set({ error: String(err) });
  }

  // Handy in the browser console while tuning: window.islandone.scene.debugLayer …
  Object.assign(window, { islandone: { engine, scene, camera, library } });
}
