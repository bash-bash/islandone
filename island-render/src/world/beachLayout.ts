import { Color3, Vector3, type Scene } from "@babylonjs/core";
import type { AssetId, AssetLibrary, Placement } from "./assets";
import { buildCampfire, buildDock, logPile } from "./camp";
import { rng } from "./noise";
import { terrainHeight } from "./terrain";

// The ~30 m test beach from the handoff (§25), composed after the reference image
// "Tropisches Inselcamp am Strand": hut and camp on the sand, jungle edge behind,
// rocks along the waterline, a pier into the shallow water.
// Land is -X, sea is +X.

const CAMP_CENTRE = { x: -3, z: 0 };

const at = (x: number, z: number, lift = 0) => new Vector3(x, terrainHeight(x, z) + lift, z);

interface Keepout {
  x: number;
  z: number;
  r: number;
}

/** Areas vegetation scatter stays out of (hut, camp, paths). */
const KEEPOUT: Keepout[] = [
  { x: -7, z: 2, r: 4.2 }, // hut
  { x: -3.5, z: -2.5, r: 2.2 }, // campfire
  { x: -2.5, z: 4.5, r: 1.6 }, // workbench
  { x: -1.5, z: 0, r: 3 }, // open sand in the middle of camp
  { x: 0.2, z: -4.2, r: 2 }, // long woodpile
  { x: -4.6, z: -6.2, r: 1.3 }, // short woodpile
  { x: 0.8, z: 1.5, r: 2 }, // plank stack
  { x: 3.5, z: -6.5, r: 1.8 }, // pier landing
];

function scatterArea(
  seed: number,
  count: number,
  area: { x: [number, number]; z: [number, number] },
  opts: { scale: [number, number]; minHeight?: number; maxHeight?: number; keepout?: Keepout[]; sink?: number },
): Placement[] {
  const rand = rng(seed);
  const out: Placement[] = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 30) {
    const x = area.x[0] + rand() * (area.x[1] - area.x[0]);
    const z = area.z[0] + rand() * (area.z[1] - area.z[0]);
    const h = terrainHeight(x, z);
    if (opts.minHeight !== undefined && h < opts.minHeight) continue;
    if (opts.maxHeight !== undefined && h > opts.maxHeight) continue;
    if ((opts.keepout ?? KEEPOUT).some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r)) continue;
    out.push({
      position: new Vector3(x, h - (opts.sink ?? 0), z),
      rotationY: rand() * Math.PI * 2,
      scale: opts.scale[0] + rand() * (opts.scale[1] - opts.scale[0]),
    });
  }
  return out;
}

/** Split one scatter list across asset variants (A/B/C) so they share the same distribution. */
function split(placements: Placement[], ids: AssetId[]): [AssetId, Placement[]][] {
  return ids.map((id, i) => [id, placements.filter((_, k) => k % ids.length === i)]);
}

/**
 * Per-instance colour variation for foliage, so a dense jungle does not read as one flat
 * lime green: darker and slightly bluer in places, sun-yellowed in others.
 */
function tint(placements: Placement[], seed: number) {
  const rand = rng(seed * 7 + placements.length);
  for (const p of placements) {
    if (p.color) continue;
    const v = 0.6 + rand() * 0.42;
    const warm = rand() - 0.5;
    p.color = new Color3(v * (1 + warm * 0.45), v, v * (1 - warm * 0.5));
  }
}

/** Loose clusters: `count` centres, each with min..max members within `radius`. */
function clusters(
  seed: number,
  count: number,
  area: { x: [number, number]; z: [number, number] },
  min: number,
  max: number,
  radius: number,
  scale: [number, number],
): Placement[] {
  const rand = rng(seed + 1000);
  const out: Placement[] = [];
  for (const c of scatterArea(seed, count, area, { scale: [1, 1] })) {
    const n = min + Math.floor(rand() * (max - min + 1));
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      const x = c.position.x + Math.cos(a) * r;
      const z = c.position.z + Math.sin(a) * r;
      if (KEEPOUT.some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r)) continue;
      out.push({ position: new Vector3(x, terrainHeight(x, z), z), rotationY: rand() * 6.3, scale: scale[0] + rand() * (scale[1] - scale[0]) });
    }
  }
  return out;
}

/** Rocks on the sand that get greenery at their foot (position, radius, whether a bush fits). */
const ROCK_GREENERY = [
  { x: -8.5, z: -11.5, r: 2.3, bush: true },
  { x: -3.5, z: -13, r: 1.9, bush: true },
  { x: 4.2, z: 9.5, r: 1.5, bush: false },
  { x: 3.0, z: 15.5, r: 1.6, bush: true },
];

/** `perRock` plants around the foot of each rock, on the landward side. */
function ringAround(seed: number, rocks: typeof ROCK_GREENERY, perRock: number, scale: [number, number]): Placement[] {
  const rand = rng(seed);
  const out: Placement[] = [];
  for (const r of rocks)
    for (let i = 0; i < perRock; i++) {
      const a = Math.PI * (0.5 + rand()); // landward half (-X)
      const d = r.r * (0.85 + rand() * 0.35);
      const x = r.x + Math.cos(a) * d;
      const z = r.z + Math.sin(a) * d;
      if (terrainHeight(x, z) < 0.25) continue;
      out.push({ position: new Vector3(x, terrainHeight(x, z), z), rotationY: rand() * 6.3, scale: scale[0] + rand() * (scale[1] - scale[0]) });
    }
  return out;
}

export async function buildBeach(lib: AssetLibrary, scene: Scene) {
  const jobs: Promise<unknown>[] = [];
  const place = (id: AssetId, p: Placement, name?: string) => jobs.push(lib.place(id, p, name));
  const scatter = (id: AssetId, p: Placement[], lod = 0, name?: string) => jobs.push(lib.scatter(id, p, lod, name));
  // Thin instances share one LOD level, so split large scatters into rings around the camp:
  // full detail where the camera usually is, cheaper levels further out.
  const scatterRings = (id: AssetId, p: Placement[]) => {
    tint(p, id.length);
    const ring = (q: Placement) => Math.hypot(q.position.x - CAMP_CENTRE.x, q.position.z - CAMP_CENTRE.z);
    scatter(id, p.filter((q) => ring(q) < 14), 0, `${id}_near`);
    scatter(id, p.filter((q) => ring(q) >= 14 && ring(q) < 26), 1, `${id}_mid`);
    scatter(id, p.filter((q) => ring(q) >= 26), 2, `${id}_far`);
  };

  // --- Camp -------------------------------------------------------------------------
  place("IO_Hut_A_Full", { position: at(-7, 2, -0.02), rotationY: 0 });
  place("IO_Workbench_A", { position: at(-2.5, 4.6), rotationY: Math.PI / 2 + 0.15 });
  jobs.push(buildCampfire(lib, scene, -3.5, -2.5));
  scatter("IO_Log_Long_A", logPile(0.2, -4.2, 0.35, 5), 0, "Woodpile_Long");
  scatter("IO_Log_Short_A", logPile(-4.6, -6.2, -0.4, 6), 0, "Woodpile_Short");
  // Loose planks lying on the sand, as in the reference.
  scatter(
    "IO_Plank_Long_A",
    [0, 1, 2, 3, 4, 5].map((i) => ({
      position: at(0.6 + (i % 3) * 0.02, 1.2 + (i % 3) * 0.27 + 0.03, 0.03 + Math.floor(i / 3) * 0.06),
      rotation: new Vector3(0, (i % 2) * 0.04, 0),
    })),
    0,
    "PlankStack",
  );
  scatter(
    "IO_Plank_Short_A",
    [
      { position: at(-1.2, 6.5, 0.03), rotationY: 1.2 },
      { position: at(-0.9, 6.8, 0.03), rotationY: 0.9 },
    ],
    0,
    "LoosePlanks",
  );
  // Crates nailed together from short planks, by the hut and the workbench.
  scatter(
    "IO_Plank_Short_A",
    [
      plankCrate(-3.6, 3.2, 0.2, 0.6),
      plankCrate(-3.0, 3.9, -0.3, 0.5),
      plankCrate(-1.5, 5.9, 0.7, 0.55),
      plankCrate(-9.8, -1.8, 0.5, 0.55),
    ].flat(),
    0,
    "Crates",
  );

  // --- Pier ---------------------------------------------------------------------------
  jobs.push(buildDock(lib, 2.2, 9, -6.5));

  // --- Rocks --------------------------------------------------------------------------
  place("IO_Rock_Large_A", { position: at(4.2, 9.5, -0.1), rotationY: 0.8 });
  place("IO_Rock_Large_B", { position: at(7.2, 12.5, -0.25), rotationY: 2.1, scale: 1.2 });
  place("IO_Rock_Large_A", { position: at(9.5, 7.5, -0.3), rotationY: 4.0, scale: 0.75 });
  place("IO_Rock_Large_B", { position: at(3.0, 15.5), rotationY: 0.4, scale: 0.9 });
  place("IO_Rock_Large_B", { position: at(-8.5, -11.5), rotationY: 1.4, scale: 1.35 });
  place("IO_Rock_Large_A", { position: at(-3.5, -13), rotationY: 5.2, scale: 1.1 });
  place("IO_Rock_Large_B", { position: at(13, -13, -0.4), rotationY: 3.3, scale: 1.0 });
  place("IO_Rock_Large_A", { position: at(15.5, 3, -0.5), rotationY: 0.2, scale: 0.9 });
  // Seagull on the big rock at the waterline (rock B at 1.2 × 2.08 m).
  place("IO_Seagull_A", { position: at(7.2, 12.5, 2.2), rotationY: -2.3 });

  scatter(
    "IO_Stone_Small_A",
    scatterArea(31, 26, { x: [-6, 7], z: [-14, 14] }, { scale: [0.6, 1.5], sink: 0.02 }),
    0,
    "Stones_Beach",
  );
  scatter(
    "IO_Stone_Small_A",
    scatterArea(32, 14, { x: [5, 12], z: [-14, 14] }, { scale: [1.2, 2.4], minHeight: -1.5, maxHeight: 0, keepout: [] }),
    0,
    "Stones_Underwater",
  );
  // Small pebbles in loose clusters on the dry sand (the reference is full of them).
  const pebbleRand = rng(35);
  const pebbles: Placement[] = [];
  for (const c of scatterArea(36, 16, { x: [-9, 5], z: [-13, 13] }, { scale: [1, 1], minHeight: 0.35 })) {
    const n = 4 + Math.floor(pebbleRand() * 6);
    for (let i = 0; i < n; i++) {
      const a = pebbleRand() * Math.PI * 2;
      const r = Math.sqrt(pebbleRand()) * 0.8;
      const x = c.position.x + Math.cos(a) * r;
      const z = c.position.z + Math.sin(a) * r;
      pebbles.push({ position: new Vector3(x, terrainHeight(x, z) - 0.01, z), rotationY: pebbleRand() * 6.3, scale: 0.22 + pebbleRand() * 0.35 });
    }
  }
  scatter("IO_Stone_Small_A", pebbles, 1, "Pebbles");
  scatter(
    "IO_Starfish_A",
    [
      { position: at(4.3, -1.5, 0.005), rotationY: 0.4 },
      { position: at(5.6, 3.5, 0.005), rotationY: 1.9 },
      { position: at(3.8, 5.2, 0.005), rotationY: 3.1, scale: 0.8 },
      { position: at(7.5, -2.5, 0.005), rotationY: 5.0, scale: 1.2 },
      { position: at(1.2, -4.2, 0.005), rotationY: 2.2, scale: 0.9 },
      { position: at(4.9, 8.1, 0.005), rotationY: 4.4, scale: 1.1 },
    ],
    0,
    "Starfish",
  );

  // --- Palms --------------------------------------------------------------------------
  const palms: [AssetId, number, number, number, number][] = [
    ["IO_Palm_A", -12, 6.5, 2.6, 1.0],
    ["IO_Palm_B", -13, -3, 0.8, 1.05],
    ["IO_Palm_A", -10, -8.5, 3.6, 0.9],
    ["IO_Palm_B", -14.5, 12, 1.9, 1.1],
    ["IO_Palm_A", 0.5, 12.5, 2.9, 0.85],
    ["IO_Palm_B", -1.5, -10.5, 3.3, 0.95],
    ["IO_Palm_A", -19, 2, 0.3, 1.15],
    ["IO_Palm_B", -20, -9, 4.4, 1.0],
    ["IO_Palm_A", -21, 15, 5.1, 1.1],
    ["IO_Palm_B", -24, -16, 2.2, 1.2],
    ["IO_Palm_A", -26, 6, 1.1, 1.0],
    ["IO_Palm_Young_A", -8.5, 11, 0.6, 1.0],
    ["IO_Palm_Young_A", -6, -9.5, 2.4, 1.1],
    ["IO_Palm_Young_A", -16, -6, 4.0, 1.2],
  ];
  palms.forEach(([id, x, z, yaw, s], i) => place(id, { position: at(x, z, -0.05), rotationY: yaw, scale: s }, `${id}#${i}`));

  // --- Jungle edge vegetation (thin instances, one draw call per mesh) ------------------
  // The reference reads as a wall of foliage behind the camp: dense overlapping bushes and
  // ferns along the sand edge, thinning out into the jungle and in tufts onto the beach.
  const bushes = [
    ...scatterArea(41, 90, { x: [-30, -8.5], z: [-30, 30] }, { scale: [0.8, 1.4] }),
    ...clusters(45, 22, { x: [-14, -7.8], z: [-16, 16] }, 2, 4, 1.3, [0.9, 1.5]),
  ];
  for (const [id, p] of split(bushes, ["IO_Bush_Tropical_A", "IO_Bush_Tropical_B", "IO_Bush_Tropical_C"]))
    scatterRings(id, p);
  scatterRings("IO_Fern_A", [
    ...scatterArea(42, 140, { x: [-30, -6.5], z: [-30, 30] }, { scale: [0.8, 1.5] }),
    ...clusters(46, 18, { x: [-9.5, -6], z: [-15, 15] }, 2, 4, 1.0, [0.7, 1.2]),
    ...ringAround(47, ROCK_GREENERY, 3, [0.7, 1.2]),
  ]);
  const grass = [
    ...scatterArea(43, 380, { x: [-30, -2], z: [-30, 30] }, { scale: [0.8, 1.3] }),
    // Tufts spilling from the jungle onto the sand.
    ...clusters(48, 26, { x: [-8, -4.5], z: [-15, 15] }, 3, 6, 0.7, [0.6, 1.1]),
    ...ringAround(49, ROCK_GREENERY, 5, [0.6, 1.0]),
  ];
  for (const [id, p] of split(grass, ["IO_Grass_Clump_A", "IO_Grass_Clump_B", "IO_Grass_Clump_C"])) scatterRings(id, p);
  // A few clumps on the open beach near the rocks.
  scatter(
    "IO_Grass_Clump_B",
    scatterArea(44, 18, { x: [-3, 3], z: [7, 16] }, { scale: [0.7, 1.1], minHeight: 0.35 }),
    1,
    "Grass_Beach",
  );
  // Red-leaved plants (like cordyline) dotted along the jungle edge for colour accents.
  scatter(
    "IO_Fern_A",
    clusters(51, 10, { x: [-12, -7.5], z: [-12, 14] }, 1, 3, 0.6, [0.8, 1.1]).map((p) => ({ ...p, color: new Color3(3.6, 0.42, 0.75) })),
    0,
    "Fern_Red",
  );
  // Bushes tucked against the beach rocks and hugging the hut, as in the reference.
  scatter(
    "IO_Bush_Tropical_C",
    [
      ...ringAround(50, ROCK_GREENERY.filter((r) => r.bush), 1, [0.7, 1.0]),
      { position: at(-10.2, 5.4), rotationY: 1.1, scale: 1.1 },
      { position: at(-10.4, -1.6), rotationY: 2.7, scale: 1.2 },
      { position: at(-4.9, 5.6), rotationY: 0.3, scale: 0.75 },
    ],
    0,
    "Bushes_Camp",
  );

  // --- Background: rocky islets out at sea ---------------------------------------------
  const islets: [AssetId, number, number, number, number][] = [
    ["IO_Rock_Large_B", 12.5, 20, 0.7, 2.2],
    ["IO_Rock_Large_A", 16, 16.5, 2.2, 1.5],
    ["IO_Rock_Large_B", 18.5, 23, 4.1, 2.6],
    ["IO_Rock_Large_A", 11, 25.5, 5.5, 1.8],
    ["IO_Rock_Large_A", 22, 12, 1.4, 2.0],
    ["IO_Rock_Large_B", 24, -18, 3.0, 2.0],
  ];
  islets.forEach(([id, x, z, yaw, s], i) => place(id, { position: at(x, z, -0.6 * s), rotationY: yaw, scale: s }, `Islet#${i}`));

  // --- Camp clutter --------------------------------------------------------------------
  scatter(
    "IO_Fiber_Binding_A_Coil",
    [
      { position: at(-2.0, 3.6, 0.01), rotationY: 0.6 },
      { position: at(2.9, -5.6, 0.01), rotationY: 2.1, scale: 1.2 },
      { position: at(-5.2, -5.4, 0.01), rotationY: 4.0 },
    ],
    0,
    "RopeCoils",
  );
  scatter(
    "IO_Log_Short_A",
    [{ position: at(-1.6, 3.4, 0.08), rotationY: 0.4 }],
    0,
    "LooseLogs",
  );

  await Promise.all(jobs);
}

/**
 * A crate of edge `size` built from IO_Plank_Short_A (1.2 × 0.06 × 0.25 m): two rows of planks
 * per side wall, stood on edge, and three planks across the lid.
 */
function plankCrate(cx: number, cz: number, yaw: number, size: number): Placement[] {
  const out: Placement[] = [];
  const ground = terrainHeight(cx, cz) - 0.02;
  const put = (lx: number, ly: number, lz: number, rot: Vector3, scale: Vector3) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.push({
      position: new Vector3(cx + lx * c + lz * s, ground + ly, cz - lx * s + lz * c),
      rotation: new Vector3(rot.x, rot.y + yaw, rot.z),
      scale,
    });
  };
  const half = size / 2 - 0.03;
  const rowH = size / 2 / 0.25;
  for (let row = 0; row < 2; row++) {
    const y = size * (0.25 + row * 0.5);
    const len = new Vector3(size / 1.2, 1, rowH * 0.97);
    put(0, y, half, new Vector3(Math.PI / 2, 0, 0), len);
    put(0, y, -half, new Vector3(Math.PI / 2, 0, 0), len);
    put(half, y, 0, new Vector3(Math.PI / 2, Math.PI / 2, 0), len);
    put(-half, y, 0, new Vector3(Math.PI / 2, Math.PI / 2, 0), len);
  }
  for (let i = -1; i <= 1; i++) put(0, size + 0.01, (i * size) / 3, new Vector3(0, 0, 0), new Vector3((size + 0.04) / 1.2, 1, (size / 3 / 0.25) * 0.95));
  return out;
}
