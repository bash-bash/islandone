# island-sim – Simulation ohne Grafik

Autonome Figur, Weltzustand und Auswertung, ohne Grafik und ohne LLM (Handoff §26, §31). Plan und Etappen: [`docs/ISLAND_SIM_PLAN.md`](../docs/ISLAND_SIM_PLAN.md).

Stand: **Etappe 2 (Körper und Welt)**. Die Insel hat sieben Orte mit Quelle, Meer, Früchten, Beeren, Kokospalmen, Muscheln, Fischen und Material. Die Figur hat Durst, Hunger, Müdigkeit, Kälte, Nässe, Übelkeit und Gesundheit. Sie handelt nach angeborenen Trieben und merkt sich, welches einzelne Ding geholfen oder geschadet hat. Überzeugungen über Arten von Dingen, Hypothesen und Experimente kommen in Etappe 3–5.

Ergebnis 100 Seeds × 30 Tage (Stand dieser Etappe): alle Figuren überleben, frisches Wasser finden sie nach rund 12 Stunden, Meerwasser probieren sie in manchen Läufen und meiden die Stelle danach. Rund 64 % der wachen Zeit sind ohne Ziel (Idle-Rate), weil es außer Überleben noch nichts zu tun gibt. Eine Figur, die nichts tut, verdurstet nach 3–4 Tagen (Test). Gestorben wird bisher nur in Tests; schwierigere Bedingungen bringen die Problemketten in Etappe 4.

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
| `src/world/` | Objektive Welt, nur die Simulation kennt sie: Orte und Wege (`island.ts`), Körper (`body.ts`), was Aktionen bewirken (`actions.ts`), Wetter mit stündlichem Regen und Sturmfolgen wie Treibholz, Nachwachsen (`systems.ts`) |
| `src/perception/` | Einziger Weg von der Welt zur Figur: macht aus Weltzustand Gesehenes (Aussehen, Menge grob), Gefühltes (Stufen 0–4) und Geschmecktes. Arten und genaue Zahlen gehen nicht durch |
| `src/mind/` | Die Figur. Sieht nur `Observation`s, gibt nur `Action`s zurück. `RoutineMind`: Triebe, Wegfindung über bekannte Orte, Erfahrung je Ding, Übelkeit wird dem zuletzt Gegessenen angelastet |
| `src/analytics/` | Kennzahlen je Lauf und Zusammenfassung über alle Läufe |
| `src/sim.ts` | Tick-Schleife: Welt → Aktion abschließen → Wahrnehmung → Entscheidung. `createMind` tauscht die Figur aus (Tests, später LLM) |
| `src/batch.ts`, `src/cli.ts` | Viele Seeds rechnen, Ergebnisse schreiben |

## Regeln, die Tests absichern

- **Erkenntnisschranke (§5, §28):** `src/mind` darf nur aus `src/mind` und `src/core` importieren, und keine Beobachtung enthält Arten von Dingen, Ortsnamen oder genaue Körperwerte (`test/architecture.test.ts`).
- **Körper (Etappe 2):** Wer nicht trinkt, verdurstet in 2,5–6 Tagen; die Routine-Figur findet am ersten Tag Wasser und überlebt 30 Tage; Meerwasser und Beeren werden pro Stelle höchstens zweimal probiert (`test/world.test.ts`).
- **Determinismus (§36):** kein `Math.random`, `Date` oder `performance.now` in der Simulation; gleicher Seed ergibt gleiches Ereignisprotokoll; 100 × 30 Tage zweimal gerechnet ergeben denselben Batch-Fingerabdruck (`test/determinism.test.ts`).
- **Zufallsströme sind unabhängig:** Zusätzliche Würfe im Wetter verschieben nicht die Würfe der Figur (`test/rng.test.ts`).
- **Golden-Fingerabdrücke:** Seeds 1–3 haben feste Fingerabdrücke als Snapshot. Ändert sich das Verhalten der Simulation absichtlich, mit `npx vitest run -u` aktualisieren und im Commit sagen, warum.
