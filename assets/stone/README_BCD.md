# Kleine Steine IO_Stone_Small_B, _C, _D (stone_v1)

Drei lose Steine für `stones` in island-sim, die die Simulation nach Form unterscheidet:

- **B, rund:** ein Rollstein, gut als Hammer.
- **C, flach:** ein flacher Scheibenstein, als Unterlage oder Klinge.
- **D, kantig:** ein gebrochener Stein mit heller, frischer Bruchfläche und Schneide.

Die Steine liegen am Spülsaum und an den Felsen. Man kann sie aufheben, als Werkzeug nutzen oder in einen Feuerring legen.

Sie gehören zur selben Felsfamilie wie `IO_Stone_Small_A` und `IO_Rock_Large_A/B`. Gebaut sind sie mit denselben Schritten, demselben Shader und derselben Palette. Das Material ist dasselbe `IO_MAT_Rock_Gray`, und der Build-Maßstab ist derselbe wie bei Stein A, damit das Oberflächenmuster in Wirklichkeit gleich groß ist.

Erzeugt wird alles vom Skript `islandone_stone_bcd.py` (Blender 5.2.2, läuft auch als `bpy`-Paket). Vorlagen waren `refs/IO_Stone_Small_BCD.png` für die Formen sowie Stein A und die großen Felsen für Farbe und Stil. Die Dateien von Stein A in diesem Ordner sind unverändert.

## Urheber

Eigene Arbeit von IslandOne. Es stecken keine fremden Modelle, Texturen oder Scans darin. Der Vermerk steht im GLB (`asset.copyright`, `asset.extras`), am Wurzelknoten (`copyright`) und in `stone_bcd.json`.

## Inhalt

| Datei | Zweck |
|---|---|
| `IO_Stone_Small_B.glb`, `_C.glb`, `_D.glb` | je ein GLB: Wurzel mit `_LOD0`, `_LOD1`, `_LOD2`, `_COL`, `SOCKET_GRIP`, `SOCKET_BIND` (C und D zusätzlich `SOCKET_EDGE`). glTF 2.0, Y-up, Meter, Texturen als JPEG eingebettet, 74 / 75 / 78 KB |
| `textures/IO_Stone_Small_<B,C,D>_LOD<n>_BaseColor/_Roughness/_Normal.png` | PNG-Quellen der gebackenen Texturen (27 Bilder) |
| `stone_bcd.json` | Manifest mit Maßen, Dreiecken, Texturen, UV-Werten, Collider, Sockets (Blender- und glTF-Koordinaten), Schneide, Laufzeitzuständen und dem Ergebnis der Re-Import-Prüfung |
| `islandone_stone_bcd.blend` | Blender-Datei mit gepackten Texturen |
| `islandone_stone_bcd.py` | Erzeuger-Skript |
| `render_hero_BCD.png`, `render_compare_BCD_gameplay.png` | B, C und D nebeneinander, Schauansicht und Spielkamera mit 40° |
| `render_family_ABCD.png` | Stein A mit B, C und D (Familienvergleich) |
| `qa/IO_Stone_Small_<V>_1…7_*.png` | pro Stein: 1 Dreiviertel vorn, 2 Dreiviertel hinten, 3 Seite, 4 Spielkamera 40°, 5 360°-Blatt (8 Winkel aus 40° plus von oben), 6 LOD-Vergleich (oben nah, unten in der jeweiligen Spieldistanz 4 / 10 / 22 m), 7 neben der Vorlage (oben schräg, unten flach) |
| `qa/sockets_bind_preview.png` | Prüfbild für die Socket-Regel: an jedem Stein ein Teststock, angesetzt nach `SOCKET_BIND`, rote Linie entlang der Schneide |
| `qa/context_shoreline_gameplay.png` | nur für die QA: A, B, C und D am Strand neben `IO_Rock_Large_A`, Spielkamera mit 40°. Nichts davon ist Teil der Assets |
| `refs/IO_Stone_Small_BCD.png` | Vorlage |

`README.md`, `stone.json`, `islandone_stone.py/.blend`, `qa/qa_*` und `textures/IO_Stone_Small_A_*` gehören weiter zu Stein A.

## Maße, Dreiecke, Texturen

| Stein | Form | Größe x × y × Höhe | Vorgabe |
|---|---|---|---|
| B | rund | 0,15 × 0,13 × 0,11 m | 0,15 × 0,13 × 0,11 |
| C | flach | 0,16 × 0,11 × 0,04 m | 0,16 × 0,11 × 0,04 |
| D | kantig | 0,13 × 0,09 × 0,07 m | 0,13 × 0,09 × 0,07 |

| Knoten | B | C | D | Vorgabe | Textur | Distanz (Extra) |
|---|---|---|---|---|---|---|
| `_LOD0` | 380 | 340 | 320 | 150–400 | 256 px | bis 8 m |
| `_LOD1` | 130 | 120 | 110 | 60–150 | 128 px | bis 18 m |
| `_LOD2` | 44 | 40 | 40 | 20–50 | 64 px | bis 35 m |
| `_COL` | 16 | 16 | 16 | unter 16 | – | unsichtbar |

Ab 50 m ausblenden (`cull_distance_m`).

- **Material:** 1 Material, `IO_MAT_Rock_Gray`. Im GLB gibt es drei Einträge mit diesem Namen, einen pro LOD mit dessen gebackenen Texturen, so wie bei Stein A. Es ist nicht metallisch, einseitig und deckend.
- **Texturen:** Pro LOD gibt es Base Color, Roughness (glTF-Kanal G) und Normal (Tangent Space, OpenGL/glTF). Das macht 9 Bilder pro Stein, im GLB zusammen etwa 60 KB. Es gibt keine AO-Map und kein eingebackenes Licht. Vertiefungen sind leicht in die Base Color eingefärbt, wie bei der ganzen Felsfamilie.
- **UVs:** Smart UV pro LOD, ohne Überlappung, alles in 0–1. Die Belegung liegt bei 39–57 %. Die Texeldichte ist gleichmäßig: 80 % der Flächen liegen zwischen 0,7× und 1,16× des Medians, nur LOD2 von B reicht bis 1,31×. Bei LOD0 sind das 690 (B), 920 (C) und 1090 (D) px/m, bei Stein A etwa 600 px/m.

## Formen

Alle drei Steine entstehen aus einer konvexen Hülle mit Ebenenschnitten und leichter Erosion. Danach wird jeder Stein genau auf die Vorgabe skaliert.

- **B, rund:** ein Ei-Ellipsoid, auf einer Seite (+X) etwas dicker. Nur wenige, flache Schnitte, dazu Voxel-Remesh und 4 Glättungsschritte. Er hat eine kleine flache Auflage unten. Aus jeder Richtung liest er sich als glatter, runder Stein mit ganz leichten Facetten wie in der Vorlage.
- **C, flach:** eine Superellipsen-Scheibe mit flacher Ober- und Unterseite. 9 schräge Randschnitte geben die gefaste, facettierte Kante aus der Vorlage. Die Scheibe wird nach vorn (+Y) dünner, und dort liegt die Schneide (Keilwinkel etwa 33°).
- **D, kantig:** ein Brocken mit unregelmäßigem Grundriss und einem Grat, der nach hinten versetzt ist. Dazu kommen 10 tiefe und 5 mittlere Schnitte und 4 Abplatzungen, und zwar ohne Remesh, damit die Facetten hart bleiben. Vorn unten ist er unterschnitten.
  - Nach der Erosion entstehen zwei frische Bruchflächen vorn und vorn rechts mit harten Kanten. Sie sind heller als der verwitterte Stein (kein Sonnen- und kein Höhlenton), feiner gekörnt und haben schwache muschelige Ringe in der Normal-Map.
  - Die Schneide liegt vorn, wo die Bruchfläche auf die Unterschneidung trifft. Sie ist etwa 8 cm lang und liegt 0,5–2 cm über dem Boden, mit einem Keilwinkel von etwa 70°.
  - Die Bruchfläche ist etwa 55 cm² groß und von oben und vorn gut zu sehen.

Aus der Spielkamera unterscheiden sich die drei Steine schon im Umriss: B ist ein hoher, runder Buckel, C eine flache Scheibe und D ein kantiger Brocken mit heller Fläche (siehe `render_compare_BCD_gameplay.png` und `qa/context_shoreline_gameplay.png`).

## Regeln im Spiel

- **Pivot:** Der Ursprung liegt in der Mitte der Grundfläche auf Bodenhöhe (Z = 0, glTF y = 0), wie bei Stein A. Die flache Unterseite reicht 4 mm unter den Boden (z = −0,004), damit der Stein auf Sand nicht schwebt. Alle Transformationen sind angewendet: Wurzel und LOD-Knoten haben Position 0, keine Drehung und Skalierung 1.
- **Achsen:** Die Längsachse ist +X. Bei C und D zeigt die Schneide nach vorn (+Y in Blender, −Z in glTF), der dicke Rücken liegt bei −Y.
- **Sockets** sind Empties `SOCKET_<NAME>`. Die lokale +Z-Achse (glTF +Y) ist die Socket-Normale, die lokale +X-Achse die Richtung „entlang“. Positionen und Achsen stehen auch in `stone_bcd.json` und als Extra `sockets` am Wurzelknoten.

| Socket | B | C | D |
|---|---|---|---|
| `GRIP` (Hand) | Mitte, halbe Höhe (0, 0, 0,055) | hintere Hälfte (0, −0,027, 0,020), Schneide frei | hintere Hälfte (0, −0,020, 0,035), Schneide frei |
| `BIND` (Stock) | oben auf der Mitte (0, 0, 0,104). Der Stock läuft quer zur Längsachse (lokal +X = Welt +Y) und wird um die Taille gebunden, so wird B zum Hammerkopf mit den Schlagflächen an den Enden ±X | am Rücken (0, −0,055, 0,020). Der Stock liegt längs am Rücken, parallel zur Schneide (lokal +X = Welt +X), wie bei einem Beil | am Rücken (0, −0,040, 0,035), Regel wie bei C |
| `EDGE` (Schneide) | – | Mitte der Schneide (0,004, 0,055, 0,016), Normale nach außen, +X entlang der Schneide | Mitte der Schneide (−0,009, 0,044, 0,010), Normale nach außen, +X entlang der Schneide |

  Bei `BIND` liegt die Stockachse im Abstand des Stockradius entlang der lokalen +Z-Achse. Anfang und Ende der Schneide stehen im Extra `edge` (Blender und glTF), zusammen mit Länge und Keilwinkel.
- **Laufzeitzustände** (Extra `states`, nichts davon ist eingebacken):
  - **liegend:** der Normalfall. Der Stein liegt mit zufälliger Drehung um die Hochachse auf dem Boden, jedes LOD geht.
  - **gehalten:** `SOCKET_GRIP` an den Handknochen hängen.
  - **gebunden:** den Stock nach `SOCKET_BIND` ausrichten. B wird zum Hammerkopf, C und D zur Klinge; `SOCKET_EDGE` zeigt dann vom Stock weg.
  - **nass:** Base Color mit 0,6 multiplizieren und die Rauheit auf etwa 0,3 setzen, wie bei Stein A.
- **Collider:** `IO_Stone_Small_<V>_COL`, eine konvexe Hülle mit 16 Dreiecken (10 Punkte), ohne Material. Im Spiel unsichtbar schalten.
- **Instanzen:** Für viele Steine dieselbe Mesh-Instanz mit zufälliger Drehung um die Hochachse und leichter Skalierung (0,85–1,15) verwenden.
- **Metadaten am Wurzelknoten:** `asset_id`, `kit`, `family`, `category`, `sim_kind` (`stones`), `shape` (`round` / `flat` / `jagged`), `tool_role`, `sim_uses`, `usage`, `pickup`, `pivot`, `lod_nodes`, `lod_max_distance_m`, `cull_distance_m`, `dimensions_m`, `embed_depth_m`, `material_id`, `collision_node`, `collision_type`, `walkable`, `wetness`, `states`, `sockets`, `edge` (C und D), `copyright`.

## Blender-Szene

Die Collections sind `IslandOne_Nature > IO_Stone_Small > IO_Stone_Small_<V> > _LOD0 / _LOD1 / _LOD2 / _Collision / _Sockets`.

- Die drei Steine stehen in der .blend nebeneinander zur Ansicht; exportiert wird jeder am Ursprung.
- LOD1, LOD2 und COL sind nur im Viewport ausgeblendet.
- In der .blend heißen die Sockets `SOCKET_<NAME>.<V>`, weil Blender eindeutige Namen braucht. Im GLB heißen sie `SOCKET_<NAME>`.
- Es gibt keine Modifier, keine versteckte Geometrie und keine ungenutzten Datenblöcke.

## Prüfung

Zum Schluss lädt das Skript jedes GLB in eine leere Szene und liest zusätzlich das glTF-JSON. Geprüft werden:

- Wurzel und Metadaten, Transformationen angewendet
- LOD0–2 vorhanden und im Dreiecksbudget
- UVs vorhanden und in 0–1
- Materialname `IO_MAT_Rock_Gray` mit drei Texturen
- Größe in x, y und z innerhalb von 12 % der Vorgabe, nach dem Import Z oben (also richtig ausgerichtet)
- Unterkante bei −4 mm, Ursprung mittig
- Normalen nach außen, Mesh geschlossen und aus einem Stück
- Collider vorhanden, konvex, geschlossen, höchstens 16 Dreiecke, ohne Material
- genau die verlangten Sockets mit richtiger Position und Ausrichtung

Ergebnis dieses Laufs: **3/3 ok** (steht auch in `stone_bcd.json`).

Checkliste aus der Vorgabe:

- [x] drei Formen klar verschieden (`render_compare_BCD_gameplay.png`, Kontextbild)
- [x] dieselbe Familie wie Stein A (`render_family_ABCD.png`: gleiches Material, Shader, Palette und Oberflächenmaßstab)
- [x] D liest sich scharf: harte Facetten, helle Bruchfläche, Schneide vorn
- [x] passt zur Vorlage und zum IslandOne-Stil (`qa/*_7_vs_reference.png`)
- [x] funktioniert aus 360° und aus der erhöhten Kamera (`qa/*_5_360.png`, `qa/*_4_gameplay_40deg.png`)
- [x] LODs, Collider und Sockets wie verlangt benannt
- [x] Pivot sinnvoll, Transformationen angewendet
- [x] 1 Material, 3 Texturen pro LOD
- [x] GLB-Export und sauberer Re-Import

## Abweichungen von der Vorgabe

- **Farbe heller als die Vorlage:** Die Vorlage ist wärmer und dunkler beige. Verlangt war aber „dasselbe Grau wie Stein A und die großen Felsen“, deshalb nutzen die Steine genau deren Palette. Das Muster der Vorlage (feine Zellen, harte Facetten) ist übernommen.
- **D flacher als in der Vorlage:** In der Vorlage ist D eher eine hohe Pyramide. Die Vorgabe 0,13 × 0,09 × 0,07 m hat Vorrang, deshalb ist D ein niedrigerer Brocken mit Grat.
- **Texturen pro LOD 256 / 128 / 64 px** statt eines gemeinsamen Satzes mit 256–512 px. Das ist dasselbe Schema wie bei Stein A und den Felsen, bei einem 15-cm-Stein reichen 256 px für LOD0 (690–1090 px/m, mehr als Stein A).
- **Material in Blender pro Stufe** `IO_MAT_Rock_Gray_<V><n>`, weil jede Stufe eigene Texturen hat. Im GLB heißen alle `IO_MAT_Rock_Gray`. Die Felsfamilie hat keine gemeinsame Kacheltextur, die man direkt wiederverwenden könnte; wiederverwendet sind Material, Shader und Palette.
- **Keine Materials-Collection:** Materialien sind in Blender keine Objekte und lassen sich keiner Collection zuordnen.
- **Keine eigene AO-Map:** wie bei der ganzen Felsfamilie.
- **Keilwinkel D etwa 70°:** Die Schneide ist sichtbar scharf, aber kein Messer. Die Simulation entscheidet ohnehin über `shape`. Ein spitzerer Winkel hätte D zu einer flachen Scheibe gemacht, die man mit C verwechselt.
- **Kontextbild:** Es zeigt die Steine auf der Test-Strandfläche (`terrain/`) neben `IO_Rock_Large_A`. Von oben sieht man beim Felsen vor allem seine große schräge Deckfläche.

## Neu erzeugen

```bash
pip install bpy==5.2.2      # oder Blender 5.2 mit --background --python ... --
python3 islandone_stone_bcd.py --out . --render \
    --ref refs/IO_Stone_Small_BCD.png --assets ..
```

`--assets` ist der Ordner mit `rock/`, `stone/` und `terrain/`; von dort wird für Familien- und Kontextbild nur gelesen.

Ohne `--render` dauert ein Lauf etwa 30 s (Cycles-Bake). Mit Render und 48 Samples sind es auf 4 CPU-Kernen etwa 35 min. `--samples N` setzt die Render-Samples. Alles ist per Seed festgelegt, derselbe Lauf erzeugt dieselben Steine.
