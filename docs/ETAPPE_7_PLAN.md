# Etappe 7 – Simulation und Grafik zusammenführen

Stand: 23.10.2026. Grundlage: `ISLAND_SIM_PLAN.md` §9 Etappe 7, Entscheidungen von Chris vom 17.10.2026 (11-Stunden-Inseltag, Sonnet 5.5 im normalen Takt, höchstens 40 € im Monat) und vom 23.10.2026 (die Insel läuft auf Vercel, Vercel Pro mit Cron jede Minute).

## 1. Ziel

Eine Insel läuft rund um die Uhr. Sonnet denkt für die Figur, island-sim rechnet die Welt, und jeder Zuschauer sieht im Browser dieselbe Figur zur selben Zeit am selben Ort. Ein Inseltag dauert 11 echte Stunden (1440 Ticks, 27,5 s pro Tick). Die Kosten hängen an der Zahl der Inseln, nicht an der Zahl der Zuschauer.

## 2. Der Ereignisstrom (steht seit diesem PR)

```text
island-sim                                   island-render
runSimulation ── onEvent/onTick ──> FeedRecorder ──> Feed (JSON) ──> feedPlayer
                                       │                                ├─ Figur: goTo(Ort)
                                       │                                └─ HUD: Uhr, Bedürfnisse, Ziel und Schritte,
                                       │                                         Getragenes, letzter Moment
                                       └─ Bilder: bei jeder neuen Aktion und alle 10 Ticks
                                          Momente: Gedanken, Entdeckungen, Lehren, Lücken, Feuer, Wetter, Tod
```

- **Typen** in `island-sim/src/live/feedTypes.ts`, ohne Imports, damit island-render sie direkt importieren kann.
- **Nur zuschauen:** Der Recorder hängt an den Haken `onEvent` und `onTick` von `runSimulation` und ändert nichts. Ein Test prüft, dass der Fingerabdruck mit und ohne ihn gleich ist.
- **Klartext für Zuschauer:** Der Zuschauer ist nicht die Figur. Der Strom sagt also, was wirklich passiert („sammelt Treibholz“, „geht zur Quelle im Inland“). Die Erkenntnisschranke der Figur bleibt davon unberührt, weil `src/live/` nur außerhalb von `src/mind/` liest.
- **Orte auf dem Strand:** `island-render/src/sim/placeMap.ts`. Die Quelle im Inland (p4) liegt außerhalb des 30-m-Strandes. Die Figur geht dort in den Dschungel und verschwindet, bis sie zurückkommt.
- **Ausprobieren ohne Server:** `npm run feed -- --seed 3 --hours 30` in island-sim (spielt die Sonnet-Aufzeichnung aus Etappe 6 kostenlos ab). Danach island-render mit `?feed=feeds/seed-3.json&speed=600`. Eine Beispieldatei liegt in `island-render/public/feeds/seed-3.json`.

## 3. Die Insel auf Vercel

**Zustand = Seed + aufgezeichnete Gedanken + Startzeit.** Der Weltzustand wird nie gespeichert. Um von Tick 0 bis „jetzt“ zu kommen, wird der Lauf aus der Aufzeichnung nachgerechnet; nur Momente, die noch nicht aufgezeichnet sind, fragen Claude. Gemessen mit `computeFeed`: 5 Inseltage nachrechnen 0,15 s, 30 Tage 0,2 s, 60 Tage (etwa 27 echte Tage) 0,3 s. Ein Stand vom Weltzustand (Snapshot) ist erst nötig, wenn eine Insel viele Monate läuft.

```text
Vercel Cron (jede Minute) ──> /api/tick
    1. Sperre in Redis holen (nie zwei Läufe gleichzeitig, sonst denkt Claude doppelt)
    2. Aufzeichnung laden, bis "jetzt + 10 Minuten" nachrechnen, neue Gedanken bei Claude holen
    3. neue Gedanken an die Aufzeichnung hängen, Kosten zählen
    4. Ereignisstrom der letzten 2 Inselstunden als JSON ablegen
Zuschauer ──> /api/island  (liefert den abgelegten Strom, 30 s im CDN zwischengespeichert)
    feedPlayer mit startedAt: Uhr = echte Zeit, holt alle 30 s nach
```

- **Speicher:** Upstash Redis über den Vercel Marketplace (Aufzeichnung als Liste, Startzeit, Sperre, Kostenzähler, letzter Strom). Angesprochen über die REST-Schnittstelle, ohne Zusatzbibliothek (`island-sim/src/live/redisStore.ts`).
- **Code:** `island-sim/src/live/island.ts` (`advanceIsland`, ohne Uhr und ohne Speicher-Details, mit Tests), `island-sim/api/tick.ts` und `island-sim/api/island.ts` (die beiden Funktionen). `node island-sim/scripts/build-vercel.mjs` baut alles im Build-Output-Format von Vercel: die Seite statisch, die Funktionen mit esbuild gebündelt, den Cron in `config.json`. `vercel.json` im Wurzelordner ruft das auf.
- **Nur Vercel Cron darf `/api/tick` aufrufen:** Vercel schickt `CRON_SECRET` mit; ohne passendes Secret antwortet die Funktion mit 401, weil jeder Aufruf Geld kosten kann.
- **Höchstens 12 neue Gedanken pro Aufruf:** Nach einem Ausfall holt die Insel in mehreren Minuten auf, statt einen Aufruf über das Zeitlimit laufen zu lassen. Bezahlte Gedanken werden auch dann gespeichert, wenn ein Aufruf abbricht.
- **Takt:** Mit Sonnet denkt die Figur rund 45-mal pro Inseltag, also etwa 4-mal pro echter Stunde. Jeder Aufruf von `/api/tick` hat also selten mehr als einen Gedanken (5 bis 15 s) und bleibt weit unter dem Zeitlimit einer Funktion.
- **Vorlauf von 10 Minuten:** Zuschauer sehen nie eine Lücke, auch wenn ein Cron-Aufruf ausfällt.
- **Geheimnisse:** `ISLAND_SIM_API_KEY` (Claude) und die Redis-Zugangsdaten als Umgebungsvariablen im Vercel-Projekt, nie im Code.
- **Kostenbremse:** Ein Zähler in Redis summiert die geschätzten Kosten pro Monat (`costOf` aus `llm.ts`). Bei 40 € übernimmt der kostenlose neugierige Denker bis zum Monatsende, damit die Insel weiterläuft.

## 4. Offene Entscheidungen für Chris

| # | Frage | Vorschlag |
|---|---|---|
| 1 | ✅ Entschieden (23.10.2026): Vercel Pro mit Cron jede Minute | |
| 2 | Was passiert, wenn die Figur stirbt? | Der Tod ist zu sehen. Am nächsten Inselmorgen beginnt eine neue Insel mit dem nächsten Seed |
| 3 | Was passiert bei einem Code-Update, das das Verhalten ändert? Dann passen die aufgezeichneten Gedanken nicht mehr zum Nachrechnen | Jede Insel merkt sich die Code-Version (`simVersion`: Fingerabdruck eines Inseltags mit dem neugierigen Denker samt allem, was er zu sehen bekam). Ändert sie sich, endet die alte Insel und eine neue beginnt |
| 4 | Kostenbremse bei 40 € | Der neugierige Denker übernimmt bis zum Monatsende (statt die Insel anzuhalten) |

## 5. Reihenfolge

1. ✅ **Ereignisstrom und Abspielen im Browser** (dieser PR): `src/live/` in island-sim, `src/sim/` in island-render, `?feed=`.
2. ✅ **Insel auf Vercel (Code):** `/api/tick` und `/api/island`, Redis, Cron, Kostenbremse, Live-Modus im Player (holt alle 30 s nach). Ende-zu-Ende geprüft mit dem gebauten Bündel gegen ein nachgebautes Redis. Fehlt: das Vercel-Projekt selbst (siehe §6).
3. **Die Welt im Bild:** Lagerfeuer brennt nur, wenn die Simulation ein Feuer am Camp hat; Gebautes erscheint am Ort; Regen und Sturm; Schlafen. Dazu die Animationen Heben und Tragen aus `character/source_anims` an die Aktionen `take` und `drop` hängen.
4. **Creator Backlog aus Etappe 6:** Netz oder Reuse für Fische, ein Bindemittel stärker als Faser (etwa Harz), ein Mittel gegen Übelkeit.

## 6. Einrichten auf Vercel (einmalig, durch Chris)

1. Vercel-Team auf Pro stellen (Cron jede Minute).
2. Neues Projekt aus dem Repository `bash-bash/islandone`, Wurzelordner `/` lassen. Framework „Other“; Install- und Build-Befehl kommen aus `vercel.json`.
3. Unter Storage (Marketplace) eine Upstash-Redis-Datenbank anlegen und mit dem Projekt verbinden. Das setzt `KV_REST_API_URL` und `KV_REST_API_TOKEN`.
4. Umgebungsvariablen setzen: `ISLAND_SIM_API_KEY` (Claude-API-Schlüssel) und `CRON_SECRET` (eine lange Zufallszeichenkette). Optional `ISLAND_MONTHLY_BUDGET_USD` (Standard 43 $, etwa 40 €).
5. Deployen. Unter Settings → Cron Jobs sollte `/api/tick` mit `* * * * *` stehen. Nach der ersten Minute zeigt die Seite die Live-Insel; vorher läuft der Platzhalter.
