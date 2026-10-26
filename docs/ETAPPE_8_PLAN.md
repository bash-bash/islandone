# Etappe 8 – Leere Insel zum Start und die Assets dafür

Stand: 26.10.2026. Anlass: Chris hat die Live-Insel angehalten (`ETAPPE_7_PLAN.md` §7). Bevor sie wieder läuft, soll das Bild zur Simulation passen: Am Anfang steht nichts Gebautes am Strand, und alles, womit die Figur arbeitet, ist als eigenes Modell zu sehen. Die Vorlagen für die Modelle macht Chris in ChatGPT.

## 1. Was heute nicht passt

- `island-render/src/world/beachLayout.ts` stellt beim Start fest hin: Hütte (`IO_Hut_A_Full`), Werkbank, Lagerfeuer mit Dreibein und Topf, zwei Holzstapel und den Steg. In der Simulation gibt es nichts davon. Die Figur hat noch nie gebaut, aber das Bild zeigt ein fertiges Camp.
- Die Fundstellen der Simulation (Treibholz, Äste, Faserpflanzen, Fruchtbusch, rote Beeren, Kokospalme, Muscheln, Fische, Steine, Palmwedel) haben kein eigenes Modell. Die Figur „sammelt Fasern“ an einer Stelle, an der nichts Erkennbares wächst.
- Der Ereignisstrom meldet beim Gebauten nur den Ort (`built: ["p1"]`), nicht woraus es besteht. Feuer kommt mit Zustand (`glow`, `flame`, `ashes`), wird aber noch nicht gezeigt.
- Abgelegte Dinge (die Figur „legt Blatt ab“) bleiben unsichtbar.

## 2. Teil A: Die Insel beginnt leer (Code, braucht keine neuen Modelle)

1. **Natur und Camp trennen.** `beachLayout.ts` stellt nur noch Natur hin: Gelände, Palmen, Felsen, Büsche, Gras, Farn, Kiesel. Hütte, Werkbank, Feuerstelle, Holzstapel und Steg wandern in einen Schaukasten-Modus (`?showcase=1`), damit die fertigen Modelle für die Abnahme sichtbar bleiben.
2. **Fundstellen sichtbar machen.** Jede Fundstelle aus `island-sim/src/world/island.ts` bekommt einen festen Platz auf dem Strand (neue Tabelle neben `placeMap.ts`). Solange die Modelle aus Teil B fehlen, stehen dort die vorhandenen nächstbesten (Treibholz = `IO_Log_Short_A`, Faserpflanze = `IO_Grass_Clump_C` usw.).
3. **Mengen im Strom.** Der Strom bekommt pro Bild die Vorräte der Fundstellen (`amount`), damit ein leer gepflückter Busch auch leer aussieht und nach einem Sturm mehr Treibholz liegt.
4. **Gebautes aus seinen Teilen.** Die Simulation kennt keine „Hütte“, nur Teile (Holz mit Länge, Blätter, Faser, was davon festgebunden ist) und wie viel Regen sie abhalten (`structureCover`). Der Strom meldet künftig die Teile jedes Baus. island-render setzt daraus nach festen Regeln ein Bild zusammen, immer gleich für denselben Bau:
   - nur Stücke am Boden: ein Haufen
   - Holz ab 0,9 m: angelehnte Stangen, ein Gestell
   - Blätter auf dem Gestell: Dach, je mehr Abdeckung, desto dichter
   - festgebundene Teile: Faserwicklung an den Knoten
   So wächst ein Unterstand Stück für Stück, genau so weit, wie die Figur ihn gebaut hat.
5. **Feuer nach Zustand.** `glow`: kleine Glut ohne Flammen. `flame`: Flammen und Licht wie heute, aber ohne Steinring, Dreibein und Topf, solange die Figur sie nicht gebaut hat. `ashes`: grauer Fleck mit Rest-Rauch.
6. **Liegengelassenes.** Abgelegte Stücke liegen am Ort, Getragenes hängt sichtbar an der Figur (Holz unter dem Arm, Blätter in der Hand). Dazu die Animationen Heben und Tragen aus `character/source_anims` für `take` und `drop`.
7. **Prüfen:** Ein Test spielt die Sonnet-Aufzeichnung aus Etappe 6 (`public/feeds/seed-3.json`, neu erzeugt) ab und vergleicht Bildschirmfotos an festen Stellen: Start leer, erster Haufen, erstes Feuer.

## 3. Teil B: Die neuen Modelle

Reihenfolge nach Nutzen: P1 braucht die leere Insel, damit man versteht, was die Figur tut. P2 sind die Dinge, die die Figur selbst herstellt. Jedes Modell entsteht wie bisher als Blender-Skript mit LODs, GLB und 360°-Prüfbild (Regeln in `BLENDER_ASSET_LIST_V0.md` und `CAMERA_AND_MODULAR_BUILDING_RULES.md`).

| # | Modell | Steht für (Simulation) | Vorlage von Chris |
|---|---|---|---|
| **P1** | | | |
| 1 | `IO_Driftwood_A`, `_B`, `_C` | `driftwood` am Spülsaum: ausgebleichtes, verdrehtes Holz, 0,5 bis 2 m | ja |
| 2 | `IO_Branch_A`, `_B` | `branches` am Waldrand: dünne Äste mit Zweigen, 0,6 bis 1,5 m | ja |
| 3 | `IO_FiberPlant_A` | `fiber_plant`: Pflanze mit langen, zähen Blättern (etwa Sisal oder Pandanus) | ja |
| 4 | `IO_FruitBush_A` | `fruit_bush`: Busch mit weichen gelben Früchten, Früchte als eigene Teile zum Ausblenden | ja |
| 5 | `IO_BerryBush_Red_A` | `red_berry_bush`: kleiner Busch mit roten Beeren, sichtbar anders als 4 | ja |
| 6 | `IO_Palm_Coconut_A`, `IO_Coconut_A` | `coconut_palm`: Palme mit Nussbündel, einzelne Nuss am Boden und in der Hand | ja |
| 7 | `IO_Shellfish_A` | `shellfish`: Muschelbank auf den Felsen im Flachwasser | ja |
| 8 | `IO_PalmFrond_Fallen_A`, `_B` | `palm_fronds`: abgefallene, trockene Palmwedel am Boden, auch als Dachteil | ja |
| 9 | `IO_Stone_Small_B`, `_C`, `_D` | `stones`: rund, flach, scharfkantig (die Simulation unterscheidet `shape`) | nein, aus der Felsfamilie |
| 10 | `IO_Fish_A` | `fish`: kleiner Schwarm im Flachwasser | ja |
| **P2** | | | |
| 11 | `IO_Bound_A` | `bound`: zwei Stücke mit Faser verbunden (aus `IO_Fiber_Binding_A` JointWrap und Holz) | nein |
| 12 | `IO_Shelter_Kit_A` | Teile für den wachsenden Unterstand aus Teil A.4: Stange angelehnt, Querstange, Blattlage | ja, ein Bild „einfacher Unterstand aus Ästen und Palmwedeln“ |
| 13 | `IO_Fire_Stages_A` | Feuer: Glutnest mit Zunder, kleines Feuer aus Ästen, Aschefleck | ja |
| 14 | `IO_FireRub_A` | „reibt Holz an Holz“: zwei Hölzer mit Rauchspur, Rille im Holz | ja |
| 15 | `IO_Leaf_Bundle_A`, `IO_Fiber_Bundle_A` | Getragenes und Abgelegtes: Bündel Blätter, Bündel Fasern | nein |

Bleiben im Schaukasten für später: `IO_Hut_A_Full` und der Hüttenbausatz, `IO_Workbench_A`, Steg, Topf. Sie kommen zurück, wenn die Simulation solche Dinge bauen kann.

## 4. So entsteht eine Vorlage in ChatGPT

Ein Bild pro Modell reicht, zwei sind besser (schräg von oben und von der Seite). Damit die Modelle zueinander passen:

- gleicher Stil wie `docs/Tropisches Inselcamp am Strand.png` (stilisiert, warme Farben, klare Formen)
- genau ein Gegenstand, ganz im Bild, auf neutralem hellgrauem Hintergrund, ohne Schatten von anderen Dingen
- Blick schräg von oben, wie die Spielkamera
- eine Person oder ein Maßstab daneben, wenn die Größe nicht klar ist

Vorlage für den Prompt:

```text
Stylized 3D game asset, single object: <Gegenstand, z. B. "bleached twisted driftwood log, about 1.5 m long">.
Same art style as the attached tropical beach camp image. Warm, readable colors, clean silhouette.
Three-quarter view from slightly above, centered, full object visible, plain light gray background, no other objects.
```

Die Bilder legt Chris unter `docs/refs/<Modellname>.png` ab oder lädt sie im Thread hoch. Pro Bild baut Claude das Modell, rendert es von allen Seiten neben der Vorlage und stellt den Vergleich zur Abnahme bereit.

## 5. Reihenfolge

1. Teil A.1 und A.2: leerer Strand, Platzhalter an den Fundstellen. Sofort machbar.
2. P1-Modelle in der Reihenfolge, in der Vorlagen kommen. Sinnvoller Anfang: Treibholz, Äste, Palmwedel, Faserpflanze (die Figur braucht sie für Feuer und Unterstand).
3. Teil A.3 bis A.6: Mengen, Gebautes aus Teilen, Feuerzustände, Getragenes.
4. P2-Modelle.
5. Live-Insel wieder starten (`ISLAND_RUNNING=1`). Weil sich der Strom ändert, beginnt dann am besten eine neue Insel (Schlüssel `islandone:meta` in Redis löschen), statt Tage nachzuholen.

## 6. Offene Fragen für Chris

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Bleiben Hütte, Werkbank und Steg sichtbar, nur im Schaukasten? | Ja, `?showcase=1`, damit nichts verloren geht |
| 2 | Soll die Figur später eine richtige Hütte bauen können? | Erst den wachsenden Unterstand (A.4); eine Hütte braucht neue Regeln in der Simulation und ist eine eigene Etappe |
