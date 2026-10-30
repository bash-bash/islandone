# Gebundene Stücke IO_Bound_A (bound_v1)

Zwei Varianten für `bound` in island-sim: Die Figur bindet zwei gefundene Stücke mit Faser zusammen. Die Simulation speichert die Teile und wie fest die Verbindung hält.

- **`IO_Bound_A_StickStone`**: `IO_Branch_A` als Stiel, `IO_Stone_Small_D` seitlich an das dünne Ende (END_B) gebunden, wie ein grobes Beil.
- **`IO_Bound_A_StickStick`**: zwei `IO_Branch_A`, nahe ihren dicken Bruchenden unter 62° gekreuzt und mit einer Kreuzbindung verbunden.

Das Asset ist ein **Zusammenbau der vorhandenen Teile, kein neues Design**. Rinde und Stein sind die Meshes aus den GLBs der Teile, unverändert und nur verschoben und gedreht. Die Bindung ist die JointWrap des Faserbausatzes, erzeugt von dessen eigenem Skript (`fiber/islandone_fiber.py`, Funktion `build_wrap`) für die echten Bauteilmaße. Es gibt kein neues Material und keine neue Textur.

Erzeugt wird alles von `islandone_bound.py` (Blender 5.2.2, läuft auch als `bpy`-Paket), die Renders macht `bound_render.py`. Vorlagen: das Strandcamp-Bild (`refs/Tropisches Inselcamp am Strand.png`) und die QA-Renders der Teile.

## Urheber

Eigene Arbeit von IslandOne. Keine fremden Modelle, Texturen oder Scans. Der Vermerk steht im GLB (`asset.copyright`, `asset.extras`), am Wurzelknoten (`copyright`) und in `bound.json`.

## Inhalt

| Datei | Zweck |
|---|---|
| `IO_Bound_A_StickStone.glb`, `IO_Bound_A_StickStick.glb` | je Wurzel mit `_LOD0`, `_LOD1`, `_LOD2` (je mit Morph Target `Loose`), `_COL`, `SOCKET_GRIP`, `SOCKET_HEAD`, `SOCKET_JOINT`. glTF 2.0, Y-up, Meter, Texturen als JPEG eingebettet |
| `bound.json` | Manifest: Maße, Dreiecke, Materialien und Texturquellen, Sockets (Blender und glTF), Kollisionskapseln, Zustände, Bindungsparameter, Ergebnis der Re-Import-Prüfung |
| `islandone_bound.blend` | Blender-Datei, Texturen gepackt |
| `islandone_bound.py`, `bound_render.py` | Erzeuger und Render-Skript |
| `textures/README.md` | Verweis auf die Texturen der Teile (keine neuen Texturen) |
| `render_hero.png`, `render_compare_gameplay.png` | beide Varianten nebeneinander, Schauansicht und Spielkamera 40° |
| `qa/IO_Bound_A_<V>_1…8_*.png` | pro Variante: 1 Dreiviertel vorn, 2 Dreiviertel hinten, 3 Seite, 4 Spielkamera 40°, 5 360°-Blatt (8 Winkel aus 40° plus von oben), 6 LOD-Vergleich (oben nah, unten in Spieldistanz 5 / 15 / 35 m), 7 neben den Vorlagen, 8 Laufzeitzustände (fest, `Loose` = 1, gehalten) |
| `qa/context_camp_gameplay.png`, `qa/context_camp_close.png` | nur QA: beide Varianten im Sand am Camp neben `IO_Character_A` (Maßstab), dazu Feuerstellensteine. Nichts davon gehört zum Asset |
| `refs/Tropisches Inselcamp am Strand.png` | Weltvorlage |

## Maße, Dreiecke, Texturen

| Variante | Maße x × y × z (m) | LOD0 | LOD1 | LOD2 | COL |
|---|---|---|---|---|---|
| StickStone | 0,89 × 0,23 × 0,10 | 1.202 | 398 | 152 | 32 |
| StickStick | 0,89 × 0,79 × 0,14 | 1.150 | 384 | 152 | 32 |
| Vorgabe | | 600–1.500 | 250–600 | 80–200 | |

Aufteilung (gleich für beide Stiele): Ast 268 / 96 / 40, Stein D 320 / 110 / 40, Bindung 614 / 192 / 72 (StickStone 614 / 192 / 72 inklusive loses Ende). LOD-Distanzen als Extra am Knoten: bis 10 / 25 / 50 m, ab 70 m ausblenden.

- **Materialien:** StickStone 3 (`IO_MAT_Wood_Bark`, `IO_MAT_Rock_Gray`, `IO_MAT_Fiber_Dry`), StickStick 2 (Rinde, Faser). Genau die Materialien der Teile mit deren Texturen. `IO_MAT_Rock_Gray` steht wie im GLB des Steins dreimal im GLB, einmal pro LOD mit dessen Texturen.
- **Texturen:** keine neuen. Rinde 3 × 512 px (`../branch/textures/`), Faser 3 × 512 px (`../fiber/textures/`), Stein pro LOD 3 × 256 / 128 / 64 px (`../stone/textures/`). Im GLB als JPEG: StickStone 15 Bilder, StickStick 6. GLB-Größe 422 KB / 366 KB.
- **UVs:** die der Teile, unverändert. Die Faser hat das UV-Layout des Faserbausatzes: U läuft entlang des Seils, die Seilkachel wiederholt sich (REPEAT); weil das Seil dünner ist, ist eine Kachel hier 0,037 m statt 0,09 m lang, die Texeldichte also proportional gleich.
- **COLOR_0:** die Hohlraum-Abdunklung der Faser wie im Bausatz; Rinde und Stein haben dort Weiß (keine Wirkung).

## Aufbau

1. **Teile laden.** Die drei GLBs werden gelesen, ihre LOD-Meshes übernommen. Die Blätter von Branch A fallen weg (Zustand „vertrocknet“ des Asts, ein Material weniger), die Zweige bleiben.
2. **StickStick.** Ast 1 liegt wie in seiner Ruhelage. Ast 2 ist um 62° gedreht und um die eigene Achse um 180° gewendet, damit seine Zweige nicht in Ast 1 stecken. Er liegt bei x = −0,30 (11 cm vom Bruchende) auf Ast 1. Die Bindung ist die JointWrap-Kreuzbindung (3 Windungen pro Diagonale) für zwei runde Bauteile mit r = 2,1 cm und dem 62°-Winkel; das entspricht `Cross_Angle` der JointWrap.
3. **StickStone.** Stein D ist um 180° gedreht: sein Rücken liegt am Stiel, die Schneide zeigt nach außen (−Y), wie `SOCKET_BIND` des Steins es vorgibt (Stock längs am Rücken, parallel zur Schneide). Der Stiel ist um 1,6° angehoben und liegt auf dem Stein und mit END_A im Sand. Die Windungen sind die zwei Diagonalen der JointWrap (je 3 Windungen, ±20° geneigt), aber jede Windung folgt der konvexen Hülle aus Stiel- und Steinquerschnitt: Das Seil liegt straff an beiden an. Das übernimmt hier die Rolle von `B_Flat`, denn der Stein bringt seine flachen Seiten selbst mit. Das lose Ende franst oben vorn aus.
4. **Ruhelage.** Rinde und Stein werden auf die stabile Fläche ihrer konvexen Hülle gelegt, der Stiel zeigt nach +X, der tiefste Punkt der Teile liegt auf Z = 0. Das Seil unter den Teilen ist flach in den Sand gedrückt und reicht höchstens 4 mm unter Z = 0, wie die 4-mm-Einbettung der Steine.
5. **LODs** sind die LODs der Teile plus die LOD-Stufen der JointWrap (3 / 2 Windungen, LOD2 ein flaches Band pro Diagonale).

Alles ist deterministisch, derselbe Lauf erzeugt dieselben Meshes.

## Regeln im Spiel

- **Pivot:** der GRIP-Punkt, senkrecht auf den Boden projiziert (x = y = 0, Z = 0). Die Stielachse zeigt nach +X, Kopf und Bindung liegen bei +X. Transformationen sind angewendet, Wurzel und LODs ohne Drehung und Skalierung. Blender Z-up, glTF Y-up.
- **Sockets** sind Empties `SOCKET_<NAME>`; lokale +X-Achse entlang des Stiels zum Kopf, lokale +Z-Achse (glTF +Y) ist die Socket-Normale. Positionen und Drehungen in glTF stehen in `bound.json` und als Extra `sockets` an der Wurzel.

| Socket | StickStone (Blender, m) | StickStick (Blender, m) | Zweck |
|---|---|---|---|
| `GRIP` | (0,000; 0,000; 0,026) | (0,000; 0,000; 0,022) | Hand. StickStone: `handle_grip` des Asts, 10 cm vom Griffende. StickStick: Tragegriff (Schwerpunktnähe) von Ast 1 |
| `HEAD` | (0,585; -0,056; 0,039) | (0,336; 0,002; 0,023) | StickStone: Mitte des Steins auf Bindehöhe, +Z zeigt in Richtung der Schneide (Schlagrichtung). StickStick: gebundenes Bruchende von Ast 1 |
| `JOINT` | (0,586; -0,013; 0,040) | (0,225; -0,004; 0,042) | Berührpunkt der Teile in der Bindung; +X entlang des Stiels (Bauteil A), +Z zum zweiten Teil |

- **Laufzeitzustände** (Extra `states`):
  - **liegend:** wie exportiert, beliebig um Z drehen.
  - **gehalten:** `SOCKET_GRIP` an den Handknochen hängen (`qa/*_8_states.png`, rechts).
  - **Verbindungsstärke:** Laufzeitwert der Simulation. Optional zeigt das Morph Target `Loose` eine lockere Bindung: die Windungen werden 18 % weiter und hängen 6 mm durch, Rinde und Stein bewegen sich nicht. Vorschlag: Gewicht = 1 − Stärke.
  - **nass:** nur zur Laufzeit, Base Color × 0,6, Rauheit etwa 0,35 (alle drei Materialien).
- **Collider** `IO_Bound_A_<V>_COL`, ohne Material, im Spiel unsichtbar schalten: eine Kapsel entlang jedes Stiels (umschließendes Vierkantprisma mit Spitzen, 16 Dreiecke, r = 0,024 m), bei StickStone zusätzlich der konvexe Collider von Stein D (16 Dreiecke). Die echten Kapseln (Endpunkte, Radius) stehen als Extra `collision_primitive` an der Wurzel.
- **Metadaten** an der Wurzel: `asset_id`, `family`, `kit`, `category`, `sim_kind` (`bound`), `parts`, `variant`, `usage`, `pivot`, `lod_nodes`, `lod_max_distance_m`, `cull_distance_m`, `dimensions_m`, `material_ids`, `collision_node`, `collision_type`, `collision_primitive`, `sockets`, `morph_targets`, `states`, `copyright`.

## Blender-Szene

```
IslandOne_Crafted
  IO_Bound
    IO_Bound_A_StickStone   _LOD0, _LOD1, _LOD2, _Collision, _Sockets
    IO_Bound_A_StickStick   _LOD0, _LOD1, _LOD2, _Collision, _Sockets
  Materials                 IO_Bound_A_Materials_Swatch (nicht exportiert)
```

Die Collections tragen den Variantennamen als Präfix, weil Blender Namen nur einmal vergibt; ebenso heißen die Sockets in der .blend `SOCKET_<NAME>.<Variante>`, im GLB `SOCKET_<NAME>`. Beide Varianten stehen in der .blend nebeneinander, exportiert wird jede am Ursprung. LOD1, LOD2 und COL sind nur im Viewport ausgeblendet. Keine Modifier, keine versteckten Experimente, keine doppelten Materialien oder ungenutzten Texturen.

## Prüfung

Das Skript lädt jedes GLB in eine leere Szene und liest das glTF-JSON. Geprüft werden: Wurzel und Metadaten, Transformationen angewendet, LOD0–2 vorhanden und im Budget, UVs vorhanden, genau die Materialien der Teile, Morph Target `Loose` an jedem LOD, Teile auf Z = 0 (Seil höchstens 4 mm darunter), Liegen (X-Ausdehnung größer als Z), Normalen nach außen (positives Volumen), Collider vorhanden und ohne Material, alle drei Sockets an der richtigen Stelle, Pivot unter GRIP, Kopf bei +X. Ergebnis dieses Laufs: **2/2 ok** (steht auch in `bound.json`).

Checkliste aus der Vorgabe:

- [x] aus den vorhandenen Teilen gebaut (Meshes der GLBs, Bindung aus dem Faserskript)
- [x] Bindung lesbar, auch aus der Spielkamera (`qa/*_4_gameplay_40deg.png`, Kontextbild)
- [x] liest sich handgemacht: krumme Äste mit Zweigen und Bruchenden, grober Stein, Seil mit ausgefranstem Ende
- [x] passt zu Vorlage und IslandOne-Stil (`qa/*_7_vs_reference.png`)
- [x] funktioniert aus 360° und von oben (`qa/*_5_360.png`)
- [x] LODs, Collider, Sockets wie benannt
- [x] Pivot logisch, Transformationen angewendet
- [x] 2–3 Materialien, keine neuen Texturen
- [x] GLB-Export und sauberer Re-Import

## Abweichungen von der Vorgabe

- **Bindung neu erzeugt statt die JointWrap-GLB zu skalieren.** Der dokumentierte Weg (Skalierung + `B_Flat` + `Cross_Angle`) ist für 17-cm-Stangen gebaut. Für Äste mit 1,3–2,1 cm Radius schrumpft er das Seil auf 1,6–4 mm und quetscht es flach, weil die Skalierung pro Achse verschieden ist; aus der Spielkamera war es nicht mehr zu sehen. Deshalb ruft das Skript die `build_wrap`-Funktion des Faserskripts mit den echten Bauteilmaßen auf: gleiche Kreuzbindung, gleiche Windungszahl pro LOD, gleiches loses Ende, gleiches Material, UV-Layout und COLOR_0. `Cross_Angle` ist dabei als 62°-Scherung angewendet (StickStick); bei StickStone folgen die Windungen der Hülle von Stiel und Stein, was `B_Flat` ersetzt.
- **Seil 9 mm dick statt 22 mm.** Das Verhältnis Seil zu Ast ist damit etwas kräftiger als beim Bausatz (Seil zu Stange), damit die Bindung aus 40° von oben lesbar bleibt. Die Plies-Textur ist im selben Verhältnis kürzer gekachelt.
- **StickStone LOD0 hat 1.202 Dreiecke**, StickStick 1.150, beide im Rahmen. Die Bindung allein hat im LOD0 614 Dreiecke wie die JointWrap.
- **Keine Blätter am Ast.** Branch A hat drei Blätter; als Werkzeugstiel sind sie weggelassen (Zustand „vertrocknet“ des Asts). Das spart ein Material mit Alpha-Maske.
- **Kopf am dünnen Ende.** Branch A legt END_A (dick) als Griffende fest und den Werkzeugkopf Richtung END_B; daran hält sich StickStone.
- **Pivot auf dem Boden unter GRIP** statt im GRIP-Punkt selbst, damit das Asset liegend auf Z = 0 steht. Für den gehaltenen Zustand gibt es `SOCKET_GRIP`.
- **StickStick: gekreuzt, nicht Ende an Ende.** Die JointWrap ist eine Kreuzbindung; gekreuzt liest sie sich von oben am besten.
- **Collider:** zusätzlich zur Kapsel am Stiel ist bei StickStone der Collider des Steins dabei, bei StickStick eine Kapsel pro Ast; mit nur einer Kapsel würde der Kopf bzw. der zweite Ast durch den Boden fallen.
- **Keine eigene Texturmappe** im Ordner `textures/`: es gibt keine neuen Texturen, die README dort verweist auf die Texturen der Teile.
- **Vergleichsbild (7):** Es gibt keine eigene Vorlage. Das Bild zeigt das Asset (gesamt und Bindung nah) neben dem Strandcamp-Bild und den QA-Renders der Teile aus derselben Kamera.
- **Kontextbild:** Die Figur steht in der ersten Pose ihres GLBs, der Sand ist die Test-Strandfläche (`terrain/`).
- **Renders mit Cycles und AgX.** Im Browser wirken die Farben je nach Tonemapping etwas anders.

## Neu erzeugen

```bash
pip install bpy==5.2.2      # oder Blender 5.2 mit --background --python ... --
python3 islandone_bound.py --out . --assets .. --render
```

`--assets` ist der Projektordner mit `branch/`, `stone/`, `fiber/` (Pflicht) sowie `character/`, `terrain/`, `campfire_stone/` (nur für das Kontextbild). Die Teile werden nur gelesen. Ohne `--render` dauert ein Lauf wenige Sekunden, mit Renders etwa 14 Minuten auf 4 CPU-Kernen; `--samples N` (Standard 48, dieser Lauf 32), `--no-blend` lässt die .blend weg. Lage, Winkel und Seil stehen oben im Skript (`HEAD_X`, `CROSS_X`, `CROSS_DEG`, `WRAP_PHI`, `ROPE_R`, `LOOSE_GROW`, `LOOSE_DROP`).
