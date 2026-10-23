# Figurencheck

`check_character.py` prüft eine animierte Figur (GLB mit Mixamo-Skelett, z. B. `IO_Character_A.glb`) auf Rig- und Animationsfehler, die man auf Standbildern leicht übersieht. Es läuft in Blender (4.2 oder neuer) oder mit Blender als Python-Modul (`pip install bpy`, Python 3.13), ohne GPU.

```bash
# im Ordner des Assets (findet character.json daneben automatisch)
blender -b -P check_character.py -- IO_Character_A.glb --anims source_anims/
# oder
python check_character.py IO_Character_A.glb --anims source_anims/ --json qa/check_report.json
```

Exit-Code 1, sobald ein Check FAIL meldet, damit es nach dem Export automatisch laufen kann.

## Was geprüft wird

| Check | Was | Grenze |
|---|---|---|
| struktur | ein Armature, alle Mixamo-Hauptknochen, geskinntes Mesh, alle Clips aus `character.json` | |
| massstab | Höhe, tiefster Punkt auf dem Boden, Bounding Box mittig über dem Pivot | 1,55–1,95 m, ±3 cm, 10 cm |
| skin | Vertices ohne Gewicht, mehr als 4 Einflüsse, Gewichtssumme ≠ 1 | |
| arme | pro Clip nach `"arms"` im Manifest: `relaxed` (Stehen) = Hand höchstens 0,4 Armlängen vor dem Schultergelenk und nicht über die Körpermitte; `swing` (Gehen) = nur Körpermitte; `carry`/`free` = keine Vorgabe | |
| verdrehung | Twist von Unterarm und Hand gegenüber dem Elternknochen (Bonbonpapier-Effekt) | WARN > 100°, FAIL > 140° |
| knie | Knie knickt nicht nach hinten durch | 2 cm |
| root_motion | `in_place`-Clips bleiben am Ort, sonst Weg wie `root_motion_m` | 15 cm |
| quelle | mit `--anims`: Gelenkrichtungen jedes Clips gegen die Mixamo-Datei aus `source_file` | WARN > 3°, FAIL > 10° |

Alle Messungen nutzen Gelenkpositionen und Rotationen gegenüber der Ruhepose, nicht die Knochenachsen, weil der glTF-Import in Blender die Achsen rät.

## Manifest-Felder

Pro Eintrag in `animations` von `character.json`:

```json
{ "name": "Idle", "arms": "relaxed", "source_file": "Happy_Idle.fbx", "in_place": true }
```

## Gegenprobe

Die erste v1 von `IO_Character_A.glb` (Commit 7299178, Mixamo-Rotationen ohne Umrechnung von T- auf A-Pose übernommen, Arme vor dem Bauch) fällt mit 9 FAIL durch: Hände kreuzen in Idle und Walk über die Körpermitte, Gelenkrichtungen weichen bis 91° von Mixamo ab. Die aktuelle Version besteht alle 34 Checks.
