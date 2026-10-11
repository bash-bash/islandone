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

Steuerung: linke Maustaste drehen (ein kurzer Klick auf den Sand schickt den Charakter dorthin), rechte Maustaste verschieben, Mausrad zoomen. Oben links zeigt das HUD Renderer, FPS, Draw Calls, Dreiecke und den Ladestand der Assets.

Im Browser-Konsolenfenster liegt `window.islandone` (`engine`, `scene`, `camera`, `library`), z. B. für den Babylon-Inspector.

## Was drin ist

| Bereich | Stand | Datei |
|---|---|---|
| Engine | WebGPU mit WebGL-2-Fallback | `src/engine/createEngine.ts` |
| Kamera | Orbit, erhöht, Neigung und Zoom begrenzt | `src/engine/camera.ts` |
| Himmel und Licht | Verlaufs-Himmelskuppel, Sonne mit weichen Schatten, Himmels-Fülllicht, Dunst, ACES-Tonemapping | `src/world/sky.ts`, `src/engine/startIsland.ts` |
| Terrain | **Platzhalter**: prozeduraler Strand 90 × 90 m (Sand, nasser Sand, Meeresboden, Dschungelboden), bis `IO_Terrain_Beach_Test_30m` aus Blender kommt | `src/world/terrain.ts` |
| Wasser | erste Fassung: Tiefenfarbe und Transparenz, zwei laufende Normal-Maps, Fresnel-Spiegelung des Himmels, Uferschaum, der an den Strand läuft | `src/water/water.ts` |
| Assets | 24 GLBs, LOD-Umschaltung nach Kameradistanz, Collider ausgeblendet; wiederholte Teile als Thin Instances (ein Draw Call pro Mesh) | `src/world/assets.ts` |
| Szene | Hütte, Werkbank, Feuerstelle (Steinring, Feuerholz, Dreibein aus Stangen, Flammen, Rauch, flackerndes Licht), Holzstapel, Bretter, Steg aus Stangen und Planken, Felsen, Möwe, Seesterne, Palmen, Büsche, Farne, Gras | `src/world/beachLayout.ts`, `src/world/camp.ts` |
| Charakter | `IO_Character_A` mit Idle und Walk (weich überblendet). Läuft für den Test selbstständig zwischen Feuer, Holzstapel, Werkbank und Ufer hin und her; ein Klick auf den Sand schickt ihn dorthin. Noch ohne Kollision und Wegfindung. Fällt auf eine Kapsel zurück, wenn das GLB fehlt | `src/character/character.ts`, `placeholder.ts` |
| HUD | React über dem Canvas | `src/ui/` |

Weitere Platzhalter: Kisten (Boxen), Kochtopf (Halbkugel). Feuer, Rauch und Schaum entstehen im Browser, wie in der Asset-Liste vorgesehen.

Koordinaten: Meter, Y oben, Land bei −X, Meer bei +X, Wasserspiegel y = 0.

## Assets aktualisieren

Die GLBs liegen unter `public/assets/` und werden mitversioniert, damit der Test ohne weitere Schritte läuft. Nach neuen Blender-Exporten:

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

1. `IO_Terrain_Beach_Test_30m` und `IO_Seafloor_Test_30m` in Blender, dann `terrain.ts` ersetzen.
2. Charakter: Kollision mit Hütte, Feuer und Holz; weitere Clips (PickUp, Carry…) an Aktionen hängen, sobald island-sim Aktionen liefert.
3. Wasser als eigener Shader: Refraktion, Kaustiken auf dem Meeresboden, Schaum an Felsen und Steg.
4. Wind für Palmen, Gras und Farne (die GLBs haben schon Wind-Gewichte in `TEXCOORD_1/2`).
5. Kisten, Topf und weitere fehlende Requisiten aus der Asset-Liste.
6. Performance-Profile LOW/MEDIUM/HIGH (Handoff §24), KTX2-Texturen, Bundle aufteilen.
