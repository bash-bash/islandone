# island-sim – Simulation ohne Grafik

Autonome Figur, Weltzustand und Auswertung, ohne Grafik und ohne LLM (Handoff §26, §31). Plan und Etappen: [`docs/ISLAND_SIM_PLAN.md`](../docs/ISLAND_SIM_PLAN.md).

Stand: **Etappe 4 (Probleme, Hypothesen, Experimente)**. Die Insel hat sieben Orte mit Quelle, Meer, Früchten, Beeren, Kokospalmen, Muscheln, Fischen und Material (Steine, Äste, Treibholz, Fasern, Palmwedel). Die Figur hat Durst, Hunger, Müdigkeit, Kälte, Nässe, Übelkeit und Gesundheit, ordnet Dinge nach ihrem Aussehen in eigene Kategorien und bildet Überzeugungen mit Konfidenz. Seit Etappe 4 macht sie aus Misserfolgen Probleme („die harte runde Frucht geht nicht auf“, „ich werde hier nass“) und dazu Hypothesen, die sie in Experimenten prüft: ein Stück von dieser Stelle gegen jene Schwierigkeit, zwei Stücke zusammengebunden, so viele Stützen und Blätter an dieser Stelle. Ob es klappt, rechnet die Welt aus den Eigenschaften der Teile aus (Masse, Härte, Länge, Schärfe, Fläche, Bindung); es gibt keine Rezeptliste. Eine Methode gilt erst als bewährt, wenn sie mindestens zweimal funktioniert hat (Satisficing, §5), danach nutzt die Figur sie im Alltag. Sturm reißt lose Blätter vom Unterstand; dann gilt das Problem wieder als offen und sie baut ihn gebunden neu. Fatigue, Capability Gaps und Lernereignisse im Sinne von §5 folgen in Etappe 5.

Ergebnis 100 Seeds × 30 Tage (Stand dieser Etappe): alle Figuren überleben. Je Lauf entstehen im Mittel 3,5 Probleme und 25 Hypothesen, davon werden rund 9 getestet, 3,8 bestätigt und 3,2 widerlegt; es gibt 6 Strategiewechsel (0–12) und rund 7 Mahlzeiten mit Werkzeug. Jeder Lauf baut mindestens einen Unterstand. Die Idle-Rate liegt bei 61 %, weil nach gelösten Problemen außer Überleben noch wenig zu tun ist; das ist Thema von Etappe 5.

## Starten

```bash
cd island-sim
npm install
npm run sim                       # 100 Seeds × 30 Tage, Ergebnisse in out/
npm run sim -- --seeds 10 --days 5 --first-seed 42 --out out/test
npm run sim -- --check            # alles zweimal rechnen, Fingerabdrücke vergleichen
npm test                          # Tests (Vitest)
npm run typecheck
```

Ausgabe in `out/`: `run-<seed>.json` je Lauf, `summary.json` und `summary.md` über alle Läufe (Mittel, Median, Min, Max, Streuung je Kennzahl). Jeder Lauf hat einen Fingerabdruck (Hash über das ganze Ereignisprotokoll), der Batch einen über alle Läufe. Gleicher Seed und gleicher Code ergeben denselben Fingerabdruck.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/core/` | Seed-Zufall (xoshiro128**, ein eigener Strom je Subsystem), Zeit (1 Tick = 1 Minute), Ereignisprotokoll mit Fingerabdruck |
| `src/world/` | Objektive Welt, nur die Simulation kennt sie: Orte und Wege (`island.ts`), Körper (`body.ts`), was Aktionen bewirken (`actions.ts`), Wetter mit stündlichem Regen und Sturmfolgen wie Treibholz, Nachwachsen, Sturmschäden (`systems.ts`), Einzelstücke mit physikalischen Eigenschaften (`items.ts`), was ein Stück beim Essen-Holen bringt (`tools.ts`), wie viel Regen ein Bau abhält (`structures.ts`) |
| `src/perception/` | Einziger Weg von der Welt zur Figur: macht aus Weltzustand Gesehenes (Aussehen, Menge grob), Gefühltes (Stufen 0–4) und Geschmecktes. Arten und genaue Zahlen gehen nicht durch |
| `src/mind/` | Die Figur. Sieht nur `Observation`s, gibt nur `Action`s zurück. `categories.ts`: eigene Kategorien nach Aussehen. `beliefs.ts`: Überzeugungen mit Konfidenz (angeborene Erwartung plus Erfahrung). `memory.ts`: Gedächtnis für Erlebtes. `intuition.ts`: angeborenes Gespür, was ein Stück taugen könnte (nur nach Aussehen). `inquiry.ts`: Probleme, Hypothesen, Experimente, Auswertung (austauschbar, später LLM). `routineMind.ts`: Triebe, Wegfindung, Entscheidungen auf Basis der Überzeugungen; meldet, wenn Gelerntes eine Entscheidung ändert |
| `src/analytics/` | Kennzahlen je Lauf und Zusammenfassung über alle Läufe |
| `src/sim.ts` | Tick-Schleife: Welt → Aktion abschließen → Wahrnehmung → Entscheidung. `createMind` tauscht die Figur aus (Tests, später LLM) |
| `src/batch.ts`, `src/cli.ts` | Viele Seeds rechnen, Ergebnisse schreiben |

## Regeln, die Tests absichern

- **Erkenntnisschranke (§5, §28):** `src/mind` darf nur aus `src/mind` und `src/core` importieren, und keine Beobachtung enthält Arten von Dingen, Ortsnamen oder genaue Körperwerte (`test/architecture.test.ts`).
- **Probleme und Experimente (Etappe 4):** Die Welt bewertet Stücke nur nach Eigenschaften; jeder Lauf findet eine Werkzeug-Methode und baut einen Unterstand; bestätigt wird erst nach zwei Erfolgen; nach Sturmschäden wird meist gebunden neu gebaut; kein Hin-und-her zwischen Ideen; Hypothesen nennen Dinge nur per Kennung und Aussehen (`test/inquiry.test.ts`).
- **Lernen ändert Verhalten (Etappe 3):** Nach einmal Meerwasser wird keine andere Stelle Meer mehr probiert; Übelkeit nach Beeren wird den Beeren angelastet; jeder Lauf hat mindestens ein Lernereignis (`test/mind.test.ts`).
- **Körper (Etappe 2):** Wer nicht trinkt, verdurstet in 2,5–6 Tagen; die Routine-Figur trinkt spätestens am zweiten Tag frisches Wasser und überlebt 30 Tage; Meerwasser und Beeren werden pro Stelle höchstens zweimal probiert (`test/world.test.ts`).
- **Determinismus (§36):** kein `Math.random`, `Date` oder `performance.now` in der Simulation; gleicher Seed ergibt gleiches Ereignisprotokoll; 100 × 30 Tage zweimal gerechnet ergeben denselben Batch-Fingerabdruck (`test/determinism.test.ts`).
- **Zufallsströme sind unabhängig:** Zusätzliche Würfe im Wetter verschieben nicht die Würfe der Figur (`test/rng.test.ts`).
- **Golden-Fingerabdrücke:** Seeds 1–3 haben feste Fingerabdrücke als Snapshot. Ändert sich das Verhalten der Simulation absichtlich, mit `npx vitest run -u` aktualisieren und im Commit sagen, warum.
