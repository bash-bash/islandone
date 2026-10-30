# island-render – Strandtest

Erster Browser-Test der IslandOne-Welt (Handoff §25 „Graphics Vertical Slice“): ein Strandabschnitt nach dem Zielbild „Tropisches Inselcamp am Strand“, gebaut aus den fertigen Blender-GLBs, mit Platzhaltern für alles, was noch fehlt.

Stack: TypeScript, Vite, React (HUD), Babylon.js 9. WebGPU, wenn der Browser es kann, sonst WebGL 2.

## Starten

```bash
cd island-render
npm install
npm run dev          # http://localhost:5173
```

URL-Parameter:

| Parameter | Wirkung |
|---|---|
| `?renderer=webgl2` | WebGL 2 erzwingen (zum Vergleich mit WebGPU) |
| `?cam=alpha,beta,radius,x,y,z` | feste Kameraposition, z. B. für Vergleichs-Screenshots |
| `?post=0` | Nachbearbeitung (Farbkorrektur, Bloom) aus |
| `?quality=low\|medium\|high` | Qualitätsprofil erzwingen (sonst die letzte Wahl im Einstellungsfeld, auf Touch-Geräten Mittel, sonst Hoch) |
| `?feed=feeds/seed-3.json` / `&speed=600` | Spielt einen Ereignisstrom von island-sim ab (Etappe 7): die Figur geht dorthin, wo die Simulation sie hat, und das HUD zeigt Uhr, Bedürfnisse, Ziel und Schritte aus ihrem letzten Gedanken, Getragenes und den letzten Moment. `speed` spielt schneller ab. Neue Ströme mit `npm run feed` in island-sim |
| `?bench` / `?bench=30` | Benchmark: eine langsame Runde ums Camp (20 s oder die angegebenen Sekunden), danach Ø FPS, 1 %-Low, p95-Frametime und Speicher im Einstellungsfeld und in der Konsole |
| `?ao=1` | Ambient Occlusion (SSAO) an, nur zum Ausprobieren: dunkelt den Meeresboden durch das Wasser ab und kostet viel |

Kamera: linke Maustaste drehen, rechte Maustaste verschieben, Mausrad zoomen. Die Figur steuert man nicht; sie handelt selbst (siehe Charakter). Das Haus-Symbol oder `R` setzt die Ansicht zurück (Reset View). Ein Klick auf die Entdeckung unten links oder `F` fährt zum Ort des Ereignisses (Focus Event). Das Zahnrad oben rechts (oder `?debug` in der URL) zeigt Renderer, FPS, Draw Calls, Dreiecke, Speicher, Ladestand der Assets und die Wahl des Qualitätsprofils.

Im Browser-Konsolenfenster liegt `window.islandone` (`engine`, `scene`, `camera`, `library`), z. B. für den Babylon-Inspector.

## Was drin ist

| Bereich | Stand | Datei |
|---|---|---|
| Engine | WebGPU mit WebGL-2-Fallback | `src/engine/createEngine.ts` |
| Kamera | Orbit, erhöht, Neigung und Zoom begrenzt; Startansicht wie im Referenzbild. Reset View und Focus Event gleiten in 1,2 s, jede Maus- oder Radbewegung bricht ab. Verschieben bleibt über der Insel; die Kamera bleibt über Boden, Buschkronen, Hütte, Palmen und Werkbank (sie wird dafür steiler) | `src/engine/camera.ts` |
| Qualität | Profile nach Handoff §24. Niedrig: immer WebGL 2, Auflösung 75 % bei Pixelverhältnis 1, Schattenkarte 1024 mit einfachem Filter, Büsche ohne Schatten, halbe Pflanzendichte, Wasser ohne Schaum und Kaustiken, kein MSAA, Bloom und Schärfe aus, LOD-Distanzen 60 %. Mittel: Pixelverhältnis bis 1,5, Schattenkarte 2048, Büsche nahe am Camp mit Schatten, 75 % Pflanzen, Uferschaum und Kaustiken, MSAA 2, Bloom. Hoch: WebGPU wenn möglich, Pixelverhältnis bis 2, weicherer Schattenfilter, Büsche bis 18 m mit Schatten, alle Pflanzen, MSAA 4, Bloom und Schärfe, 30 % weitere Sichtweite der Detailstufen. Palmen werfen immer Schatten (§20) | `src/engine/quality.ts` |
| Messung | FPS, JS-Heap (nur Chromium) und geschätzter GPU-Speicher (Texturen, Render-Targets, Geometrie) im Einstellungsfeld; Benchmark mit `?bench` | `src/engine/measure.ts` |
| Himmel und Licht | Verlaufs-Himmelskuppel mit ziehenden Wolken über dem Horizont, kräftige Sonne (etwa 40° hoch, längere Schatten und weiches Relief) mit weichen Schatten, Himmels-Fülllicht, leichter Dunst | `src/world/sky.ts` |
| Bildstimmung | Nachbearbeitung: neutrales Tonemapping (KHR PBR Neutral, hält Farben satt), Sättigung, kühle Schatten, leichter Bloom, Schärfe, Vignette | `src/engine/look.ts` |
| Terrain | `IO_Terrain_Beach_Test_30m`, `IO_Seafloor_Test_30m` und ein grober Rand bis zum Horizont aus Blender (`assets/terrain`, `islandone_terrain.py`), dazu ein Höhenraster für Platzierung, Wassertiefe und Klicks. Sand in warmem Pfirsichton mit Flecken, kleinen Buckeln und Fußspuren in der Textur | `src/world/terrain.ts` |
| Kontaktschatten | Weiche, warme Schattenflecken unter allem, was auf dem Sand steht (Hütte, Holz, Feuer, Felsen, Kisten), als ein einziges Mesh beim Start aus den Bounding Boxes gebaut | `src/world/contactShadows.ts` |
| Wasser | Eigener Shader (GLSL und WGSL), zweimal gezeichnet: Multiplizieren (Transmission) und Addieren (Streulicht, Himmel, Glitzern, Schaum). Die Wasserdicke pro Pixel kommt aus der Szenentiefe, dadurch glasklares Flachwasser, das mit der Tiefe türkis und dann tiefblau wird; Felsen unter Wasser bleiben sichtbar. Spitzenschaum aus einer Lace-Textur, gesteuert über ein beim Start berechnetes Distanzfeld (Abstand zur Küste und zu Felsen, Steinen, Stegpfosten): Saum am Ufer, einlaufende Schaumlinien; an Felsen und Pfosten nur dann Schaum, wenn eine Welle von See her auftrifft (zuerst auf der Seeseite, breitet sich aus und vergeht, Wellen unterschiedlich stark, im Lee kaum etwas). Leichtes Auf und Ab am Ufer, laufende Kaustiken auf dem Meeresboden. Farben und Stärken in `WATER_LOOK` | `src/water/water.ts`, `waterShader.ts`, `foamField.ts`, `caustics.ts` |
| Wind | Palmen, Büsche, Farne und Gras wiegen sich im Wind (Material-Plugin im Vertex-Shader, GLSL und WGSL): langsames Schwingen nach Höhe, Böen, Blattflattern, jede Pflanze phasenversetzt. Die Schatten bleiben in Ruhelage | `src/world/wind.ts`, Einstellungen je Asset in `assets.ts` |
| Assets | 24 GLBs, LOD-Umschaltung nach Kameradistanz, Collider ausgeblendet; wiederholte Teile als Thin Instances (ein Draw Call pro Mesh) | `src/world/assets.ts` |
| Szene | Hütte, Werkbank, Feuerstelle (Steinring, Feuerholz, Dreibein aus Stangen, Flammen, Rauch, flackerndes Licht), Holzstapel, Bretter, Kisten aus Brettern, Seilrollen, niedriger Steg aus Stangen und Planken in flachem, klarem Wasser, dunkle Felsen knapp unter der Wasseroberfläche, Felsen, Felsinseln im Meer, Kieselgruppen im Sand, Möwe, Seesterne, Palmen. Dichter Dschungelrand aus Büschen, Farnen und Gras in Gruppen, Grün am Fuß der Felsen, Grasbüschel, die auf den Sand auslaufen, rote Akzentpflanzen; jede Pflanze bekommt per Instanzfarbe einen eigenen Grünton | `src/world/beachLayout.ts`, `src/world/camp.ts` |
| Charakter | `IO_Character_A` mit Idle und Walk (weich überblendet). Autonom, der Zuschauer steuert nicht: mit `?feed=` bewegt island-sim die Figur über `goTo` zu den Orten der Simulation (`src/sim/placeMap.ts`; die Quelle im Inland liegt außerhalb des Strandes, dort verschwindet sie im Dschungel), ohne läuft sie zwischen Feuer, Holzstapel, Werkbank und Ufer hin und her. Kollision in 2D: Hüttenwände (die Tür ist begehbar), Palmenstämme, Felsen, Werkbank aus den `_COL`-Proxys der Assets, dazu Holzstapel, Kisten und Feuerstelle; der Steg ist begehbar, tiefes Wasser nicht. Wegfindung: ein 20-cm-Raster aus der Kollision (Hindernisse um den Figurenradius vergrößert, tiefes Wasser und zu hohe Stufen gesperrt), A* mit 8 Nachbarn und straffgezogenem Pfad; bleibt sie trotzdem hängen, plant sie bis zu dreimal neu. Fällt auf eine Kapsel zurück, wenn das GLB fehlt | `src/character/character.ts`, `collision.ts`, `pathfind.ts`, `placeholder.ts` |
| HUD | Zuschauer-HUD nach dem Referenzbild, React über dem Canvas: Tag und Uhrzeit, Bedürfnisse der Figur (Gesundheit, Hunger, Durst, Energie), getragene Ressourcen, aktuelle Ziele, letzte Entdeckung, Werkzeuggürtel. Nur Anzeige, nichts davon steuert die Figur. Mit `?feed=` kommen die Werte aus island-sim (`src/sim/feedPlayer.ts`), sonst aus einem Platzhalter mit den Zahlen des Referenzbilds, Uhr und Bedürfnisse laufen langsam weiter | `src/ui/Hud.tsx`, `figureState.ts`, `icons.tsx`, `src/sim/` |
| Performance | Pflanzen in drei LOD-Ringen um das Camp (volle Details bis 9 m), Kaustiken nur auf nassen Dreiecken, die Tiefenkarte fürs Wasser nur mit Dingen am oder unter Wasser, Kontaktschatten mit weniger Dreiecken. Standardansicht: rund 1,0 Mio. Dreiecke und 240 Draw Calls in WebGL 2 | `beachLayout.ts`, `caustics.ts`, `water.ts`, `contactShadows.ts` |

Weitere Platzhalter: Kochtopf (Halbkugel). Feuer, Rauch und Schaum entstehen im Browser, wie in der Asset-Liste vorgesehen.

Koordinaten: Meter, Y oben, Land bei −X, Meer bei +X, Wasserspiegel y = 0.

## Assets aktualisieren

Die GLBs und die Terrain-Daten liegen unter `public/assets/` und werden mitversioniert, damit der Test ohne weitere Schritte läuft. Nach neuen Blender-Exporten:

```bash
npm run sync-assets -- /pfad/zu/IslandOne/assets
```

Das Skript kopiert genau die Dateien, die die Szene nutzt (Liste in `scripts/sync-assets.mjs`).

**Bekannter Asset-Fehler:** `IO_Hut_A_Full.glb` hat seine Farben in `COLOR_1`, `COLOR_0` ist weiß. Babylon nutzt nur `COLOR_0`, die Hütte wäre also weiß. `sync-assets` tauscht die beiden Attribute in der kopierten Datei. Besser wäre, den Export in `islandone_hut.py` zu korrigieren; danach kann der Tausch raus.

## Screenshots ohne GPU

```bash
npm run build && npx vite preview --port 4173 &
node scripts/screenshot.mjs "http://localhost:4173/?renderer=webgl2" shot.png
```

Läuft über SwiftShader (Software-Rendering), die FPS im HUD sind dort bedeutungslos. Echte Messungen nur im normalen Browser, z. B. `?bench&quality=high` und dann `?bench&quality=low`.

## Nächste Schritte

1. Charakter: Wegfindung; weitere Clips (PickUp, Carry…) an Aktionen hängen, sobald island-sim Aktionen liefert.
2. Wasser: Brechung (Verzerrung des Bodens), echte Wellen, Schaum auch außerhalb des Strandtest-Bereichs (Distanzfeld deckt nur x −14…34, z −28…28 ab).
3. Wind auch in den Schatten; Wind-Gewichte aus den GLBs (`TEXCOORD_1`) nutzen statt der Höhe, sobald die Palmen sie auch haben.
4. Kisten, Topf und weitere fehlende Requisiten aus der Asset-Liste.
5. Licht: HDR-Umgebung statt Verlaufskuppel, Ambient Occlusion ohne Fehler am Wasser.
6. KTX2-Texturen: Die Texturen belegen unkomprimiert rund 540–650 MB GPU-Speicher (Palmen allein 15 × 1024×2048, Figur 3 × 2048²). Mit KTX2/Basis wären es etwa ein Viertel. Bundle aufteilen.
