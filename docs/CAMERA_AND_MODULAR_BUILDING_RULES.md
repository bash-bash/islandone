# IslandOne – Camera & Modular Building Rules

## Purpose

This document defines how important runtime assets must be built for a rotatable browser-game camera and how buildings — starting with the first hut — must be delivered both as complete showcase assets and as reusable modular parts.

---

# 1. Camera Rule

IslandOne should use a controlled orbit-style gameplay camera.

The spectator should be able to:

- rotate around the character / scene
- zoom in and out
- slightly change elevation / tilt
- focus on the character
- focus on important events
- inspect constructions from different angles

The default experience is NOT a fixed camera.

The default experience is also NOT unrestricted first-person.

Preferred style:
- slightly elevated
- third-person / isometric-like
- smooth orbit
- readable game composition

---

# 2. 360 Degree Asset Requirement

All important runtime assets must be visually complete from 360 degrees.

This includes:

- huts
- buildings
- workbenches
- docks
- rafts
- tools
- containers
- large props
- characters
- modular constructions

Do not build important assets that only look correct from one camera direction.

The backside, side walls, roof backside, lower edges and visible interior surfaces must be properly modeled and textured where the camera can reach them.

Exception:

Camera-facing geometry / billboard tricks are allowed only for explicitly optimized assets such as:

- grass
- distant foliage
- distant tree impostors
- some particle effects

---

# 3. First Hut Delivery

The first hut must be delivered in TWO forms.

## A. Complete Showcase Hut

Asset name:

`IO_Hut_A_Full`

Purpose:

- graphics vertical slice
- visual quality reference
- browser rendering test
- lighting / material benchmark
- art-direction master asset

Requirements:

- full 360 degree geometry
- complete front
- complete back
- complete left side
- complete right side
- complete roof from all angles
- no missing unseen surfaces
- warm brown / tan thatch roof
- wooden frame / plank construction
- matching current IslandOne visual reference
- real-world scale
- clean UVs
- PBR-ready materials
- simple collision shell
- GLB / glTF exportable

This asset is for presentation and benchmarking only.

Gameplay must NOT depend on a single `spawn_hut()` action.

---

# 4. Modular Hut Kit

The same hut design must also exist as a modular kit.

Recommended asset set:

```text
IO_HutKit_Post_A
IO_HutKit_Post_B

IO_HutKit_Beam_Short_A
IO_HutKit_Beam_Long_A

IO_HutKit_WallPanel_A
IO_HutKit_WallPanel_B
IO_HutKit_WallPanel_Window_A

IO_HutKit_DoorFrame_A
IO_HutKit_Door_A

IO_HutKit_FloorSection_A

IO_HutKit_RoofSection_A
IO_HutKit_RoofSection_B
IO_HutKit_RoofEdge_A
IO_HutKit_RoofCap_A

IO_HutKit_ThatchBundle_A
IO_HutKit_ThatchBundle_B

IO_HutKit_Binding_A
```

The final hut should be reproducible approximately from these parts.

The modular kit should allow:

- unfinished huts
- damaged huts
- repaired huts
- wider huts
- longer huts
- roof extensions
- partial walls
- new layouts
- AI-created variants

---

# 5. Construction Principle

A building is not one semantic object in the simulation.

Instead:

```text
Building
  |
  +-- Part
  +-- Part
  +-- Part
  +-- Joint
  +-- Joint
```

Example:

```text
construction_104

parts:
- IO_HutKit_Post_A instance 17
- IO_HutKit_Post_A instance 18
- IO_HutKit_Beam_Long_A instance 22
- IO_HutKit_WallPanel_A instance 31

joints:
- joint_201
- joint_202
- joint_203
```

The visual result may look like a hut.

The simulation should still understand the individual pieces and connections.

---

# 6. Connection Points / Sockets

Important modular parts should expose attachment points.

Example post:

```text
TOP
BOTTOM
SIDE_A
SIDE_B
SIDE_C
SIDE_D
```

Example beam:

```text
END_A
END_B
TOP
BOTTOM
```

Example wall panel:

```text
LEFT
RIGHT
TOP
BOTTOM
```

Example roof section:

```text
RIDGE
EAVE
LEFT
RIGHT
SUPPORT_A
SUPPORT_B
```

Sockets may be exported from Blender using named empties or equivalent metadata.

Naming must remain stable.

---

# 7. Pivot Rules

For modular assets:

- pivots must be predictable
- pivots should support snapping
- floor-based assets usually use bottom-center
- beams/poles may use center or well-defined endpoint depending on construction logic
- socket locations must not depend on arbitrary transforms

All transforms should be applied before export.

---

# 8. Material Reuse

Prefer shared material families.

Example:

```text
IO_MAT_Wood_Light
IO_MAT_Wood_Medium
IO_MAT_Thatch_Dry
IO_MAT_Fiber
```

Do not create unique materials for every hut part unless necessary.

Benefits:

- lower memory usage
- easier runtime wetness / aging
- consistent art direction
- easier content generation later

---

# 9. Runtime State Variants

Where practical, the same geometry should support runtime material states:

```text
dry
wet
weathered
charred
damaged
```

Avoid creating separate meshes solely for simple surface states.

---

# 10. Damage / Construction Visibility

Important building parts should be individually addressable so IslandOne can later show:

- construction progress
- missing wall
- broken post
- damaged roof
- replaced beam
- burned section
- wet roof
- repair work

Do not merge the entire modular hut into one inseparable gameplay mesh.

The showcase version may be optimized separately.

---

# 11. Recommended First Hut Output

For the first Blender task, request:

## Deliverable 1
`IO_Hut_A_Full.glb`

Complete 360 degree hut.

## Deliverable 2
Modular hut kit as separate GLBs or clearly separated named objects.

## Deliverable 3
Blender source file.

## Deliverable 4
Front render.

## Deliverable 5
Side render.

## Deliverable 6
Back render.

## Deliverable 7
Three-quarter render.

## Deliverable 8
Exploded-view render showing the modular pieces.

---

# 12. Exploded View

Create a clean neutral-background reference image showing:

- complete hut
- structural posts
- beams
- wall panels
- roof sections
- bindings

The exploded view is primarily for:

- coding agents
- construction-system design
- Blender asset QA
- future procedural building logic

---

# 13. Browser Rendering Constraint

The hut must remain suitable for a browser game.

Recommended complete hut target:

```text
LOD0: 15k-35k triangles
LOD1: 7k-15k
LOD2: 2k-6k
```

These are guidelines, not strict hard limits.

Use visual quality where it matters:

- silhouette
- roof shape
- wood profile
- large construction details

Avoid unnecessary geometry in:

- hidden overlaps
- tiny rope fibers
- microscopic damage
- invisible interior geometry

---

# 14. Camera QA Test

Before accepting an asset, inspect it from:

```text
0 degrees
45 degrees
90 degrees
135 degrees
180 degrees
225 degrees
270 degrees
315 degrees
```

Also inspect:

- slightly above
- default game-camera height
- moderately zoomed in

Reject the asset if obvious missing geometry, missing materials or fake one-sided construction becomes visible.

---

# 15. First Browser Camera Prototype

The graphics vertical slice should support:

```text
Orbit
Zoom
Focus Character
Focus Event
Reset View
```

Suggested constraints:

- minimum camera height
- maximum camera height
- minimum zoom
- maximum zoom
- limited downward/upward pitch

The camera should not easily enter geometry.

---

# 16. Core Rule

Important IslandOne assets must be built for the world, not for a screenshot.

Reference images may show only selected angles.

Runtime assets must survive a rotating spectator camera.

---

# 17. Recommended Agent Prompt for the First Hut

```text
Create IO_Hut_A based on the supplied IslandOne hut reference.

Important:
This is a runtime game asset for a rotatable browser-game camera.

Do not model only the visible reference angle.

The hut must be fully modeled and textured from 360 degrees:
front, rear, both sides, roof rear, visible underside and all camera-reachable surfaces.

Deliver both:

1. IO_Hut_A_Full
   - finished complete hut
   - used as art-direction and browser-rendering reference

2. IO_HutKit_A
   - reusable modular parts matching the complete hut
   - posts
   - beams
   - wall panels
   - door/frame
   - floor section
   - roof sections
   - roof cap/edge
   - thatch bundles
   - fiber bindings

Use stable pivots and named attachment sockets.

Art direction:
premium stylized real-time tropical survival game.

Roof:
dry warm tan/brown thatch.
Do not make the roof green.

Export target:
GLB / glTF 2.0.

Also provide:
- front render
- side render
- back render
- three-quarter render
- exploded modular-parts render
```
