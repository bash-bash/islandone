# IslandOne - Coding Agent Handoff

## 1. Goal

IslandOne is a persistent browser-based AI world.

The first version starts with one autonomous character on an island. The character should survive, observe, learn, form hypotheses, experiment, fail, adapt, and gradually develop technology without following a predefined tech tree.

Core product question:

> What will the AI try next, what will it learn, and how will its world develop over time?

The spectator primarily watches rather than directly controlling the character.

---

## 2. Development Strategy

Keep two prototypes separate until both are stable.

### island-sim
Purpose:
- autonomous character simulation
- world state
- character knowledge
- observations
- beliefs
- hypotheses
- memories
- strategy fatigue
- capability gaps
- world events
- deterministic simulation runs
- analytics and evaluation

### island-render
Purpose:
- browser rendering
- Blender asset pipeline
- island scene
- water
- vegetation
- character animation
- modular constructions
- HUD/UI
- performance testing

Do not tightly couple simulation and rendering too early.

---

## 3. Recommended Browser Stack

Frontend:
- TypeScript
- Vite
- React for HUD/UI
- Babylon.js for 3D rendering

Rendering:
- Prefer WebGPU when available
- WebGL 2 fallback is required

Assets:
- Blender for authoring
- GLB / glTF 2.0 for runtime
- KTX2 / Basis texture compression where useful

Visual client physics:
- Babylon.js Physics v2
- Havok

Important:

> Havok is visual/client physics only. It is not the canonical source of truth for the simulated world.

---

## 4. Canonical World vs Visual World

There are two physical layers.

### Canonical World Simulation
The simulation/server decides facts such as:
- mass
- structural stability
- buoyancy
- breaking
- burning
- moisture
- durability
- joint strength
- resource quantity
- animal populations
- weather effects

This layer determines what actually happened.

### Browser Visual Physics
The browser visualizes results such as:
- plank falling
- rock rolling
- raft moving
- rope joint breaking
- character falling into water
- logs floating

The browser must not independently invent canonical outcomes.

---

## 5. Hard Product Rules

### No classic tech tree
Do not implement:

```text
Level 1 -> Spear
Level 2 -> Raft
Level 3 -> Metal
```

Technology should emerge from:

```text
Problem
-> Observation
-> Hypothesis
-> Experiment
-> Result
-> Memory
-> Learning
-> Changed future behavior
```

### Objective World != Character Knowledge
The simulation may know:

```text
rock_17 = copper_bearing_material
```

The character may only know:

```text
rock_17:
- unusually heavy
- greenish areas
- behaves differently when hit
```

The character must never automatically receive hidden world facts.

### Discovery != Spawn
A material or property may already exist before the character understands it.

Example:
A copper-bearing rock may sit next to camp for 100 days before the character recognizes that it behaves differently from normal stone.

Already observed facts must not later be contradicted. Unknown properties may be discovered later.

### Character mistakes are allowed
Bad but understandable ideas are desirable.

Example:
The character believes adding a heavy stone under a floating platform will improve stability.

The experiment may fail. That is not a system bug.

A system bug would be the character building an electric motor without ever discovering electricity.

### Learning must change behavior
Do not only store memories.

Learned improvements must affect future planning and preferences.

Example:
If material B makes a more durable cutting edge than normal stone, future cutting-tool planning should prefer material B when available.

### Strategy Fatigue
Repeated similar failures should increase strategy fatigue.

Eventually the character should consider:
- another material
- another geometry
- another location
- another method
- pausing the problem

Do not force immediate success.

### Satisficing
The character does not need to optimize every problem.

It may decide:

> This works well enough for now.

This is desirable because it creates imperfect structures, old technology, later upgrades, and unique world history.

---

## 6. Character Cognitive State

The character should eventually contain at least:

```text
Current State
- health
- hunger
- thirst
- energy
- temperature
- injuries
- mood

Goals
- current goal
- daily goals
- long-term goals

Observations
Beliefs
Hypotheses
Memories
Skills
Questions
Capability Gaps
Strategy History
Preferences
```

---

## 7. Capability Gaps

When repeated attempts cannot solve a problem well enough, create a Capability Gap.

Good:

```text
Problem:
Stone cutting tools break too quickly.

Desired properties:
- more durable
- sharp
- shapeable
```

Bad:

```text
Need:
Iron
```

Capability Gaps describe missing capabilities or properties, not known future technologies.

---

## 8. Latent World

The world should contain more properties than the character understands.

Possible latent content:
- unknown minerals
- useful tree resin
- medicinal plants
- toxic plants
- special fibers
- salt
- clay
- coal-like material
- useful animal behavior

Before generating new world content, search the latent world for an existing solution candidate.

---

## 9. Creator Backlog

If a Capability Gap cannot be satisfied by the current or latent world, the system may create an internal Creator Backlog entry.

Example:

```text
Capability Gap:
Need a durable, shapeable cutting material.

Existing latent world:
No suitable material.

Creator Backlog:
Potential new material family required.
```

The character must not know about the Creator Backlog.

---

## 10. Generated Assets Require Human Review

Future content pipeline:

```text
Capability Gap
-> Creator Backlog
-> AI Content Proposal
-> Automatic Asset / Metadata Generation
-> HUMAN REVIEW
-> Staging Tests
-> Approved World Pack
-> Release
```

Hard rule:

> Automatically generated assets or content must never enter the live world without human approval.

Review should include:
- art style
- scale
- collision
- material properties
- physics values
- spawn rules
- performance
- consistency
- unintended simulation impact

---

## 11. World Events

The island must not be static.

Possible events:

Weather:
- rain
- thunderstorm
- storm
- heat
- cold
- wind shifts

Coast:
- driftwood
- washed-up plants
- shells
- dead fish
- unusual natural objects

Environment:
- fallen branches
- fallen trees
- rockfall
- erosion
- landslide
- lightning fire
- water-level change

Animals:
- migration
- reproduction
- hunting behavior
- fish schools
- changing populations

Important:

> Randomness determines that an event occurs. Its consequences must be causally produced by the world.

Avoid arbitrary reward spawns.

Bad:

```text
5% chance: axe appears
```

Good:

```text
storm
-> stronger waves
-> driftwood
-> material appears on beach
```

---

## 12. Animals and Ecosystem

Animals should eventually have simple population systems.

Example for fish:

```text
population
reproduction_rate
food_availability
water_temperature
migration
fishing_pressure
```

Successful AI strategies may create new future problems.

Example:

```text
efficient fishing
-> fish population decreases
-> catches become harder
-> new food problem
-> new innovation pressure
```

---

## 13. Modular Construction System

Do not depend on prefabricated final objects.

Example primitives:
- short plank
- long plank
- pole
- branch
- log
- rope / fiber binding
- flat stone
- sharp stone
- leaf bundle

A construction is a graph:

```text
construction_82

parts:
- plank_7
- plank_12
- plank_19

joints:
- joint_1: plank_7 <-> plank_12
- joint_2: plank_12 <-> plank_19
```

The system should not need a predefined raft.glb.

Humans may recognize the result as a raft, but the simulation only sees connected parts and their properties.

---

## 14. Blender Asset Rules

Blender assets should be modular and browser-friendly.

Each important asset should have metadata such as:

```text
asset_id
dimensions
material_id
collision_type
attachment_zones
LOD levels
```

Possible connection zones:
- end_a
- end_b
- side_a
- side_b
- top
- surface

Use GLB/glTF as runtime format.

Do not make Blender files runtime dependencies.

---

## 15. Art Direction

Target:

> Stylized real-time 3D that looks premium but remains browser feasible.

Avoid:
- extreme low-poly mobile look
- photoreal AAA
- heavy painterly rendering

Desired qualities:
- readable silhouettes
- vibrant natural palette
- clean PBR/stylized materials
- soft shadows
- attractive sunlight
- modular objects
- slightly stylized shapes
- high readability from elevated camera

Current target style:

> Stylized Real-Time - premium browser survival game.

---

## 16. Camera

Preferred gameplay camera:
- slightly elevated third-person / isometric
- enough distance to hide small geometric imperfections
- readable character and constructions
- free spectator camera later

This camera choice is important for browser performance.

---

## 17. Vegetation

Use GPU instancing / thin instances for repeated vegetation.

Examples:

```text
Palm_01 x 80
Fern_01 x 500
Rock_03 x 150
```

Allow variation through:
- position
- rotation
- scale
- optional color variation

Use LOD.

Avoid one draw call per vegetation object.

---

## 18. LOD Strategy

Example:

```text
LOD0: near
LOD1: medium
LOD2: far
LOD3: billboard or very simple mesh
```

Use for:
- trees
- rocks
- buildings
- complex constructions
- large props

---

## 19. Water System

Water is a major visual feature.

Do not use full real-time fluid simulation.

Build a custom browser-friendly water material/shader.

Recommended stack:

```text
Water
- depth-based color
- transparency
- moving normal map A
- moving normal map B
- refraction
- Fresnel reflection
- shoreline foam
- animated shore-wave mask
- underwater caustics
```

### Water Depth
Shallow water:
- brighter turquoise
- more transparent

Deeper water:
- darker blue / teal
- less transparent

The seafloor should remain visible in shallow areas.

### Animated Surface
Use two scrolling normal maps:

```text
normal A -> direction 1
normal B -> different direction/speed
```

Blend them to create non-repeating movement.

### Shoreline
Create an animated foam/wave mask based on distance/depth near shore.

The wave line should:

```text
move toward shore
-> break / foam
-> fade
-> retreat
-> repeat with noise variation
```

Do not simulate full physical ocean waves.

### Caustics
Use animated projected or UV caustic textures on:
- underwater sand
- rocks
- shallow seabed

This is a high visual-value effect for low relative cost.

### Water Around Objects
Later enhancement:
Generate local foam around:
- rocks
- dock
- raft
- logs

Not required for the first vertical slice.

---

## 20. Lighting

Initial lighting:
- 1 directional sun
- environment/HDR lighting
- limited dynamic shadow casters

Prioritize shadows for:
- character
- hut
- nearby trees
- large rocks

Do not make every plant cast expensive real-time shadows.

---

## 21. Day / Night

Later vary:

```text
sun direction
sun color
sky color
environment intensity
fog
shadow direction
water reflection
```

Start with daytime only for the first rendering prototype.

---

## 22. Post Processing

Use carefully:
- tone mapping
- subtle bloom
- ambient occlusion
- color grading

Avoid initially:
- aggressive depth of field
- heavy motion blur
- film grain
- expensive cinematic effects

Gameplay readability is more important.

---

## 23. UI

Use React + HTML + CSS over the Babylon canvas.

Do not build the main HUD as 3D UI.

Possible HUD:
- health
- hunger
- thirst
- energy
- current thought
- current goal
- event notification
- inspect character
- timeline later

---

## 24. Performance Profiles

Support at least:

LOW:
- WebGL 2
- reduced shadows
- reduced vegetation
- simplified water
- reduced post-processing

MEDIUM:
- standard shadows
- normal vegetation
- shoreline foam
- caustics

HIGH:
- WebGPU when available
- greater view distance
- higher quality shadows
- improved water
- increased vegetation density

Initial performance goals:

```text
Desktop: about 60 FPS target
Weak laptop: 30+ FPS
Tablet later: 30 FPS
```

Do not optimize v1 primarily for smartphones.

---

## 25. Graphics Vertical Slice

Before full game integration, build a small island-render scene.

Target scene:

```text
about 30m x 30m beach

1 character
1 hut
1 campfire
1 dock / primitive platform
several loose planks
several logs
3-5 rocks
1-3 palm variants
several bushes / ferns
shallow transparent water
underwater sand/rocks
shoreline foam
basic caustics
simple HUD
```

Goals:
- match the target reference art direction
- prove Blender -> GLB -> Babylon pipeline
- prove browser water look
- measure FPS
- measure memory
- test asset sizes

Do not build the full island yet.

---

## 26. Simulation Prototype

island-sim should initially have no graphics.

Minimum goals:
- deterministic tick loop
- seeded randomness
- character needs
- world state
- observations
- beliefs
- hypotheses
- memories
- capability gaps
- strategy fatigue
- world events
- event log
- analytics

Run many seeds before integrating a live LLM.

---

## 27. LLM Usage

Do not call a large LLM for every action.

Use deterministic systems for:
- movement
- needs
- resource updates
- routine actions
- physics
- known task execution

Use LLMs later for:
- novel hypotheses
- unusual problems
- experiment design
- important plan changes
- interpretation of new observations
- high-value visible thoughts

---

## 28. Epistemic Firewall

Foundation models know too much.

The character must be restricted to acquired knowledge.

Bad prompt:

> How do I build a raft?

Good context:

```text
Known:
- wood piece A floats
- fiber can bind objects
- single narrow wood pieces roll under body weight

Problem:
cross the water

Allowed:
use only known objects, properties and operations
```

The model should ideally output experiment operations rather than known technology names.

---

## 29. Critic / Behavioral Auditor

The Critic is QA.

It may flag:
- forbidden knowledge
- causal inconsistency
- repeated strategy loops
- failure to use learned knowledge
- unrealistic optimization
- strange system behavior

It must not automatically replace a character's bad-but-valid decision.

A separate model/provider may be used for critic evaluation later.

---

## 30. Important Metrics

Track eventually:
- Survival Duration
- Idle Rate
- Learning Transfer Rate
- Forbidden Knowledge Rate
- Strategy Loop Rate
- Strategy Switch Count
- Hypothesis Count
- Hypothesis Diversity
- Failure Learning Rate
- Capability Gap Count
- Discovery Delay
- Emergent Construction Count
- Causality Score
- Viewer Interest Score

The project is not optimized purely for fastest survival.

---

## 31. First Coding Priorities

### Priority 1 - Simulation Harness
Build island-sim.

No UI, no Blender, no real LLM.

### Priority 2 - Graphics Vertical Slice
Build island-render.

Prove:
- target look
- water
- Blender pipeline
- performance

### Priority 3 - Integrate
Only after both prototypes work independently.

---

## 32. Do Not Build Yet

Do not prematurely build:
- full island
- large asset library
- production multiplayer
- spectator networking
- full day/night cycle
- advanced animal AI
- production LLM routing
- automatic live asset generation
- huge crafting system
- classic crafting recipes
- complex economy
- multiple human characters

---

## 33. Agent Working Rules

When implementing:

1. Read this file before architectural changes.
2. Do not silently replace a product rule with an easier implementation.
3. Keep modules small and replaceable.
4. Prefer seeded deterministic tests.
5. Add regression tests for behavioral bugs.
6. Separate simulation truth from rendering.
7. Document important deviations and decisions.
8. Avoid hidden tech trees.
9. Avoid leaking objective world knowledge to the character.
10. Prefer a small working vertical slice over premature scale.

---

## 34. Immediate Task Selection

If the current task is graphics, build island-render only.

Use:
- TypeScript
- Vite
- React
- Babylon.js

Suggested structure:

```text
src/
  engine/
  world/
  water/
  character/
  constructions/
  ui/
```

If the current task is simulation, build island-sim only.

Do not mix both unless explicitly requested.

---

## 35. Definition of Success - First Graphics Prototype

A browser page loads and shows:
- stylized tropical beach
- transparent shallow water
- visible seabed
- animated water normals
- shoreline foam
- basic caustics
- several instanced plants
- rocks
- a simple character
- modular logs/planks
- simple HUD
- FPS stats

It should feel visually close to the IslandOne stylized real-time reference image while remaining interactive and browser-friendly.

---

## 36. Definition of Success - First Simulation Prototype

A CLI or test runner can execute:

```text
100 seeds x 30 virtual days
```

and produce reproducible metrics including:
- survival
- hypotheses
- capability gaps
- strategy changes
- learning events
- idle rate

The same seed must produce the same result.

The character must not have access to hidden world knowledge.

---

## 37. Guiding Principle

IslandOne should create the feeling:

> We are not watching a scripted survival game. We are watching an artificial character slowly understand and reshape its world.

Protect that principle when making technical tradeoffs.
