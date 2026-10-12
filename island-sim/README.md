# island-sim – Simulation ohne Grafik

Autonome Figur, Weltzustand und Auswertung, ohne Grafik (Handoff §26, §31). Das Denken der Figur kann ein LLM (Claude) übernehmen. Plan und Etappen: [`docs/ISLAND_SIM_PLAN.md`](../docs/ISLAND_SIM_PLAN.md).

Stand: **Etappe 6 (Auswertung über viele Seeds, Creator Backlog)**. Die Insel hat sieben Orte mit Quelle, Meer, Früchten, Beeren, Kokospalmen, Muscheln, Fischen und Material (Steine, Äste, Treibholz, Fasern, Palmwedel). Die Figur hat Durst, Hunger, Müdigkeit, Kälte, Nässe, Übelkeit und Gesundheit, ordnet Dinge nach ihrem Aussehen in eigene Kategorien und bildet Überzeugungen mit Konfidenz.

**Denken (Etappe 5):** In freier Zeit hält die Figur inne und denkt nach, wenn etwas Neues passiert ist, ein Plan nicht klappt oder fertig ist. Ein austauschbarer *Denker* bekommt dann nur ihre eigene Sicht (Gesehenes, Gefühltes, Erinnertes, Überzeugungen, letzte Gedanken) und antwortet mit einem Gedanken, einem Ziel und den nächsten Handgriffen. Niemand sagt ihm, wozu etwas gut ist: Es gibt kein Rezept „kalt → Feuer“. Die Welt kennt nur Physik: Trockenes Holz kräftig an Holz gerieben wird warm, raucht und hinterlässt manchmal glühenden Staub; legt man etwas Trockenes, Feines darauf, flammt es auf. Feuer wärmt, trocknet, gart Fisch und Muscheln, frisst Holz und geht im Regen aus. Regen macht offen liegendes Material nass, Sonne trocknet es. Nächte sind kühl, Fische werden bei starkem Fang knapp. Denker sind Claude (`src/thinkers/llm.ts`, jede Antwort wird zur Reproduzierbarkeit aufgezeichnet) oder ein neugieriger Ersatz ohne LLM für Tests (`src/thinkers/curious.ts`). Ohne Denker laufen die Regeln aus Etappe 4 (Werkzeuge und Unterstand per Hypothese und Experiment); sie bleiben nur noch als Vergleich und für die §36-Kennzahlen.

Ergebnis 100 Seeds × 30 Tage: Mit dem neugierigen Ersatz denkt die Figur rund 960-mal pro Lauf, ist praktisch nie ohne Ziel (Idle-Rate unter 1 %) und bringt in 72 von 100 Läufen ohne Anleitung eine Flamme zustande; 94 überleben (5 Kältetode, 1 Erschöpfung). Mit den Etappe-4-Regeln ohne Denker überleben 96 (4 Kältetode in Sturmnächten), Idle-Rate 59 %. Läufe mit Claude: siehe unten.

**Ergebnis Etappe 6** ([`reports/etappe-6.md`](reports/etappe-6.md)): Die Abnahme nach §36 läuft ohne LLM: 100 Seeds × 30 Tage in 10 s, zweimal gerechnet identisch, alle 100 Läufe verschieden. Capability Gaps und Strategy Fatigue gibt es aber nur mit Claude als Denker, weil sie aus seinen Worten kommen. Stichprobe mit Claude (für rund 40 $ abgebrochen): Sonnet 5.5, 10 Seeds × 5 Tage, macht in 5 von 10 Seeds Feuer, findet Süßwasser nach im Schnitt 1,6 Stunden, ist 8 % der Zeit untätig, nennt pro Lauf etwa 2 Lücken, steckt etwa 17-mal fest und hat etwa 50 Lernereignisse, mit deutlicher Streuung zwischen den Seeds; etwa 0,60 $ pro Seed und Tag. Haiku 5.5 kostet etwa ein Zwanzigstel, reicht aber nicht: in 10 Seeds × 5 Tagen kein Feuer, Süßwasser erst nach rund 26 Stunden, 23 % untätig, und es meldet bei fast jedem Gedanken Feststecken, Lücken und Vermutungen (in 30 Tagen über 500 Lücken pro Lauf), sodass seine Kennzahlen nichts aussagen. Das Creator Backlog prüfte 126 der genannten Lücken: 113 kann die Welt schon erfüllen, wirklich fehlen ein Netz oder eine Reuse für Fische, ein Bindemittel stärker als Faser (etwa Harz) und ein Mittel gegen Übelkeit.

## Starten

```bash
cd island-sim
npm install
npm run sim                       # 100 Seeds × 30 Tage, Ergebnisse in out/
npm run sim -- --seeds 10 --days 5 --first-seed 42 --out out/test
npm run sim -- --check            # alles zweimal rechnen, Fingerabdrücke vergleichen
npm run sim -- --thinker curious  # dasselbe mit dem neugierigen Denker statt der Regeln
npm run story -- --seed 1 --days 3 --thinker llm     # Claude denkt; Gedankenprotokoll in out/story-1.md
npm run story -- --seed 1 --days 3 --thinker replay  # dieselbe Aufzeichnung ohne Claude abspielen
npm run sim -- --thinker llm --model claude-haiku-5-5 --seeds 10 --days 30 --out out/haiku-30   # viele Seeds mit Claude
npm run sim -- --thinker replay --model claude-haiku-5-5 --seeds 10 --days 5 --out out/haiku-5  # dieselben Läufe kostenlos, kürzer
npm run report -- out/rules-30 out/haiku-30 out/sonnet-5 --creator ask --out report.md          # Vergleich und Creator Backlog
npm test                          # Tests (Vitest)
npm run typecheck
```

Ausgabe in `out/`: `run-<seed>.json` je Lauf, `summary.json` und `summary.md` über alle Läufe (Mittel, Median, Min, Max, Streuung je Kennzahl). Jeder Lauf hat einen Fingerabdruck (Hash über das ganze Ereignisprotokoll), der Batch einen über alle Läufe. Gleicher Seed und gleicher Code ergeben denselben Fingerabdruck.

## Denken mit Claude

```bash
export ANTHROPIC_API_KEY=...           # oder ein Profil über `ant auth login`
# In einer Claude-Code-Cloud-Session stattdessen ISLAND_SIM_API_KEY als Umgebungsvariable
# der Umgebung setzen: ANTHROPIC_API_KEY und ANTHROPIC_BASE_URL gehören dort Claude Code selbst.
export ISLAND_SIM_MODEL=claude-sonnet-5-5 # Standard; claude-opus-5-5 kostet doppelt so viel pro Token, claude-haiku-5-5 ist deutlich günstiger
export ISLAND_SIM_EFFORT=low           # Denktiefe pro Moment: low, medium, high
npm run story -- --seed 1 --days 3 --thinker llm
```

Claude bekommt die Sicht der Figur als JSON und antwortet strukturiert (Gedanke, Ziel, bis zu 6 Schritte). Jede Antwort landet in `recordings/seed-<n>.jsonl`, unter einem Hash der genauen Sicht. `--thinker replay` spielt den Lauf daraus identisch ab, ohne Claude zu fragen (§36: gleicher Seed, gleiches Ergebnis). Die Figur denkt höchstens 60-mal pro Tag und frühestens 30 Minuten nach dem letzten ungefragten Gedanken. Gemessen an Seed 3 über 2 Tage: Sonnet 5.5 brauchte 77 Gedanken für rund 0,78 $ (etwa 1 Cent pro Gedanke, knapp 40 Cent pro simuliertem Tag) und machte am ersten Tag Feuer; Opus 5.5 brauchte 51 Gedanken für rund 1,28 $ und kam nur bis zum Rauch. Deshalb ist Sonnet der Standard. Die Aufzeichnung in `recordings/seed-3.jsonl` (Geschichte: `recordings/seed-3-story.md`) stammt aus einem zweiten Sonnet-Lauf mit Strategy Fatigue und Capability Gaps: 100 Gedanken für rund 1,20 $, kein Feuer, dafür ein Dach. Die Figur sagt sechsmal selbst, dass sie feststeckt, wechselt beim Dach von langen Blättern zu Treibholz, benennt dann, was fehlt („flach und breit, deckt Lücken oben ab“), findet es in den gefallenen Wedeln und erklärt die Lücke für gelöst; ein Lauf über 100 Seeds × 30 Tage mit Claude ist deshalb nicht der Normalfall, sondern einzelne Seeds über wenige Tage.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/core/` | Seed-Zufall (xoshiro128**, ein eigener Strom je Subsystem), Zeit (1 Tick = 1 Minute), Ereignisprotokoll mit Fingerabdruck |
| `src/world/` | Objektive Welt, nur die Simulation kennt sie: Orte und Wege (`island.ts`), Körper (`body.ts`), was Aktionen bewirken (`actions.ts`), Wetter mit stündlichem Regen und Sturmfolgen wie Treibholz, Nachwachsen, Sturmschäden (`systems.ts`), Einzelstücke mit physikalischen Eigenschaften (`items.ts`), was ein Stück beim Essen-Holen bringt (`tools.ts`), wie viel Regen ein Bau abhält (`structures.ts`) |
| `src/perception/` | Einziger Weg von der Welt zur Figur: macht aus Weltzustand Gesehenes (Aussehen, Menge grob), Gefühltes (Stufen 0–4) und Geschmecktes. Arten und genaue Zahlen gehen nicht durch |
| `src/mind/` | Die Figur. Sieht nur `Observation`s, gibt nur `Action`s zurück. `categories.ts`: eigene Kategorien nach Aussehen. `beliefs.ts`: Überzeugungen mit Konfidenz (angeborene Erwartung plus Erfahrung). `memory.ts`: Gedächtnis für Erlebtes. `intuition.ts`: angeborenes Gespür, was ein Stück taugen könnte (nur nach Aussehen). `inquiry.ts`: Probleme, Hypothesen, Experimente, Auswertung (austauschbar, später LLM). `routineMind.ts`: Triebe, Wegfindung, Entscheidungen auf Basis der Überzeugungen; meldet, wenn Gelerntes eine Entscheidung ändert |
| `src/thinkers/` | Denker: `llm.ts` (Claude, strukturierte Antwort), `recorded.ts` (Aufzeichnung und Wiedergabe unter einem Hash der Sicht, für §36), `curious.ts` (Ersatz ohne LLM, nur Neugier). Importieren nie `world/` oder `perception/` |
| `src/analytics/` | Kennzahlen je Lauf und Zusammenfassung über alle Läufe; `runWords` sammelt, was der Denker in eigenen Worten gesagt hat (Lücken, Lehren) |
| `src/creator/` | Sicht der Weltautorin, nie der Figur: Katalog dessen, was die Welt (auch latent) bietet (`catalog.ts`), und das Creator Backlog (`backlog.ts`, Handoff §9), das jede genannte Lücke gegen den Katalog prüft. Läuft nach der Simulation auf ihren Ergebnissen |
| `src/sim.ts` | Tick-Schleife: Welt → Aktion abschließen → Wahrnehmung → Entscheidung. `createMind` tauscht die Figur aus (Tests, später LLM) |
| `src/batch.ts`, `src/cli.ts` | Viele Seeds rechnen (mit Claude mehrere gleichzeitig, `--concurrency`), Ergebnisse und geschätzte Kosten schreiben; Aufzeichnungen je Modell in `recordings/<model>/seed-<n>.jsonl` |
| `src/report.ts` | Mehrere Läufe nebeneinander: §36-Kennzahlen, Streuung über die Seeds, Creator Backlog |

## Regeln, die Tests absichern

- **Erkenntnisschranke (§5, §28):** `src/mind` darf nur aus `src/mind` und `src/core` importieren, und keine Beobachtung enthält Arten von Dingen, Ortsnamen oder genaue Körperwerte (`test/architecture.test.ts`).
- **Strategy Fatigue und Capability Gaps (Etappe 5):** kommen aus den Worten des Denkers, nicht aus Regeln. Die Sicht zeigt ihm nur, was er schon mehrmals selbst getan hat und was dabei herauskam (`tries`); sagt er, dass er feststeckt (`stuck`), oder dass ihm etwas mit bestimmten Eigenschaften fehlt (`missing`), merkt sich die Figur das und zeigt es ihm später wieder (`setAside`, `gaps`); als gelöst gilt eine Lücke, wenn er es sagt (`solved`). Getestet mit einem sturen Denker (`test/thinking.test.ts`).
- **Hypothesen und Lernen mit Denker (Etappe 6):** Auch sie kommen aus den Worten des Denkers. Mit einem Plan kann er eine Vermutung nennen (`guess`); die Figur zeigt ihm offene Vermutungen samt Plan wieder (`guesses`), bis er sagt, ob sie gestimmt haben und was er daraus mitnimmt (`checked`). Das ergibt eine Lehre (`lessons`); als Lernereignis zählt sie erst, wenn ein späterer Gedanke sagt, dass er darauf aufbaut (`using`, Plan §4). Ein Strategiewechsel ist ein Feststecken mit Änderung von Material, Form, Ort oder Vorgehen (`test/thinking.test.ts`).
- **Auswertung (Etappe 6):** Seeds nebeneinander gerechnet ergeben denselben Batch wie nacheinander; die Weltautorin beurteilt eine Lücke aus der Aufzeichnung wieder, statt neu zu fragen (`test/evaluation.test.ts`). Denker importieren auch den Katalog der Weltautorin nie (`test/architecture.test.ts`).
- **Denken und Feuer (Etappe 5):** Trockenes Holz kann glühen, nasses nie; Glut flammt auf Feinem auf; Regen löscht schneller. Mit Denker denkt die Figur, folgt ihren Plänen und ist kaum untätig; der neugierige Ersatz findet in den meisten Läufen ohne Anleitung zu einer Flamme; unmögliche Pläne führen zu neuem Nachdenken statt zum Absturz; der Denker sieht keine Arten und Ortsnamen; eine Aufzeichnung spielt sich identisch ab (`test/thinking.test.ts`). Denker importieren nie Welt oder Wahrnehmung (`test/architecture.test.ts`).
- **Probleme und Experimente (Etappe 4):** Die Welt bewertet Stücke nur nach Eigenschaften; jeder Lauf findet eine Werkzeug-Methode und baut einen Unterstand; bestätigt wird erst nach zwei Erfolgen; nach Sturmschäden wird meist gebunden neu gebaut; kein Hin-und-her zwischen Ideen; Hypothesen nennen Dinge nur per Kennung und Aussehen (`test/inquiry.test.ts`).
- **Lernen ändert Verhalten (Etappe 3):** Nach einmal Meerwasser wird keine andere Stelle Meer mehr probiert; Übelkeit nach Beeren wird den Beeren angelastet; jeder Lauf hat mindestens ein Lernereignis (`test/mind.test.ts`).
- **Körper (Etappe 2):** Wer nicht trinkt, verdurstet in 2,5–6 Tagen; die Routine-Figur trinkt spätestens am zweiten Tag frisches Wasser und überlebt fast immer 30 Tage; Meerwasser und Beeren werden pro Stelle höchstens zweimal probiert (`test/world.test.ts`).
- **Determinismus (§36):** kein `Math.random`, `Date` oder `performance.now` in der Simulation; gleicher Seed ergibt gleiches Ereignisprotokoll; 100 × 30 Tage zweimal gerechnet ergeben denselben Batch-Fingerabdruck (`test/determinism.test.ts`).
- **Zufallsströme sind unabhängig:** Zusätzliche Würfe im Wetter verschieben nicht die Würfe der Figur (`test/rng.test.ts`).
- **Golden-Fingerabdrücke:** Seeds 1–3 haben feste Fingerabdrücke als Snapshot. Ändert sich das Verhalten der Simulation absichtlich, mit `npx vitest run -u` aktualisieren und im Commit sagen, warum.
