import { type AbstractMesh, Mesh, Scene, SceneInstrumentation, Vector3 } from "@babylonjs/core";
import { createCharacter, type Character } from "../character/character";
import { buildCollisionWorld, type CollisionWorld } from "../character/collision";
import { createCharacterPlaceholder } from "../character/placeholder";
import { createCaustics } from "../water/caustics";
import { buildFoamField } from "../water/foamField";
import { createWater } from "../water/water";
import { AssetLibrary } from "../world/assets";
import { buildBeach } from "../world/beachLayout";
import { createContactShadows } from "../world/contactShadows";
import { createSkyAndLight, HORIZON, ZENITH } from "../world/sky";
import { windState } from "../world/wind";
import { WATER_LEVEL, loadTerrain, terrainHeight } from "../world/terrain";
import { cameraRigRef, createCameraRig, createOrbitCamera } from "./camera";
import { createEngine } from "./createEngine";
import { setupLook } from "./look";
import { measureMemory, runBenchmark } from "./measure";
import { hardwareScaling, pickQuality } from "./quality";
import { statsStore } from "./stats";

export async function startIsland(canvas: HTMLCanvasElement) {
  const { engine, renderer } = await createEngine(canvas);
  const quality = pickQuality();
  engine.setHardwareScalingLevel(hardwareScaling(quality));
  statsStore.set({ renderer, quality: quality.level });

  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;

  const camera = createOrbitCamera(scene, canvas);
  cameraRigRef.current = createCameraRig(camera, canvas);
  // ?cam=alpha,beta,radius,x,y,z reproduces a view, e.g. for comparing screenshots.
  const cam = new URLSearchParams(location.search).get("cam")?.split(",").map(Number);
  if (cam?.length === 6 && cam.every(Number.isFinite)) {
    camera.target = new Vector3(cam[3], cam[4], cam[5]); // set first: the setter recomputes alpha/beta/radius
    [camera.alpha, camera.beta, camera.radius] = cam;
    camera.upperBetaLimit = Math.max(camera.upperBetaLimit ?? 0, cam[1]);
  }
  const { shadows, sun } = createSkyAndLight(scene, quality.shadowMapSize, quality.shadowFilter);
  setupLook(scene, camera, quality);
  const terrain = await loadTerrain(scene);
  const caustics = createCaustics(scene, terrain);
  if (!quality.caustics) for (const m of caustics.meshes) m.setEnabled(false);
  const water = createWater(scene, {
    camera,
    sunDirection: sun.direction,
    sunColor: sun.diffuse.scale(sun.intensity),
    zenith: ZENITH,
    horizon: HORIZON,
  });
  const characterStart = new Vector3(-1.4, terrainHeight(-1.4, -0.6), -0.6);
  let character: Character | null = null;
  let collision: CollisionWorld | null = null;

  const library = new AssetLibrary(scene, shadows);
  library.lodScale = quality.lodScale;
  library.onProgress = (s) => statsStore.set({ assetsLoaded: s.loaded, assetsTotal: s.total });

  const instrumentation = new SceneInstrumentation(scene);
  instrumentation.captureFrameTime = false;
  let statTimer = 0;
  let memoryTimer = 0;

  const start = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const t = (performance.now() - start) / 1000;
    water.update(t);
    if (quality.caustics) caustics.update(t);
    windState.time = t;
    library.update(camera.position);
    const dt = Math.min(engine.getDeltaTime(), 100) / 1000;
    character?.update(dt);
  });
  scene.onAfterRenderObservable.add(() => {
    if ((statTimer += engine.getDeltaTime()) < 500) return;
    statTimer = 0;
    statsStore.set({
      fps: Math.round(engine.getFps()),
      drawCalls: instrumentation.drawCallsCounter.current,
      triangles: Math.round(scene.getActiveIndices() / 3),
    });
    // Counting buffers walks the whole scene, so only every few seconds.
    if ((memoryTimer += 1) % 6 === 0) statsStore.set({ memory: measureMemory(engine, scene) });
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  try {
    const [collisionExtras] = await Promise.all([
      buildBeach(library, scene, quality.vegetationDensity),
      createCharacter(scene, shadows, characterStart)
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
    // The water only needs the depth of what lies under or at it: skip vegetation and props up on
    // the beach, which saves a whole extra pass over the jungle.
    water.setDepthCasters(
      scene.meshes.filter(
        (m) =>
          m.getTotalVertices() > 0 &&
          !/Bush|Fern|Grass|Palm|Pebbles|contactShadows|caustics|^water|^sky$|^clouds$/.test(m.name) &&
          !(characterRoot && m.isDescendantOf(characterRoot)) &&
          m.getBoundingInfo().boundingBox.minimumWorld.y < WATER_LEVEL + 0.4,
      ),
    );
    // Contact shadows: skip dense ground cover (grass, ferns) and the pebbles' tiny blobs.
    createContactShadows(
      scene,
      candidates.filter((m) => !(m instanceof Mesh && m.thinInstanceCount > 40 && !m.name.startsWith("Crates")) && !/^(Pebbles|Starfish)/.test(m.name)),
    );
    // Assigned in the load callback above, which TypeScript does not track.
    collision = buildCollisionWorld(scene, collisionExtras);
    // The camera stays above the hut, palms and workbench instead of passing through them.
    cameraRigRef.current?.setObstacles(
      scene.transformNodes
        .filter((n) => /^IO_(Hut|Palm|Workbench)/.test(n.name) && !n.parent)
        .map((n) => {
          const { min, max } = n.getHierarchyBoundingVectors(true, (m) => m.isEnabled() && !/_COL/.test(m.name));
          return { x0: min.x, z0: min.z, x1: max.x, z1: max.z, top: max.y };
        }),
    );
    (character as Character | null)?.setCollision(collision);
    statsStore.set({ ready: true, memory: measureMemory(engine, scene) });
  } catch (err) {
    console.error(err);
    statsStore.set({ error: String(err) });
  }

  // Handy in the browser console while tuning: window.islandone.scene.debugLayer …
  Object.assign(window, { islandone: { engine, scene, camera, library, character, collision, quality } });

  const bench = new URLSearchParams(location.search).get("bench");
  if (bench !== null && statsStore.get().ready) {
    statsStore.set({ bench: "running" });
    await new Promise((r) => setTimeout(r, 2000)); // let shaders compile and the first frames settle
    const result = await runBenchmark(engine, scene, camera, Number(bench) || 20);
    console.log("IslandOne benchmark", JSON.stringify({ renderer, quality: quality.level, ...result }));
    statsStore.set({ bench: result });
  }
}
