import { type AbstractMesh, Mesh, Scene, SceneInstrumentation, Vector3 } from "@babylonjs/core";
import { createCharacter, type Character } from "../character/character";
import { createCharacterPlaceholder } from "../character/placeholder";
import { createCaustics } from "../water/caustics";
import { buildFoamField } from "../water/foamField";
import { createWater } from "../water/water";
import { AssetLibrary } from "../world/assets";
import { buildBeach } from "../world/beachLayout";
import { createSkyAndLight, HORIZON, ZENITH } from "../world/sky";
import { windState } from "../world/wind";
import { loadTerrain, terrainHeight } from "../world/terrain";
import { createOrbitCamera } from "./camera";
import { createEngine } from "./createEngine";
import { setupLook } from "./look";
import { statsStore } from "./stats";

export async function startIsland(canvas: HTMLCanvasElement) {
  const { engine, renderer } = await createEngine(canvas);
  statsStore.set({ renderer });

  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;

  const camera = createOrbitCamera(scene, canvas, new Vector3(-1.5, 0.8, 1));
  // ?cam=alpha,beta,radius,x,y,z reproduces a view, e.g. for comparing screenshots.
  const cam = new URLSearchParams(location.search).get("cam")?.split(",").map(Number);
  if (cam?.length === 6 && cam.every(Number.isFinite)) {
    camera.target = new Vector3(cam[3], cam[4], cam[5]); // set first: the setter recomputes alpha/beta/radius
    [camera.alpha, camera.beta, camera.radius] = cam;
    camera.upperBetaLimit = Math.max(camera.upperBetaLimit ?? 0, cam[1]);
  }
  const { shadows, sun } = createSkyAndLight(scene);
  setupLook(scene, camera);
  const terrain = await loadTerrain(scene);
  const caustics = createCaustics(scene, terrain);
  const water = createWater(scene, {
    camera,
    sunDirection: sun.direction,
    sunColor: sun.diffuse.scale(sun.intensity),
    zenith: ZENITH,
    horizon: HORIZON,
  });
  const characterStart = new Vector3(-1.4, terrainHeight(-1.4, -0.6), -0.6);
  let character: Character | null = null;

  const library = new AssetLibrary(scene, shadows);
  library.onProgress = (s) => statsStore.set({ assetsLoaded: s.loaded, assetsTotal: s.total });

  const instrumentation = new SceneInstrumentation(scene);
  instrumentation.captureFrameTime = false;
  let statTimer = 0;

  const start = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const t = (performance.now() - start) / 1000;
    water.update(t);
    caustics.update(t);
    windState.time = t;
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
      createCharacter(scene, shadows, (m) => terrain.includes(m), characterStart)
        .then((c) => (character = c))
        .catch((err) => {
          // Keep the scene usable if the character file is missing or broken.
          console.error("IO_Character_A failed to load, using placeholder", err);
          createCharacterPlaceholder(scene, shadows, characterStart, -0.9);
        }),
    ]);
    // Foam field for the water: shoreline plus rocks, posts and stones breaking the surface (highest LOD only).
    const skip = new Set<AbstractMesh>([...terrain, ...caustics.meshes, water.mesh]);
    const characterRoot = scene.getTransformNodeByName("Character");
    const waterTint = scene.getMeshByName("waterTint");
    const candidates = scene.meshes.filter(
      (m) =>
        !skip.has(m) &&
        m !== waterTint &&
        m.getTotalVertices() > 0 &&
        (!(m instanceof Mesh) || m.thinInstanceCount <= 300) &&
        !/_LOD[1-9]$|_COL(_\d+)?$|^sky$|^clouds$/.test(m.name) &&
        !(characterRoot && m.isDescendantOf(characterRoot)),
    );
    water.setFoamField(buildFoamField(scene, candidates));
    statsStore.set({ ready: true });
  } catch (err) {
    console.error(err);
    statsStore.set({ error: String(err) });
  }

  // Handy in the browser console while tuning: window.islandone.scene.debugLayer …
  Object.assign(window, { islandone: { engine, scene, camera, library } });
}
