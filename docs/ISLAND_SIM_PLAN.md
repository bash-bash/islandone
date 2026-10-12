# island-sim – Planung v0

Stand: 11.10.2026. Grundlage: `ISLANDONE_CODING_AGENT_HANDOFF.md` (zitiert als §), Stand von `island-render` auf `main`.

## 1. Ist island-sim wirklich der nächste Schritt?

Ja, mit zwei Einschränkungen.

- §31 nennt island-sim sogar als **Priorität 1**, island-render als Priorität 2 und die Zusammenführung als Priorität 3 „erst wenn beide Prototypen unabhängig funktionieren“. Die Reihenfolge wurde in der Praxis vertauscht (erst Grafik), das ist durch §34 gedeckt. Jetzt fehlt genau der zweite Prototyp, ohne den §31/3 nicht beginnen darf.
- §32 („keine große Asset-Bibliothek vorab“) spricht dagegen, jetzt weiter Blender-Assets zu produzieren. Welche Dinge die Welt braucht, soll aus der Simulation kommen.
- **Einschränkung 1:** island-render ist laut Thread fertig, aber §35 ist nirgends formal abgehakt. Sinnvoll ist ein kurzer Abgleich der §35-Liste (alle Punkte sind laut `island-render/README.md` vorhanden) und dann ein bewusster Schnitt: Grafik ruht bis zur Zusammenführung, außer Bugs.
- **Einschränkung 2:** §36 ist nur das Abnahmekriterium. Der eigentliche Knackpunkt ist nicht die Laufzeit (100 × 30 Tage ist rechnerisch klein), sondern dass Hypothesen, Lernen und Capability Gaps **ohne LLM** (§31/1: „no real LLM“) regelbasiert entstehen müssen. Das muss vor dem ersten Code geplant werden, sonst entsteht eine versteckte Tech-Tree-Logik (§5).

## 2. Was §36 konkret verlangt

```text
CLI oder Test-Runner:  100 Seeds × 30 virtuelle Tage
reproduzierbare Kennzahlen: survival, hypotheses, capability gaps,
                            strategy changes, learning events, idle rate
gleicher Seed => gleiches Ergebnis
Figur hat keinen Zugriff auf verborgenes Weltwissen
```

Dazu §26 (Mindestumfang): deterministische Tick-Schleife, Seed-Zufall, Bedürfnisse, Weltzustand, Beobachtungen, Überzeugungen, Hypothesen, Erinnerungen, Capability Gaps, Strategy Fatigue, Weltereignisse, Ereignisprotokoll, Auswertung.

## 3. Entscheidungen, die vor dem Code fallen müssen

Mit Vorschlag. Die fett markierten Punkte hat Chris am 11.10.2026 entschieden (✅); der Rest ist technischer Standard.

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Sprache / Ort | TypeScript, eigener Ordner `island-sim/` neben `island-render/`, Node-CLI, Tests mit Vitest. Gleiche Sprache wie der Renderer, damit Typen bei der Zusammenführung geteilt werden können und die Sim später auch im Browser oder Worker laufen kann. |
| 2 | **Inhaltsumfang der Welt v0** | ✅ Entschieden: wie vorgeschlagen. Klein und kausal: Süßwasserquelle, Kokosnüsse/Früchte, Fische im Flachwasser, Treibholz, Äste, Palmfaser, Steine (rund, flach, scharfkantig). Latent (§8), unentdeckt am Start: z. B. Harz, Ton, Salz, eine giftige Pflanze. Keine Tiere außer einer Fischpopulation (§12, §32). |
| 3 | **Problemketten v0** | ✅ Entschieden: zwei Ketten. (a) Nahrung sichern (Fische schwer zu fangen → Werkzeug/Methode), (b) Schutz vor Regen/Sturm (Unterstand aus Teilen). Wasser überqueren kommt erst nach v0. Kein festes Rezept, nur Teile, Eigenschaften und Verbindungen (§13). |
| 4 | Raum | Kein Physikraster. Die Insel als kleiner Graph von Orten (Strand, Camp, Quelle, Waldrand, Felsen, Flachwasser, …) mit Wegzeiten und Ressourcenbeständen. Ortsnamen so wählen, dass sie später auf Punkte im 30-m-Strandtest abbildbar sind. |
| 5 | Zeit | 1 Tick = 1 virtuelle Minute → 43 200 Ticks pro Lauf, 4,3 Mio. für §36. Aktionen dauern mehrere Ticks. Nacht und Schlaf als Teil der Bedürfnisse, kein Lichtmodell. |
| 6 | **Denken ohne LLM** | Siehe Abschnitt 4. Die Hypothesen-Erzeugung ist eine austauschbare Schnittstelle, damit später ein LLM sie übernehmen kann (§27). |
| 7 | **Erfolgsziel neben §36** | ✅ Entschieden: gehört zur Abnahme. §36 misst nur, ob Kennzahlen reproduzierbar entstehen. Vorschlag zusätzlich: über 100 Seeds sollen die Läufe sichtbar *verschieden* verlaufen (Streuung bei Strategiewechseln und Entdeckungszeitpunkten), sonst ist es ein verkapptes Skript (§37). |

## 4. Kernproblem: Erkenntnis ohne LLM und ohne Tech-Tree

Vorgeschlagene Kette, alles deterministisch und seed-gesteuert:

```text
Welt (objektiv) --Wahrnehmung--> Beobachtung --> Überzeugung (mit Konfidenz)
                                                   |
Problem (aus Bedürfnis/Misserfolg) --> Hypothesen-Generator --> Experiment
                                                   |
                    Ergebnis (von der Welt berechnet) --> Erinnerung, Konfidenz-Update
                                                   |
                    Präferenzen / Planer ändern sich  ==> "Lernereignis"
```

- **Wissen der Figur = Eigenschaften und Operationen, keine Technologien.** Bekannte Operationen: aufheben, tragen, schlagen, binden, stapeln, ins Wasser legen, ans Feuer halten usw. Bekannte Eigenschaften: „schwimmt“, „scharf“, „bricht“, „biegsam“, „hält Regen ab“ – jeweils pro Objekt oder Objektklasse mit Konfidenz.
- **Hypothesen-Generator v0 (regelbasiert):** Analogie („Objekt A schwimmt, B ist ähnlich → B schwimmt?“), Kombination („Problem braucht Eigenschaft P; welche bekannten Dinge oder Verbindungen könnten P haben?“), Variation nach Misserfolg (anderes Material, andere Form, anderer Ort, andere Methode – genau die Liste aus §5 Strategy Fatigue). Auswahl gewichtet per Seed-Zufall, damit Seeds verschieden verlaufen. Falsche, aber plausible Hypothesen sind ausdrücklich erlaubt (§5).
- **Ergebnisse kommen ausschließlich aus der Welt.** Der Weltzustand rechnet aus, ob die Konstruktion hält, schwimmt, bricht. Die Figur sieht nur das Ergebnis als Beobachtung.
- **Strategy Fatigue:** (Ab Etappe 5 mit Denker: aus dessen eigenen Worten, siehe §9.) Zähler je (Problem, Ansatz). Wiederholte ähnliche Fehlschläge erhöhen ihn; über einer Schwelle wird der Ansatz gemieden oder das Problem pausiert.
- **Capability Gap:** (Ab Etappe 5 mit Denker: aus dessen eigenen Worten, siehe §9.) Nach N Fehlschlägen ohne ausreichende Lösung als gewünschte *Eigenschaften* formuliert (§7), nie als Technologie-Name. Creator Backlog (§9) nur als internes Protokoll, für die Figur unsichtbar.
- **Satisficing (§5):** Lösung wird akzeptiert, sobald sie eine Mindestgüte erreicht; kein Optimieren bis zum Maximum.
- **Lernen muss Verhalten ändern (§5):** Ein „Lernereignis“ zählt erst, wenn eine geänderte Überzeugung später nachweislich eine Planentscheidung beeinflusst. Das ist auch die Definition für die Kennzahl.

## 5. Erkenntnisschranke (§5, §28, §36) technisch absichern

- Zwei getrennte Module: `world/` (objektive Wahrheit) und `mind/` (Figur). `mind/` darf `world/` nicht importieren; das prüft ein Architektur-Test im CI.
- Einziger Kanal Welt → Figur: eine `perceive()`-Funktion, die `Observation`-Objekte erzeugt (sichtbare, fühlbare Merkmale; keine Material-IDs wie `copper_bearing`).
- Einziger Kanal Figur → Welt: `Action`-Objekte. Die Welt entscheidet über das Ergebnis.
- Regressionstest: Eine latente Eigenschaft darf in keinem Seed vor ihrer ersten Beobachtung in den Überzeugungen auftauchen.

## 6. Determinismus

- Eigener Seed-PRNG (z. B. PCG32 oder xoshiro128), kein `Math.random`, kein `Date`, keine Abhängigkeit von Objekt-Iterationsreihenfolge (sortierte IDs).
- Getrennte Zufallsströme pro Subsystem (Wetter, Welt, Figur), damit eine Änderung im Wetter nicht alle anderen Abläufe verschiebt.
- Jeder Lauf schreibt einen Hash über das Ereignisprotokoll. Test: zweimal derselbe Seed → identischer Hash; ein „Golden“-Test mit festen Hashes für ein paar Seeds fängt ungewollte Verhaltensänderungen.

## 7. Weltereignisse v0 (§11)

Zufall bestimmt *dass* etwas passiert, die Folgen entstehen kausal:

```text
Sturm -> stärkere Wellen -> Treibholz am Strand, Unterstand beschädigt
Regen -> Feuer geht aus, Material wird nass, Quelle füllt sich
Hitze -> Durst steigt schneller
Wind  -> herabfallende Äste am Waldrand
Fischerei -> Fischbestand sinkt -> Fang wird schwerer (§12)
```

## 8. Kennzahlen (§30, §36) – Definitionen festlegen

| Kennzahl | Vorschlag Definition |
|---|---|
| Survival | Lebt die Figur an Tag 30; sonst Todestag und Ursache |
| Hypotheses | Anzahl erzeugter Hypothesen, davon getestet / bestätigt / widerlegt |
| Capability Gaps | Anzahl offen / gelöst / pausiert |
| Strategy Changes | Wechsel des Ansatzes für dasselbe Problem |
| Learning Events | Überzeugungsänderung, die später eine Planentscheidung beeinflusst |
| Idle Rate | Wache Ticks ohne zielgerichtete Aktion / alle wachen Ticks |
| Zusätzlich | Hypothesen-Vielfalt, Entdeckungszeitpunkte, Strategy-Loop-Rate, Anzahl Konstruktionen |

Ausgabe pro Seed als JSON, dazu eine Zusammenfassung über alle Seeds (Mittelwert, Median, Streuung) als Markdown/CSV.

## 9. Etappen

1. ✅ **Gerüst:** `island-sim/` mit CLI (`npm run sim -- --seeds 100 --days 30`), PRNG, Tick-Schleife, Ereignisprotokoll, Determinismus-Test.
2. ✅ **Körper und Welt:** Orte, Ressourcen, Bedürfnisse (Hunger, Durst, Energie, Temperatur, Gesundheit), einfache Routineaktionen, Wetter. Ziel: Figur überlebt oder stirbt nachvollziehbar.
3. ✅ **Wahrnehmung und Wissen:** `perceive()`, Beobachtungen, Überzeugungen mit Konfidenz, Erinnerungen, Architektur-Test für die Erkenntnisschranke.
4. ✅ **Probleme, Hypothesen, Experimente:** Hypothesen-Generator, Experimente mit von der Welt berechneten Ergebnissen, einfache Teile-und-Verbindungen-Konstruktionen (§13).
5. **Denken durch AI, Fatigue, Gaps, Satisficing, Lernereignisse.** Entscheidung Chris, 12.10.2026: Die Figur bekommt kein festes Vorgehen. Ein LLM denkt für sie („ah, ich brauche Feuer“) und soll einen großen Teil ausmachen; die Welt liefert nur Physik. Umgesetzt im ersten Teil: Denk-Schnittstelle mit Sicht der Figur, Claude als Denker mit Aufzeichnung, neugieriger Ersatz ohne LLM, Feuer, Nässe von Material, kühle Nächte, knapper werdende Fische. Erster Lauf mit Claude erledigt (Seed 3, 2 Tage); Sonnet 5.5 ist der Standard-Denker, weil es im Vergleich günstiger war und Feuer machte. Zweiter Teil: Strategy Fatigue und Capability Gaps entstehen aus den Gedanken. Die Figur erinnert sich, was sie schon mehrmals getan hat und was dabei herauskam, und zeigt das dem Denker; ob er feststeckt (und ob er Material, Form, Ort oder Vorgehen ändert oder pausiert) und welche Eigenschaften ihm fehlen, sagt er selbst. Gemessen wird zusätzlich, wie oft derselbe Handgriff ohne neues Ergebnis wiederholt wurde (`longestSameTry`), damit man sieht, ob der Denker es bemerkt hat. Creator Backlog (§9) steht noch aus.
6. **Auswertung:** alle Kennzahlen, Lauf über 100 Seeds, Bericht. Abnahme nach §36 plus Vielfalt: die Seeds müssen bei Strategiewechseln und Entdeckungszeitpunkten messbar streuen. Entscheidung Chris, 12.10.2026: §36 (100 Seeds × 30 Tage) läuft kostenlos ohne LLM; mit Claude eine Stichprobe, 10 Seeds × 30 Tage mit Haiku 5.5 und 10 Seeds × 5 Tage mit Sonnet 5.5 zum Vergleich. Hypothesen und Lernereignisse kommen mit Denker wie Fatigue und Gaps aus dessen eigenen Worten (Vermutung mit Plan, eigenes Urteil, Lehre; Lernereignis, wenn ein späterer Gedanke darauf aufbaut). Dazu das Creator Backlog (§9): Nach den Läufen prüft Claude als Weltautorin jede genannte Lücke gegen einen Katalog dessen, was die Welt (auch latent) bietet; nur was fehlt, kommt ins Backlog. `npm run report` stellt alles nebeneinander.
7. Danach erst: Zusammenführung mit island-render (Ereignisstrom → `goTo` und HUD-Werte, die dort schon als Platzhalter vorgesehen sind).

## 10. Bewusst nicht in v0 (§32)

Grafik, LLM, mehrere Figuren, Netzwerk, komplexe Tier-KI, Wirtschaft, Rezepte, große Inhaltsmengen, automatische Inhaltserzeugung.
