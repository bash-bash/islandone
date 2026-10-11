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
| `?ao=1` | Ambient Occlusion (SSAO) an, nur zum Ausprobieren: dunkelt den Meeresboden durch das Wasser ab und kostet viel |

Steuerung: linke Maustaste drehen (ein kurzer Klick auf den Sand schickt den Charakter dorthin), rechte Maustaste verschieben, Mausrad zoomen. Oben links zeigt das HUD Renderer, FPS, Draw Calls, Dreiecke und den Ladestand der Assets.

Im Browser-Konsolenfenster liegt `window.islandone` (`engine`, `scene`, `camera`, `library`), z. B. für den Babylon-Inspector.

## Was drin ist

| Bereich | Stand | Datei |
|---|---|---|
| Engine | WebGPU mit WebGL-2-Fallback | `src/engine/createEngine.ts` |
| Kamera | Orbit, erhöht, Neigung und Zoom begrenzt | `src/engine/camera.ts` |
| Himmel und Licht | Verlaufs-Himmelskuppel mit ziehenden Wolken über dem Horizont, kräftige Sonne (etwa 40° hoch, längere Schatten und weiches Relief) mit weichen Schatten, Himmels-Fülllicht, leichter Dunst | `src/world/sky.ts` |
| Bildstimmung | Nachbearbeitung: neutrales Tonemapping (KHR PBR Neutral, hält Farben satt), Sättigung, kühle Schatten, leichter Bloom, Schärfe, Vignette | `src/engine/look.ts` |
| Terrain | `IO_Terrain_Beach_Test_30m`, `IO_Seafloor_Test_30m` und ein grober Rand bis zum Horizont aus Blender (`assets/terrain`, `islandone_terrain.py`), dazu ein Höhenraster für Platzierung, Wassertiefe und Klicks. Sand in warmem Pfirsichton mit Flecken, kleinen Buckeln und Fußspuren in der Textur | `src/world/terrain.ts` |
| Kontaktschatten | Weiche, warme Schattenflecken unter allem, was auf dem Sand steht (Hütte, Holz, Feuer, Felsen, Kisten), als ein einziges Mesh beim Start aus den Bounding Boxes gebaut | `src/world/contactShadows.ts` |
| Wasser | Eigener Shader (GLSL und WGSL), zweimal gezeichnet: Multiplizieren (Transmission) und Addieren (Streulicht, Himmel, Glitzern, Schaum). Die Wasserdicke pro Pixel kommt aus der Szenentiefe, dadurch glasklares Flachwasser, das mit der Tiefe türkis und dann tiefblau wird; Felsen unter Wasser bleiben sichtbar. Spitzenschaum aus einer Lace-Textur, gesteuert über ein beim Start berechnetes Distanzfeld (Abstand zur Küste und zu Felsen, Steinen, Stegpfosten): Saum am Ufer, einlaufende Schaumlinien, pulsierende Ringe. Leichtes Auf und Ab am Ufer, laufende Kaustiken auf dem Meeresboden. Farben und Stärken in `WATER_LOOK` | `src/water/water.ts`, `waterShader.ts`, `foamField.ts`, `caustics.ts` |
| Wind | Palmen, Büsche, Farne und Gras wiegen sich im Wind (Material-Plugin im Vertex-Shader, GLSL und WGSL): langsames Schwingen nach Höhe, Böen, Blattflattern, jede Pflanze phasenversetzt. Die Schatten bleiben in Ruhelage | `src/world/wind.ts`, Einstellungen je Asset in `assets.ts` |
| Assets | 24 GLBs, LOD-Umschaltung nach Kameradistanz, Collider ausgeblendet; wiederholte Teile als Thin Instances (ein Draw Call pro Mesh) | `src/world/assets.ts` |
| Szene | Hütte, Werkbank, Feuerstelle (Steinring, Feuerholz, Dreibein aus Stangen, Flammen, Rauch, flackerndes Licht), Holzstapel, Bretter, Steg aus Stangen und Planken, Felsen, Kieselgruppen im Sand, Möwe, Seesterne, Palmen, Büsche, Farne, Gras | `src/world/beachLayout.ts`, `src/world/camp.ts` |
| Charakter | `IO_Character_A` mit Idle und Walk (weich überblendet). Läuft für den Test selbstständig zwischen Feuer, Holzstapel, Werkbank und Ufer hin und her; ein Klick auf den Sand schickt ihn dorthin. Noch ohne Kollision und Wegfindung. Fällt auf eine Kapsel zurück, wenn das GLB fehlt | `src/character/character.ts`, `placeholder.ts` |
| HUD | React über dem Canvas | `src/ui/` |

Weitere Platzhalter: Kisten (Boxen), Kochtopf (Halbkugel). Feuer, Rauch und Schaum entstehen im Browser, wie in der Asset-Liste vorgesehen.

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

Läuft über SwiftShader (Software-Rendering), die FPS im HUD sind dort bedeutungslos. Echte Messungen nur im normalen Browser.

## Nächste Schritte

1. Charakter: Kollision mit Hütte, Feuer und Holz; weitere Clips (PickUp, Carry…) an Aktionen hängen, sobald island-sim Aktionen liefert.
2. Wasser: Brechung (Verzerrung des Bodens), echte Wellen, Schaum auch außerhalb des Strandtest-Bereichs (Distanzfeld deckt nur x −14…34, z −28…28 ab). Meeresboden am Steg tiefer modellieren, damit das Wasser dort dunkler wird wie im Zielbild.
3. Wind auch in den Schatten; Wind-Gewichte aus den GLBs (`TEXCOORD_1`) nutzen statt der Höhe, sobald die Palmen sie auch haben.
4. Kisten, Topf und weitere fehlende Requisiten aus der Asset-Liste.
5. Licht: HDR-Umgebung statt Verlaufskuppel, Ambient Occlusion ohne Fehler am Wasser.
6. Performance-Profile LOW/MEDIUM/HIGH (Handoff §24), KTX2-Texturen, Bundle aufteilen.
