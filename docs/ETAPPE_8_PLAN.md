# Etappe 8 – Leere Insel, neue Assets und Bauregeln

Stand: 26.10.2026. Anlass: Chris hat die Live-Insel angehalten (`ETAPPE_7_PLAN.md` §7). Bevor sie wieder läuft, soll das Bild zur Simulation passen: Am Anfang steht nichts Gebautes am Strand, und alles, womit die Figur arbeitet, ist als eigenes Modell zu sehen. Die Vorlagen für die Modelle macht Chris in ChatGPT.

**Dies ist der einzige gültige Plan für Etappe 8.** Er führt zusammen: den Code-Plan, die Bauregeln und das Doc „IslandOne: Asset-Plan und Startzustand“ (Bestand, Fundorte, Prompts für die Vorlagen). Das Doc wird nicht mehr weitergeschrieben.

## 1. Was heute nicht passt

- `island-render/src/world/beachLayout.ts` stellt beim Start fest hin: Hütte (`IO_Hut_A_Full`), Werkbank, Lagerfeuer mit Dreibein und Topf, zwei Holzstapel und den Steg. In der Simulation gibt es nichts davon. Die Figur hat noch nie gebaut, aber das Bild zeigt ein fertiges Camp.
- Die Fundstellen der Simulation (Treibholz, Äste, Faserpflanzen, Fruchtbusch, rote Beeren, Kokospalme, Muscheln, Fische, Steine, Palmwedel) haben kein eigenes Modell. Die Figur „sammelt Fasern“ an einer Stelle, an der nichts Erkennbares wächst.
- Der Ereignisstrom meldet beim Gebauten nur den Ort (`built: ["p1"]`), nicht woraus es besteht. Feuer kommt mit Zustand (`glow`, `flame`, `ashes`), wird aber noch nicht gezeigt.
- Abgelegte Dinge (die Figur „legt Blatt ab“) bleiben unsichtbar.

**Bestand.** Rund 25 Modelle sind fertig, alle mit GLB, LODs, Texturen und Prüfbildern (abgeglichen mit dem Projektordner und `BLENDER_ASSET_LIST_V0.md`):

| Bereich | Fertig | Rolle im neuen Startzustand |
|---|---|---|
| Vegetation | Palm A, B, Young A; Bush Tropical A–C; Fern A; Grass Clump A–C | Natur, von Anfang an da |
| Fels und Stein | Rock Large A, B; Stone Small A; Campfire Stone A | Natur; Campfire Stone erst beim Feuer |
| Bauteile | Log Long/Short A; Plank Long/Short A; Pole Long A; Fiber Binding (Coil, Strand, JointWrap) | nur noch Bausteine für Gebautes |
| Gebautes | Hut A (komplett, dazu der Bausatz `IO_HutKit_A` als einzelne GLBs im Projektordner unter `hut/glb/kit/`); Workbench A | erst, wenn die Figur es baut |
| Tiere, Strand | Seagull A; Starfish A | Natur |
| Gelände | Beach Test 30 m, Seafloor, Surround | Natur |
| Figur | Character A v1 mit 7 Clips | Figur |

In der Liste steht Palm C als erstellt, im Projektordner liegt aber kein `IO_Palm_C.glb`. Der Topf über dem Feuer ist im Renderer nur ein Platzhalter (Kugel).

## 2. Teil A: Die Insel beginnt leer (Code, braucht keine neuen Modelle)

0. **Eine Inselkarte für beide (Entscheidung Chris, 26.10.2026).** Chris designt die Insel einmal fertig. Was wo steht (jede Palme, jeder Fels, jede Fundstelle), steht danach in einer Inselkarte, einer Datei, die Simulation und Bild gemeinsam lesen. Treibholz gibt es nur am Spülsaum, Äste und Faserpflanzen nur am Waldrand usw. Die Figur sieht die Karte nie: Sie bekommt wie bisher nur, was sie gerade wahrnimmt, und muss selbst herausfinden, was etwas ist und wozu es taugt. Die Fundorte folgen der Simulation (`island.ts`):

   | Ort | Was dort liegt oder wächst |
   |---|---|
   | Spülsaum (p7) | Treibholz, Steine |
   | Waldrand (p3) | Äste, Faserpflanzen, Fruchtbusch, rote Beeren |
   | Palmenhain (p2) | Kokospalmen, Palmwedel |
   | Felsen mit Überhang (p5) | Steine, Muscheln |
   | Flachwasser (p6) | Fische |
   | Quelle im Inland (p4) | Süßwasser, außerhalb des Strandbilds |

   Dazu kommen die Bauplätze des Camps (§7.2).
1. **Natur und Camp trennen.** `beachLayout.ts` stellt nur noch Natur hin: Gelände, Palmen, Felsen, Büsche, Gras, Farn, Kiesel. Hütte, Werkbank, Feuerstelle, Holzstapel und Steg wandern in einen Schaukasten-Modus (`?showcase=1`), damit die fertigen Modelle für die Abnahme sichtbar bleiben.
2. **Fundstellen sichtbar machen.** Jede Fundstelle aus `island-sim/src/world/island.ts` bekommt einen festen Platz auf dem Strand (neue Tabelle neben `placeMap.ts`). Solange die Modelle aus Teil B fehlen, stehen dort die vorhandenen nächstbesten (Treibholz = `IO_Log_Short_A`, Faserpflanze = `IO_Grass_Clump_C` usw.).
3. **Mengen im Strom.** Der Strom bekommt pro Bild die Vorräte der Fundstellen (`amount`), damit ein leer gepflückter Busch auch leer aussieht und nach einem Sturm mehr Treibholz liegt.
4. **Gebautes aus seinen Teilen.** Die Simulation kennt keine „Hütte“, nur Teile und Verbindungen. Wo und wie ein Teil sitzt, bestimmen die Bauregeln (§7): nur auf Bauplätzen im Camp, im Raster, in fester Reihenfolge. Der Strom meldet pro Bau die belegten Plätze, island-render setzt daraus den Bau mit dem Hüttenbausatz zusammen. Bis die neue Bauordnung steht, zeigt das Bild Abgelegtes am Bauplatz als Haufen.
5. **Feuer nach Zustand.** `glow`: kleine Glut ohne Flammen. `flame`: Flammen und Licht wie heute, aber ohne Steinring, Dreibein und Topf, solange die Figur sie nicht gebaut hat. `ashes`: grauer Fleck mit Rest-Rauch.
6. **Liegengelassenes.** Abgelegte Stücke liegen am Ort, Getragenes hängt sichtbar an der Figur (Holz unter dem Arm, Blätter in der Hand). Dazu die Animationen Heben und Tragen für `take` und `drop` (Quelldateien im Projektordner unter `character/source_anims`). Für alles andere, was die Figur in der Simulation tut, fehlen noch Animationen: Trinken, Essen, Schlafen, Sitzen, Reiben (Feuer), Binden, Bauen, Werfen. Die kommen aus Mixamo, nicht aus ChatGPT-Bildern.
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
| 12 | `IO_HutKit_A` ergänzen | Teile für Unterstand und Hütte nach §7: Pfosten, Balken, Sparren, Dachreihe aus Palmwedeln, Wandteil, Bodenplatte, Bindung (der Bausatz liegt im Projektordner unter `hut/glb/kit/`, noch nicht im Repository) | ja, ein Bild mit vier Bauständen (§4) |
| 13 | `IO_Fire_Stages_A` | Feuer: Glutnest mit Zunder, kleines Feuer aus Ästen, Aschefleck | ja |
| 14 | `IO_FireRub_A` | „reibt Holz an Holz“: zwei Hölzer mit Rauchspur, Rille im Holz | ja |
| 15 | `IO_Leaf_Bundle_A`, `IO_Fiber_Bundle_A` | Getragenes und Abgelegtes: Bündel Blätter, Bündel Fasern | nein |
| **Hütten-Etappe** | | | |
| 16 | Werkzeug zum Holzbearbeiten (etwa ein Steinbeil), Teile für Steg und Werkbank nach §7 | was die Figur für Hütte und Steg braucht | später |
| **P3** | | | |
| 17 | Rock Medium, Fern B, Seegras, Brennholz, Topf u. a. | Abwechslung, Deko | bei Bedarf |

Bleiben im Schaukasten (eigene Ansicht `?showcase=1` zum Anschauen und Abnehmen, nicht auf der normalen Insel): `IO_Hut_A_Full` und der Hüttenbausatz, `IO_Workbench_A`, Steg, Topf. Sie kommen zurück, sobald die Figur sie nach den Bauregeln (§7) bauen kann.

## 4. So entsteht eine Vorlage in ChatGPT

Pro Modell reicht ein Bild als Ansichtsblatt. Es dient nur als Vorlage für Form, Farbe und Proportion, gebaut wird in Blender.

**Regeln für jedes Bild**

- Ein Bild reicht, zwei sind besser: schräg von oben (etwa 40°, wie die Spielkamera) und von der Seite. Bei Varianten (A–C) alle nebeneinander auf einem Bild.
- Genau ein Gegenstand, ganz im Bild, neutraler hellgrauer Hintergrund, weiches Studiolicht, kein Text.
- Ein Maßstab daneben (graue 1,75-m-Silhouette oder 1-m-Stab), wenn die Größe nicht klar ist.
- Gleicher Stil wie `docs/Tropisches Inselcamp am Strand.png`. Am besten das Bild bei jedem Prompt mit hochladen.
- Bild unter `docs/refs/<Modellname>.png` ablegen oder im Thread hochladen. Claude baut daraus das Modell, rendert es von allen Seiten neben der Vorlage und stellt den Vergleich zur Abnahme bereit.

**Stil-Baustein** (vor jeden Prompt setzen; Englisch, weil die Bildmodelle damit verlässlicher sind):

```text
Stylized real-time 3D game asset, premium browser game look, matching the attached tropical island camp image. Clean readable silhouette, hand-crafted shapes, soft painterly PBR materials, warm natural colours. Orthographic-style turnaround sheet on a plain light grey background, soft studio lighting, no text, no labels. A neutral grey 1 m measuring stick next to the object for scale.
```

**P1**

| Modell | Ansichten | Prompt (nach dem Stil-Baustein) |
|---|---|---|
| 1 Driftwood A–C | 3 Varianten nebeneinander | Three pieces of sun-bleached, twisted driftwood washed up on a beach: a long trunk piece 2 m with a root stub, a curved branch 1.2 m, a short thick chunk 0.5 m. Silver-grey weathered wood, smooth worn surface, cracks, no bark. |
| 2 Branch A, B | 2 Varianten nebeneinander | Two freshly broken thin tropical tree branches with small twigs: a straight one 0.8 m and a forked one 1.5 m. Brown bark, a few leaves, broken ends showing light wood. |
| 3 FiberPlant A | schräg + Seite | A tropical fiber plant clump like sisal or pandanus, 0.8 m tall, long tough narrow sword-shaped leaves, some leaf tips split into fibres. |
| 4 FruitBush A | schräg + Seite | A tropical shrub 1.2 m tall with broad leaves and clearly visible soft yellow round fruits hanging between the leaves. |
| 5 BerryBush Red A | schräg + Seite | A small low tropical shrub 0.8 m tall with small dark green leaves and clusters of bright red berries. Clearly different from a broad-leaved fruit bush. |
| 6 Palm Coconut A, Coconut A | Palme schräg; Nuss ganz und offen | A coconut palm with a visible cluster of green-brown coconuts under the crown. Separate small image: a single coconut in its husk, 25 cm, and the same coconut cracked open showing white flesh. |
| 7 Shellfish A | schräg von oben | A cluster of dark blue-black mussels and a few ribbed clams growing on a wet grey rock at the waterline, about 0.5 m across. |
| 8 PalmFrond Fallen A, B | Draufsicht + Seite | Two fallen coconut palm fronds lying on sand, 2 m long, dried brown-yellow, leaflets slightly curled, thick stem base. |
| 10 Fish A | Seite + oben; dazu ein Schwarm | A small tropical fish, 30 cm, silver body with blue-green back and yellow fin edges, simple stylized shape. Second image: a loose school of eight of them seen from above in clear shallow water. |

**P2**

| Modell | Ansichten | Prompt (nach dem Stil-Baustein) |
|---|---|---|
| 12 HutKit A, Baustände | 4 Stufen nebeneinander, gleiche Kamera schräg von oben | Four build stages of the same small tropical hut, 4.5 x 3 m, built by one person from wood and palm fronds, straight and square like real carpentry: stage 1 four upright corner posts dug into sand; stage 2 posts joined by horizontal beams at the top, lashed with plant fibre; stage 3 gable roof frame with rafters, half covered with overlapping rows of dried palm fronds from the eaves up; stage 4 finished roof and woven back and side walls, open front entrance. A grey 1.75 m human silhouette for scale. |
| 13 Fire Stages A | 3 Zustände nebeneinander | Three states of a small primitive campfire on sand, no stone ring: a glowing ember nest with dry grass tinder and thin smoke; a small fire of crossed thin branches with flames; a grey ash patch with a few charred stick ends. |
| 14 FireRub A | schräg von oben | A primitive fire-by-friction set lying on the ground: a flat wooden board with a blackened groove and a little dark wood dust, and a straight wooden stick, a faint wisp of smoke. |

Ohne Vorlage: Steine (9), Gebundenes (11) und Bündel (15) entstehen aus vorhandenen Modellen. Für die Hütten-Etappe später etwa: „primitive stone axe, a sharp flat stone tied to a wooden handle with plant fibre, 50 cm“.

## 5. Reihenfolge

1. Teil A.1 und A.2: leerer Strand, Platzhalter an den Fundstellen. Sofort machbar.
2. P1-Modelle in der Reihenfolge, in der Vorlagen kommen. Sinnvoller Anfang: Treibholz, Äste, Palmwedel, Faserpflanze (die Figur braucht sie für Feuer und Unterstand).
3. Teil A.3 bis A.6: Mengen, Gebautes aus Teilen, Feuerzustände, Getragenes.
4. P2-Modelle.
5. Bauregeln (§7.6): Inselkarte mit Bauplätzen, Bauordnung in island-sim, Strom und Bild, erst Unterstand und Hütte, dann Steg, dann Werkbank.
6. Live-Insel wieder starten (`ISLAND_RUNNING=1`). Weil sich der Strom ändert, beginnt dann am besten eine neue Insel (Schlüssel `islandone:meta` in Redis löschen), statt Tage nachzuholen.

**Wer was tut:**

- Chris: die Insel einmal fertig gestalten, mit den Bauplätzen des Camps (wird zur Inselkarte, A.0 und §7.2).
- Chris: Vorlagen P1 in ChatGPT, zuerst Treibholz, Äste, Palmwedel, Faserpflanze.
- Claude, Code: Teil A (leerer Start, Fundstellen, Schaukasten, Feuerzustände), danach die Bauordnung aus §7.
- Claude, Blender: P1 in der Reihenfolge, in der die Vorlagen kommen, danach P2.

## 6. Entscheidungen von Chris (26.10.2026)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Bleiben Hütte, Werkbank und Steg sichtbar? | Ja, im Schaukasten (`?showcase=1`), nicht auf der normalen Insel |
| 2 | Soll die Figur eine richtige Hütte bauen können? | Ja, ein Muss, ebenso der Steg ins Wasser. Mit festen Regeln, damit es menschlich aussieht und das Camp beisammen bleibt (§7) |
| 3 | Wer legt fest, was wo auf der Insel steht? | Chris designt die Insel einmal fertig; das kommt in die Inselkarte (A.0). Die Figur muss selbst herausfinden, was was ist |

## 7. Teil C: Bauregeln für Hütte, Steg und Camp

Entscheidungen von Chris vom 26.10.2026: Die Figur soll die Hütte bauen können, auch den Steg ins Wasser. Was sie baut, soll aussehen wie von Menschen gebaut, so ähnlich wie heute. Das Camp liegt beisammen und nahe am Wasser, keine Kiste mitten woanders auf der Insel. Ergänzt `ISLANDONE_CODING_AGENT_HANDOFF.md` §13 und `CAMERA_AND_MODULAR_BUILDING_RULES.md` §4 bis §6.

### 7.1 Der Grundsatz

Die Figur entscheidet, **ob** und **womit** sie baut. Die Welt entscheidet, **wo** und **wie** ein Teil sitzt.

Die Figur legt nie selbst Koordinaten oder Winkel fest. Sie sagt nur so etwas wie „ich stelle dieses lange Holz hier auf“ oder „ich binde dieses Holz oben fest“. Die Bauordnung der Welt setzt das Teil dann an den nächsten passenden Platz in einem festen Raster, gerade und rechtwinklig, so wie ein Mensch es tun würde. Ein Zickzack-Steg oder eine Kiste mitten im Wald kann so gar nicht entstehen.

Das widerspricht nicht dem Handoff („keine fertigen Objekte, kein `spawn_hut()`“): Es gibt weiterhin nur Teile und Verbindungen. Gebaut wird Stück für Stück, auch halb fertig, beschädigt oder repariert. Nur die Plätze der Teile folgen festen Regeln.

Die Figur kennt die Regeln nicht als Text. Sie erfährt sie wie ein Mensch durch Ausprobieren: Ein Balken ohne zwei stehende Pfosten fällt herunter, ein Dach ohne Rahmen hält nicht, ein loser Pfosten kippt im Sturm. Daraus lernt sie (Lehren und Lücken wie heute).

### 7.2 Wo gebaut werden darf: Bauplätze

Chris legt beim Design der Insel die Bauplätze in der Inselkarte fest (A.0). Jeder Bauplatz hat eine Art, eine feste Lage und eine feste Ausrichtung. Gebaut wird nur auf einem Bauplatz. Anderswo kann die Figur Dinge ablegen und Haufen machen, aber nichts aufstellen.

Damit das Camp beisammen bleibt, gehören alle Bauplätze zu **einem Camp am Strand am Camp (p1)**. Die Regeln für ihre Lage gelten beim Design (Chris setzt sie, ein Test prüft sie):

| Bauplatz | Regel für die Lage |
|---|---|
| **Camp-Mitte** | Ein Punkt auf ebenem Sand oberhalb der Flutlinie. Alle anderen Plätze liegen höchstens 15 m davon entfernt. Die Achse des Camps zeigt zum Meer. |
| **Hütte** | 6 bis 15 m von der Wasserlinie, auf ebenem, trockenem Sand oberhalb der Sturmflut. Nicht direkt unter Kokospalmen (fallende Nüsse), aber Schatten in der Nähe. Die Längsseite liegt parallel zum Strand, der Eingang zeigt zum Meer. Rückseite zum Wald, das schützt vor Wind. |
| **Feuerstelle** | 3 bis 6 m vor der Hütte, Richtung Meer, auf Sand. Nicht unter einem Dach oder einer Palme. Auf der Seite, auf die der übliche Wind den Rauch von der Hütte wegträgt. |
| **Werkplatz** | Neben der Hütte, 2 bis 4 m, im Schatten. Hier steht später die Werkbank. |
| **Holzlager** | An der windabgewandten Seite der Hütte, 1 bis 3 m, damit das Holz trocken bleibt. |
| **Steg** | Beginnt an der Wasserlinie auf Höhe des Camps, höchstens 15 m von der Camp-Mitte. Führt gerade und rechtwinklig zur Küstenlinie ins Wasser, über Sandgrund, nicht über Felsen. Endet dort, wo das Wasser etwa 1,2 bis 1,5 m tief ist (dort sind die Fische). |

Die heutige Anordnung am Teststrand (Hütte, Feuer, Werkbank, Holzstapel, Steg) folgt diesen Regeln schon fast und dient als Vorlage.

### 7.3 Wie gebaut wird: das Raster

Alle Bauten stehen in einem Raster von **1,5 m**, rechtwinklig zur Achse ihres Bauplatzes. Die Ausrichtung kommt vom Bauplatz, nicht von der Figur.

#### Hütte

Die Hütte ist ein Rechteck aus Rasterfeldern. Die erste Hütte hat 3 × 2 Felder (4,5 × 3 m, Wandhöhe 2,4 m) wie `IO_Hut_A_Full`, dessen Bausatz schon im 1,5-m-Raster gebaut ist. Später wird sie um ganze Felder länger oder breiter.

Sie wird in einer festen Reihenfolge gebaut. Jeder Schritt braucht den vorherigen:

| Stufe | Teile | Bedingung | Was es bringt |
|---|---|---|---|
| 1. Pfosten | Holz ab 2 m, senkrecht an den Ecken des Rasters, dann an den Zwischenpunkten | Ein Pfosten steht erst fest, wenn er tief genug eingegraben ist (Zeit) | Noch nichts; lose Pfosten kippen im Sturm |
| 2. Rahmen | Balken oben zwischen zwei stehenden Nachbarpfosten | Nur zwischen zwei Pfosten; gebunden mit Faser hält er, sonst fällt er | Das Gerüst steht |
| 3. Dachgerüst | Sparren vom Rahmen zum First, Satteldach entlang der Längsseite | Rahmen ringsum geschlossen | Noch kein Schutz |
| 4. Dach | Palmwedel oder Blattbündel in Reihen von der Traufe zum First | Dachgerüst steht; jede Reihe überlappt die untere | Schatten, dann Regenschutz (wächst mit jeder Reihe) |
| 5. Wände | Wandteile zwischen zwei Pfosten; erst Rückseite, dann Seiten, zum Schluss vorn mit Eingang | Rahmen über dem Feld | Windschutz, Wärme in der Nacht |
| 6. Boden | Plattform auf Querbalken, etwa 30 cm über dem Sand | Pfosten stehen | trocken bei Regen, Schutz vor Krabben und Insekten |

Stufe 1 bis 4 ist schon der **Unterstand**. Aus ihm wird durch Wände und Boden die Hütte. Es gibt also keinen Abriss und Neubau.

#### Steg

| Teil | Regel |
|---|---|
| Pfostenpaare | 1,2 m auseinander (Breite des Stegs), alle 1,5 m ein Paar, auf der Achse des Bauplatzes. Das erste Paar steht am Ufer |
| Querträger | auf jedem Pfostenpaar, gebunden |
| Längsträger | von Paar zu Paar, nur zum letzten fertigen Paar hin |
| Planken | quer über die Längsträger, lückenlos |

Gebaut wird nur vom Land aus nach außen. Das nächste Paar kommt immer genau 1,5 m hinter das letzte. Ohne Querträger und Längsträger kann die Figur keine Planken legen. Der Steg ist fertig, wenn er die Tiefe erreicht, die der Bauplatz vorgibt.

#### Feuerstelle, Werkplatz, Holzlager

- **Feuerstelle:** Feuer dürfen überall brennen (das ist Überleben, kein Bau). Ein Steinring entsteht aber nur auf dem Bauplatz Feuerstelle. Steine, die die Figur dort ablegt, ordnen sich als Ring. Das Dreibein darüber besteht aus drei gebundenen Stangen.
- **Werkplatz:** zuerst ein flacher Stein oder Klotz als Unterlage, später die Werkbank (Pfosten und Platte nach Raster).
- **Holzlager:** Holz, das die Figur dort ablegt, wird gestapelt, nach Länge sortiert und quer zur Hütte.

### 7.4 Was die Figur dabei erlebt

- Sie sieht die Bauplätze nicht als Markierung. Sie merkt, dass Aufstellen auf festem, ebenem Sand gelingt und im Wald, auf Felsen oder im Wasser nicht. Der Steg ist die Ausnahme, aber nur vom Ufer aus.
- Ein Teil, das nicht passt, sitzt nicht. Ein zu kurzes Holz taugt nicht als Pfosten, und ein Balken ohne zweiten Pfosten fällt. Die Welt meldet das als Ergebnis („fällt herunter“, „wackelt“, „hält“), nicht als Regel.
- Was gebaut ist, wirkt in der Simulation: Schatten senkt den Durst bei Hitze, das Dach hält Regen ab, Wände halten nachts warm, der Steg führt zu den Fischen im tieferen Wasser.
- Sturm prüft den Bau. Ungebundene Teile fallen, ein halbes Dach verliert Wedel. Daraus entstehen Reparaturen.

### 7.5 Was das Bild daraus macht

Jeder Platz im Raster ist ein Sockel im Hüttenbausatz `IO_HutKit_A` (Pfosten, Balken, Wandteil, Dachteil, Strohbündel, Bindung; Sockelnamen nach `CAMERA_AND_MODULAR_BUILDING_RULES.md` §6). Der Strom meldet pro Bau die belegten Plätze, ob sie gebunden sind und ob sie beschädigt sind. island-render setzt daraus genau den Bau zusammen, der in der Simulation steht. Für den Steg gelten die Teile, mit denen er heute gebaut ist (Pfosten, Stangen, Planken). Fertig sieht die Hütte aus wie `IO_Hut_A_Full` und der Steg wie heute.

### 7.6 Reihenfolge

1. Inselkarte mit Bauplätzen, die Lage-Regeln aus §2 als Test.
2. Bauordnung in island-sim: Raster, Plätze, Reihenfolge, Halt durch Bindung, Wirkung jeder Stufe. Dazu neue Aktionen der Figur (aufstellen, oben festbinden, decken) statt des heutigen allgemeinen `build`.
3. Strom und Bild: belegte Plätze melden, Bausatz an den Sockeln zusammensetzen.
4. Den Hüttenbausatz `IO_HutKit_A` aus dem Projektordner (`hut/glb/kit/`) ins Repository holen; heute liegt dort nur `IO_Hut_A_Full`.
5. Erst Unterstand und Hütte, dann Steg, dann Werkbank.

### 7.7 Entschieden (Chris, 27.10.2026)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Raster und Größe der ersten Hütte | Raster 1,5 m; erste Hütte 3 × 2 Felder (4,5 × 3 m) wie `IO_Hut_A_Full` |
| 2 | Eingang zum Meer, Rückseite zum Wald? | Ja |
| 3 | Darf es später ein zweites Gebäude geben (Lager, Räucherhütte)? | Ja, nach der ersten Hütte, mit einem eigenen Bauplatz im Camp |
