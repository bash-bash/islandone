# IslandOne – Blender Asset List v0

Purpose: Minimal modular asset library for the first IslandOne graphics vertical slice.

Target art direction:
- Stylized real-time 3D
- Premium browser-game look
- Blender-authored
- GLB / glTF 2.0 runtime assets
- Optimized for Babylon.js
- WebGPU preferred, WebGL 2 fallback
- Elevated/isometric gameplay camera
- Clean silhouettes and readable materials

---

## Status (2026-10-10)

| Asset | Status | Ort |
|---|---|---|
| IO_Hut_A | erstellt (v3): `IO_Hut_A_Full` mit LOD0–2 plus Bausatz `IO_HutKit_A` (19 Teile), nach `CAMERA_AND_MODULAR_BUILDING_RULES.md` | `assets/hut/`, `blender/islandone_hut.py` |
| IO_Palm_A, IO_Palm_B, IO_Palm_C | erstellt, je LOD0–3 | `assets/palm/`, `blender/islandone_palm.py` |
| IO_Palm_Young_A | erstellt, LOD0–3 | `assets/palm/` |
| IO_Rock_Large_A, IO_Rock_Large_B | erstellt (v2 Monolith), je ein GLB mit LOD0–2 und Collider, gebackene Base Color/Roughness/Normal 1K/512/256, 360°-QA | `assets/rock/`, `blender/islandone_rock.py` |
| IO_Bush_Tropical_A, _B, _C | erstellt (v1): A voll/mittelhoch, B breit/niedrig, C aufrecht/offen; je ein GLB mit LOD0–3 und optionalem Collider, 1 gemeinsames Material (Alpha-Clip), 1 gemeinsamer Atlas 1K, Wind-Gewichte in TEXCOORD_1/2, 360°-QA und A/B/C-Vergleich | `assets/bush/`, `blender/islandone_bush.py` |
| IO_Fern_A | erstellt (v1): ein GLB mit LOD0–3 und optionalem Collider, 35 Wedel in vier Lagen, 1 Material `IO_MAT_FernLeaf` (Alpha-Clip, gleicher Aufbau wie beim Busch), 1 Atlas 1K, Wind-Gewichte in TEXCOORD_1/2, 360°-QA | `assets/fern/`, `blender/islandone_fern.py` |
| IO_Fiber_Binding_A | erstellt: drei GLBs Coil / Strand / JointWrap, je LOD0–2 (1117/443/156; 300/110/40; 614/192/72 Dreiecke), Coil-Box-Collider, Sockets END_A/B, JOINT_CENTER/AXIS_A/B, Morphs B_Flat/Cross_Angle, `IO_MAT_Fiber_Dry` 512 (Hüttenbausatz behält `IO_HutKit_Binding_A`) | `assets/fiber/`, `blender/islandone_fiber.py` |
| IO_Grass_Clump_A, IO_Grass_Clump_B, IO_Grass_Clump_C | erstellt (v1): je ein GLB mit LOD0–3, kein Collider, 1 gemeinsames Material (opak, keine Alpha), 1 gemeinsames Texturset 256 px, Wind-Gewichte in TEXCOORD_1/2, 360°-QA, A/B/C-Vergleich | `assets/grass/`, `blender/islandone_grass.py` |
| IO_Stone_Small_A | erstellt (v1): ein Monolith der Felsfamilie, ein GLB mit LOD0–2 und Collider, Material `IO_MAT_Rock_Gray` mit glatter Oberfläche wie die großen Felsen, Texturen 512/256/128, 360°-QA und Familienvergleich; gemeißelte Alternative in `_alt/` | `assets/stone/`, `blender/islandone_stone.py` |
| IO_Log_Long_A | erstellt: ein GLB mit LOD0–2 (480 / 180 / 70 Dreiecke), Collider, 8 Sockets, Pivot Stammmitte, 3,0 m × 0,34 m, `IO_MAT_Wood_Medium` 1K | `assets/log/`, `blender/islandone_log.py` |
| IO_Log_Short_A | erstellt: ein GLB mit LOD0–2 (224 / 100 / 42 Dreiecke), Collider (28), 8 Sockets wie Long_A, Pivot Stammmitte, 1,2 m × 0,34 m, `IO_MAT_Wood_Medium` mit den Long_A-Texturen geteilt | `assets/log/`, `blender/islandone_log_short.py` |
| IO_Plank_Long_A | erstellt: ein GLB mit LOD0–2 (236 / 108 / 28 Dreiecke), Box-Collider, 14 Sockets, Pivot Mitte, 3,0 × 0,25 × 0,06 m, `IO_MAT_Wood_Medium` 512 | `assets/plank/`, `blender/islandone_plank.py` |
| IO_Pole_Long_A | erstellt: ein GLB mit LOD0–2 (300 / 126 / 40 Dreiecke), Collider (28), 5 Sockets (END_TOP/BOTTOM, SIDE_TOP/MID/BOTTOM), Pivot Mitte, Achse +X, 3,0 m × 0,17 m, `IO_MAT_Wood_Medium` 512 | `assets/pole/`, `blender/islandone_pole.py` |
| IO_Campfire_Stone_A | erstellt (v1): ein einzelner Stein der Felsfamilie (kein Ring), ein GLB mit LOD0–2 (440 / 160 / 60 Dreiecke), konvexer Collider (32), Pivot Mitte Grundfläche, 0,42 × 0,31 × 0,25 m, `IO_MAT_Rock_Gray` 512/256/128, Ring-Render aus 10 Instanzen | `assets/campfire_stone/`, `blender/islandone_campfire_stone.py` |
| IO_Workbench_A | erstellt (v1): ein GLB mit LOD0–3 (3228 / 1260 / 492 / 136 Dreiecke), Box-Collider, 3 Sockets, 4 optionale Requisiten (Steinbrocken, Steinhammer, Steinklinge, Splitter), Pivot unten Mitte, 1,50 × 0,91 × 0,88 m (Platte 1,50 × 0,80 m), Materialien des Bausatzes `IO_MAT_Wood_Medium` / `IO_MAT_Fiber_Dry` / `IO_MAT_Rock_Gray` (keine neuen Texturen) | `assets/workbench/`, `blender/islandone_workbench.py` |
| IO_Seagull_A | erstellt (v1): stilisierte stehende Möwe, ein GLB mit LOD0–3 (3172 / 1364 / 472 / 212 Dreiecke), konvexer Collider (56), 16 Rig-Hilfspunkte `RIG_*` (Armatur und Vertex-Gruppen in der .blend), Pivot unten Mitte zwischen den Füßen, Blick glTF +Z, 0,44 × 0,18 × 0,37 m, `IO_MAT_Bird_Feathers_Light` 512 + `IO_MAT_Bird_Beak_Legs` 256 | `assets/seagull/`, `blender/islandone_seagull.py` |
| IO_Starfish_A | erstellt (v1): fünfarmiger Seestern, ein GLB mit LOD0–3 (840 / 300 / 96 / 40 Dreiecke), konvexer flacher Collider (18), Pivot unten Mitte, 0,24 × 0,24 × 0,049 m, `IO_MAT_Starfish_A` 512 (ein Texturset für alle LODs), zweites UV-Set als Maske für Laufzeit-Zustände, Strand- und Unterwasser-Kontext-Render | `assets/starfish/`, `blender/islandone_starfish.py` |
| IO_Driftwood_A, _B, _C | erstellt (v1): ausgebleichtes, verdrehtes Treibholz; A 2,15 m mit Wurzelkrone (Achse 1,97 m, taugt als Pfosten), B 1,24 m gebogen mit Gabel, C 0,50 m dickes Spaltstück; je ein GLB mit LOD0–2 (572/234/98, 466/194/72, 448/120/70 Dreiecke), konvexer Collider (28), Sockets END_A/END_B/GRIP/TOP_MID, Pivot Mitte auf Bodenhöhe, Achse +X, 1 Material `IO_MAT_Wood_Driftwood` mit einem Atlas 512 für alle drei, Nässe zur Laufzeit, 360°-QA, Vergleich mit Vorlage, Kontext-Render am Spülsaum | Projektordner `driftwood/`, `islandone_driftwood.py` |
| alle anderen | offen | |

---

## Global Asset Rules

All assets should use:

- real-world scale
- clean topology
- clean normals
- UVs
- PBR-ready materials
- sensible origin/pivot
- no hidden unnecessary geometry
- browser-friendly geometry
- modular construction-friendly proportions
- LOD-ready topology where relevant
- simple collision proxy where needed
- GLB/glTF 2.0 export

Recommended texture sizes:
- hero asset: 2048 px
- normal environment asset: 1024 px
- small prop: 512 px
- tiny prop: 256 px

Polygon budgets below are target ranges, not hard limits.

---

# Priority P0 – First Graphics Vertical Slice

## IO_Palm_A
Type: vegetation, large palm

Target triangles:
- LOD0: 6k–10k
- LOD1: 3k–5k
- LOD2: 800–1500
- LOD3: billboard or very low-poly

Textures: 1K–2K

Requirements:
- curved readable trunk
- ringed palm bark
- large stylized fronds
- clean silhouette
- GPU-instancing friendly

Create variants later:
- IO_Palm_B
- IO_Palm_C

## IO_Palm_Young_A
Type: vegetation, young/small palm

Target triangles: 2k–5k
Textures: 1K

## IO_Rock_Large_A
Type: environment rock

Target triangles:
- LOD0: 2k–5k
- LOD1: 800–1800
- LOD2: 200–600

Textures: 1K

Requirements:
- stylized faceted form
- readable from distance
- wet/dry material variation possible
- simple convex collision proxy

Status: **IO_Rock_Large_A und _B erstellt** (2026-10-09, v2: je ein einzelner Monolith), _C offen. A: 3.600 / 1.300 / 420 Dreiecke, 2,55 m hoch; B: 3.600 / 1.300 / 420, 2,08 m hoch, 3,24 m breit. Collider je 64. Eigene Erstellung (keine Fremd-Assets). Details: `assets/rock/ROCK.md`.

Create:
- IO_Rock_Large_A
- IO_Rock_Large_B
- IO_Rock_Large_C

## IO_Rock_Medium_A
Target triangles: 800–2500
Textures: 512–1K

Create:
- A
- B
- C

## IO_Stone_Small_A
Target triangles: 100–500
Textures: 256–512

Status: **IO_Stone_Small_A erstellt** (2026-10-09, v1), _B bis _D offen. 420 / 150 / 56 Dreiecke (LOD0–2), Collider 32, 0,24 m hoch, 0,44 × 0,36 m, 1 Material `IO_MAT_Rock_Gray`, Texturen 512 / 256 / 128 px, GLB ca. 119 KB. Details: `assets/stone/README.md`.

Create:
- A
- B
- C
- D

## IO_Fern_A
Target triangles: 500–1500
Textures: 512–1K

Status: **IO_Fern_A erstellt** (2026-10-09, v1), _B offen. 1.348 / 584 / 162 / 72 Dreiecke (LOD0–3), 0,69 m hoch, 1,31 × 1,18 m, 35 Wedel, 1 Material `IO_MAT_FernLeaf` (alphaMode MASK), Atlas 1024 px. Details: `assets/fern/README.md`.

Requirements:
- alpha-tested leaves acceptable
- GPU-instancing friendly
- wind-animation friendly

Create:
- A
- B

## IO_Bush_Tropical_A
Target triangles: 800–2500
Textures: 512–1K

Status: **IO_Bush_Tropical_A, _B und _C erstellt** (2026-10-09, v1). Alle teilen sich 1 Material `IO_MAT_TropicalLeaf` (alphaMode MASK) und einen Atlas 1024 px. Details: `assets/bush/README.md`.
- A (voll / mittelhoch): 2.266 / 720 / 162 / 56 Dreiecke (LOD0–3), 1,17 m hoch, 1,60 × 1,52 m
- B (breit / niedrig / ausladend): 2.316 / 734 / 174 / 56, 0,80 m hoch, 2,21 × 1,82 m
- C (aufrecht / offen): 1.752 / 562 / 132 / 46, 1,37 m hoch, 1,50 × 1,22 m

Create:
- A
- B
- C

## IO_Grass_Clump_A
Target triangles: 100–500
Textures: 256–512

Status: **IO_Grass_Clump_A, _B und _C erstellt** (2026-10-09, v1). A ausgewogen: 353 / 136 / 40 / 8 Dreiecke (LOD0–3), 0,46 m hoch, 0,70 × 0,64 m. B niedrig und breit: 332 / 144 / 34 / 10, 0,28 m hoch, 0,88 × 0,72 m. C hoch und aufrecht: 268 / 119 / 36 / 7, 0,58 m hoch, 0,62 × 0,61 m. Halme als Geometrie, 1 gemeinsames Material `IO_MAT_Grass_Tropical` (OPAQUE, doppelseitig), Texturen 256 px, kein Collider. Details: `assets/grass/README.md`.

Create:
- A
- B
- C

Requirements:
- very cheap
- intended for large instance counts

## IO_Hut_A
Type: hero environment asset, temporary complete hut

Status: **erstellt** (v3, 2026-10-09). Showcase `IO_Hut_A_Full` (33.228 / 12.764 / 4.936 Dreiecke) und Bausatz `IO_HutKit_A` mit Konstruktionsgraph. Details: `assets/hut/HUT.md`.

Target triangles: 15k–35k
Textures: up to 2K

Requirements:
- match IslandOne reference image
- warm tan/brown thatch roof, not green
- wooden frame and plank walls
- readable modular construction language
- real-world scale
- simple collision shell
- origin at ground center

Important:
This is initially a finished showcase hut.
Later it should be decomposed into:
- posts
- beams
- wall panels
- roof sections
- bindings
- planks

Do not design gameplay around `spawn_hut()`.

## IO_Character_A
Type: main character
Status: **v1 erstellt** (2026-10-11). Caveman von Trip (Tripo AI, Rig von Tripo), 1,75 m, 29.661 Dreiecke, 2K-Texturen, Mixamo-Skelett, 7 Clips: Idle, Walk, PickUp, CarryIdle, CarryWalk, CarryWalkStop, LiftHeavyFail. Es fehlen Run, Inspect, Arbeitsanimationen und LODs. Details: `assets/character/README.md`.

Target triangles: 20k–40k
Textures: 2K max preferred

Requirements:
- rigged
- humanoid skeleton
- stylized real-time look
- readable silhouette from elevated camera
- animation-ready
- simple clothing

Initial animations:
- Idle
- Walk
- Run
- PickUp
- CarrySmall
- CarryLarge
- Chop
- Hit
- Dig
- Inspect
- Build
- TieWork
- Eat
- Drink
- Sit
- Sleep
- FishSpear
- Fall
- Swim

---

# Modular Construction Assets

## IO_Log_Short_A
Status: **erstellt** (2026-10-10). 1,2 m lang, 0,347 / 0,335 m Durchmesser; 224 / 100 / 42 Dreiecke, Collider 28. Gleiche Familie wie IO_Log_Long_A: gleiches Material und dieselben Texturen, gleicher Pivot (Stammmitte, Achse +X). Sockets nach Long_A-Konvention (END_A, END_B, TOP_A, TOP_MID, TOP_B, SIDE_LEFT, SIDE_RIGHT, BOTTOM_MID) statt der älteren Liste unten. Details: `assets/log/README_IO_Log_Short_A.md`.

Target triangles: 150–500
Texture: 512
Approx length: 0.8–1.2 m

Sockets:
- END_A
- END_B
- SIDE_A
- SIDE_B
- SURFACE

## IO_Log_Medium_A
Target triangles: 200–700
Approx length: 1.5–2.0 m

## IO_Log_Long_A
Target triangles: 250–900
Approx length: 2.5–3.5 m

## IO_Plank_Short_A
Target triangles: 50–250

Approx size:
- 0.8–1.2 m long
- 0.18–0.30 m wide
- 0.03–0.06 m thick

Sockets:
- END_A
- END_B
- TOP_A
- TOP_MID
- TOP_B
- SIDE_LEFT
- SIDE_RIGHT

## IO_Plank_Medium_A
Target triangles: 80–300
Approx length: 1.5–2.0 m

## IO_Plank_Long_A
Target triangles: 100–400
Approx length: 2.5–3.0 m

## IO_Pole_Short_A
Target triangles: 80–300

Use:
- supports
- primitive structures
- tool handles

Sockets:
- END_A
- END_B
- SIDE

## IO_Pole_Long_A
Target triangles: 100–400

## IO_Stick_Short_A
Target triangles: 50–150

## IO_Stick_Long_A
Target triangles: 60–200

## IO_Branch_Curved_A
Target triangles: 100–300

Create:
- A
- B

## IO_Fiber_Binding_A
Type: visual joint / tie

Status: **erstellt** (2026-10-10). Coil 0,46 × 0,18 × 0,13 m (mit Endbüschel 0,58 m), Strand 0,72 m × Ø 0,022 m, JointWrap für zwei gekreuzte Ø-0,17-m-Stangen, per Skalierung und Morphs (B_Flat, Cross_Angle) an andere Durchmesser/Winkel/Bretter anpassbar. JointWrap LOD0 614 Dreiecke (über 500, dokumentiert). Details: `assets/fiber/README.md`.

Target triangles: 100–500
Texture: 256–512

Requirements:
- modular
- can visually wrap around connected parts
- visual only; canonical joint strength comes from simulation

---

# Camp / Prop Assets

## IO_Campfire_Stone_A
Target triangles: 100–400

Create:
- A
- B
- C

## IO_Firewood_A
Target triangles: 100–400

Create:
- A
- B

## IO_Workbench_A
Target triangles: 3k–8k
Texture: 1K

Requirements:
- simple handmade wooden construction
- no unnecessary baked clutter

## IO_Crate_A
Target triangles: 500–1500
Texture: 512–1K

Create:
- A
- B

## IO_Chopping_Block_A
Target triangles: 500–1500
Texture: 512

---

# Animal Assets

## IO_Seagull_A
Target triangles: 5k–12k
Texture: 1K

Animations:
- Idle
- Walk
- Takeoff
- Fly
- Land

## IO_Fish_A
Target triangles: 800–2500
Texture: 512

Animation:
- Swim

Create later:
- Fish_A
- Fish_B
- Fish_C

---

# Underwater / Shore Detail

## IO_Starfish_A
Target triangles: 200–800
Texture: 256–512

Create:
- A
- B

## IO_Shell_A
Target triangles: 100–500

Create:
- A
- B
- C

## IO_Underwater_Rock_A
Target triangles: 200–1000

Create:
- A
- B
- C

## IO_Seagrass_A
Target triangles: 100–500

Create:
- A
- B

Requirements:
- instancing friendly
- optional simple shader sway

## IO_Driftwood_A
Status: **erstellt** (2026-10-27), A, B und C. Details: `driftwood/README.md` im Projektordner.

Target triangles: 150–600

Create:
- A
- B
- C

Use:
- world events
- shoreline detail

---

# Terrain Assets

## IO_Terrain_Beach_Test_30m
Approx size: 30 m x 30 m

Requirements:
- sand beach
- transition into shallow water
- small elevation variation
- room for hut/camp
- clean UVs
- supports material blending

## IO_Seafloor_Test_30m
Requirements:
- shallow sandy seabed
- gentle depth transition
- room for underwater rocks
- compatible with caustics
- visible through transparent water

---

# Materials

## Wood
- IO_MAT_Wood_Light
- IO_MAT_Wood_Medium
- IO_MAT_Wood_Dark

Runtime variants later:
- dry
- wet
- weathered
- charred

## Palm / Leaf
- IO_MAT_PalmLeaf_Fresh
- IO_MAT_PalmLeaf_Dry
- IO_MAT_PalmLeaf_Mixed

## Rock
- IO_MAT_Rock_Gray
- IO_MAT_Rock_Warm
- IO_MAT_Rock_Dark

Wetness should preferably be runtime-controlled.

## Ground
- IO_MAT_Sand_Dry
- IO_MAT_Sand_Wet
- IO_MAT_Soil
- IO_MAT_Mud
- IO_MAT_Clay

---

# Assets NOT to Bake in Blender

## Water
Runtime shader handles:
- transparency
- depth color
- moving normals
- refraction
- reflection
- shoreline foam
- wave mask
- caustics

Blender supplies:
- coastline geometry
- seafloor
- optional water plane reference

## Fire
Blender supplies:
- stones
- wood
- pot if needed

Browser handles:
- flame
- glow
- smoke
- dynamic light

## Shore Foam
Browser shader.

## Caustics
Browser shader.

## Rain / Fog / Lightning
Browser runtime effects.

---

# First 20 Assets to Produce

1. IO_Palm_A (erstellt)
2. IO_Palm_B (erstellt)
3. IO_Rock_Large_A (erstellt)
4. IO_Rock_Large_B (erstellt)
5. IO_Stone_Small_A (erstellt)
6. IO_Fern_A (erstellt)
7. IO_Bush_Tropical_A (erstellt)
8. IO_Grass_Clump_A (erstellt)
9. IO_Hut_A (erstellt)
10. IO_Character_A (erstellt, v1)
11. IO_Log_Long_A (erstellt)
12. IO_Log_Short_A (erstellt)
13. IO_Plank_Long_A
14. IO_Plank_Short_A
15. IO_Pole_Long_A
16. IO_Fiber_Binding_A (erstellt)
17. IO_Campfire_Stone_A
18. IO_Workbench_A
19. IO_Seagull_A
20. IO_Starfish_A

Plus:
- IO_Terrain_Beach_Test_30m
- IO_Seafloor_Test_30m

---

# Naming Convention

Use:

`IO_<Category>_<Name>_<Variant>`

Examples:
- IO_Palm_A
- IO_Rock_Large_B
- IO_Plank_Long_A
- IO_Log_Short_A
- IO_Hut_A

LOD naming:
- IO_Palm_A_LOD0
- IO_Palm_A_LOD1
- IO_Palm_A_LOD2
- IO_Palm_A_LOD3

Collision:
- IO_Palm_A_COL

---

# Export Checklist

Before GLB export:

- [ ] correct real-world scale
- [ ] transforms applied
- [ ] origin/pivot correct
- [ ] normals correct
- [ ] no duplicate/internal geometry
- [ ] UVs valid
- [ ] material names standardized
- [ ] collision proxy present if needed
- [ ] sockets/empties named correctly
- [ ] LODs included or separately exportable
- [ ] no unsupported Blender-only shader nodes
- [ ] animation clips named correctly
- [ ] GLB re-import test passes

---

# Browser Performance Principle

Prefer:

> good silhouette + good material + good lighting

over:

> high polygon count

The elevated IslandOne camera allows aggressive optimization without strongly affecting perceived quality.

---

# Vertical Slice Success Criteria

The first asset set is successful when the browser can show:

- stylized tropical beach
- IslandOne reference-style hut
- several palms
- dense-looking vegetation through instancing
- rocks
- character
- modular wood pieces
- campfire setup
- transparent shallow water
- visible seabed
- shoreline foam
- caustics
- simple HUD

while remaining interactive and browser-friendly.
