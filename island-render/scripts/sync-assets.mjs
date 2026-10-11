// Copies the runtime GLBs the beach test needs from the Blender asset folder
// (layout: <family>/<file>.glb, as in the project's assets folder) into public/assets.
//
//   npm run sync-assets -- /path/to/IslandOne/assets
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const FILES = [
  "bush/IO_Bush_Tropical_A.glb",
  "bush/IO_Bush_Tropical_B.glb",
  "bush/IO_Bush_Tropical_C.glb",
  "campfire_stone/IO_Campfire_Stone_A.glb",
  "fern/IO_Fern_A.glb",
  "fiber/IO_Fiber_Binding_A_Coil.glb",
  "grass/IO_Grass_Clump_A.glb",
  "grass/IO_Grass_Clump_B.glb",
  "grass/IO_Grass_Clump_C.glb",
  "hut/glb/IO_Hut_A_Full.glb",
  "log/IO_Log_Long_A.glb",
  "log/IO_Log_Short_A.glb",
  "palm/IO_Palm_A.glb",
  "palm/IO_Palm_B.glb",
  "palm/IO_Palm_Young_A.glb",
  "plank/IO_Plank_Long_A.glb",
  "plank/IO_Plank_Short_A.glb",
  "pole/IO_Pole_Long_A.glb",
  "rock/glb/IO_Rock_Large_A.glb",
  "rock/glb/IO_Rock_Large_B.glb",
  "seagull/IO_Seagull_A.glb",
  "starfish/IO_Starfish_A.glb",
  "stone/IO_Stone_Small_A.glb",
  "workbench/IO_Workbench_A.glb",
];

const src = process.argv[2] ?? process.env.ISLANDONE_ASSETS;
if (!src) {
  console.error("Usage: npm run sync-assets -- <path to assets folder>");
  process.exit(1);
}
const dest = resolve(dirname(new URL(import.meta.url).pathname), "../public/assets");

let missing = 0;
for (const rel of FILES) {
  const from = join(src, rel);
  if (!existsSync(from)) {
    console.warn(`missing: ${rel}`);
    missing++;
    continue;
  }
  const to = join(dest, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  if (rel.startsWith("hut/")) fixHutVertexColors(to);
  console.log(`${rel}  ${(statSync(to).size / 1024).toFixed(0)} KB`);
}
if (missing) process.exitCode = 1;

/**
 * The current hut export stores its real colours in COLOR_1 and plain white in COLOR_0.
 * Babylon (like the glTF spec) only uses COLOR_0, so the hut renders white. Swap the two
 * attribute names in the GLB's JSON chunk (same byte length, binary data untouched).
 * Remove once islandone_hut.py writes the colours to COLOR_0.
 */
function fixHutVertexColors(file) {
  const buf = readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const json = buf.toString("utf8", 20, 20 + jsonLength);
  if (!json.includes('"COLOR_1"')) return;
  const swapped = json.replaceAll('"COLOR_0"', '"__C0__"').replaceAll('"COLOR_1"', '"COLOR_0"').replaceAll('"__C0__"', '"COLOR_1"');
  buf.write(swapped, 20, jsonLength, "utf8");
  writeFileSync(file, buf);
  console.log(`  fixed vertex colours (COLOR_1 -> COLOR_0)`);
}
