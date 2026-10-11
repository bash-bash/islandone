# island-sim – Simulation ohne Grafik

Autonome Figur, Weltzustand und Auswertung, ohne Grafik und ohne LLM (Handoff §26, §31). Plan und Etappen: [`docs/ISLAND_SIM_PLAN.md`](../docs/ISLAND_SIM_PLAN.md).

Stand: **Etappe 1 (Gerüst)**. Die Welt hat bisher nur Tageswetter, die Figur nimmt den Himmel wahr und tut noch nichts. Die Kennzahlen aus §36 außer der Idle-Rate kommen mit den nächsten Etappen; die Auswertung führt sie bis dahin als „noch nicht gemessen“.

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
| `src/world/` | Objektive Welt, nur die Simulation kennt sie. Bisher: Tageswetter mit Übergangswahrscheinlichkeiten |
| `src/perception/` | Einziger Weg von der Welt zur Figur: macht aus Weltzustand wahrnehmbare Merkmale |
| `src/mind/` | Die Figur. Sieht nur `Observation`s, gibt nur `Action`s zurück. Bisher ein Platzhalter |
| `src/analytics/` | Kennzahlen je Lauf und Zusammenfassung über alle Läufe |
| `src/sim.ts` | Tick-Schleife: Welt → Wahrnehmung → Entscheidung |
| `src/batch.ts`, `src/cli.ts` | Viele Seeds rechnen, Ergebnisse schreiben |

## Regeln, die Tests absichern

- **Erkenntnisschranke (§5, §28):** `src/mind` darf nur aus `src/mind` und `src/core` importieren (`test/architecture.test.ts`).
- **Determinismus (§36):** kein `Math.random`, `Date` oder `performance.now` in der Simulation; gleicher Seed ergibt gleiches Ereignisprotokoll; 100 × 30 Tage zweimal gerechnet ergeben denselben Batch-Fingerabdruck (`test/determinism.test.ts`).
- **Zufallsströme sind unabhängig:** Zusätzliche Würfe im Wetter verschieben nicht die Würfe der Figur (`test/rng.test.ts`).
- **Golden-Fingerabdrücke:** Seeds 1–3 haben feste Fingerabdrücke als Snapshot. Ändert sich das Verhalten der Simulation absichtlich, mit `npx vitest run -u` aktualisieren und im Commit sagen, warum.
