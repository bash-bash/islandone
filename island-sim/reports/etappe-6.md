# island-sim – Auswertung Etappe 6

| Lauf | Denker | Seeds | Tage | Gedanken | Kosten dieses Aufrufs (geschätzt) |
|---|---|---|---|---|---|
| `out/rules-30` | rules | 1–100 (100) | 30 | 0 | – |
| `out/curious-30` | curious-rules | 1–100 (100) | 30 | 96017 | – |
| `out/sonnet-5` | llm:claude-sonnet-5-5 | 1–10 (10) | 5 | 2038 | 1.99 $ |
| `out/haiku-5` | llm:claude-haiku-5-5 | 1–10 (10) | 5 | 2817 | – |
| `out/haiku-30` | llm:claude-haiku-5-5 | 2–5 (3) | 30 | 3754 | – |

Abgespielte Gedanken aus einer Aufzeichnung kosten nichts und zählen in der Kostenspalte nicht mit.

## Kennzahlen (§36), Mittelwert pro Lauf (Median)

| Kennzahl | rules, 30 T. | curious-rules, 30 T. | llm:claude-sonnet-5-5, 5 T. | llm:claude-haiku-5-5, 5 T. | llm:claude-haiku-5-5, 30 T. |
|---|---|---|---|---|---|
| Überlebt (Anteil) | 0.96 (1) | 0.94 (1) | 1 (1) | 1 (1) | 1 (1) |
| Tage gelebt | 29.43 (30) | 29.19 (30) | 5 (5) | 5 (5) | 30 (30) |
| Hypothesen | 25.03 (25) | 0 (0) | 77.60 (81) | 230.50 (239.50) | 837.33 (844) |
| … davon geprüft | 8.57 (9) | 0 (0) | 76.40 (81) | 200.90 (208) | 749 (801) |
| … bestätigt | 3.66 (4) | 0 (0) | 28.30 (28) | 18.80 (16) | 59.33 (66) |
| … widerlegt | 2.90 (2.50) | 0 (0) | 48.10 (48) | 182.10 (194) | 689.67 (710) |
| Capability Gaps genannt | 0 (0) | 0 (0) | 2.30 (2.50) | 73.40 (74) | 526.33 (524) |
| … davon gelöst | 0 (0) | 0 (0) | 1 (1) | 30.90 (17.50) | 126 (42) |
| Strategiewechsel | 5.54 (5) | 0 (0) | 9.70 (9.50) | 172.20 (181.50) | 730.33 (699) |
| Strategy Fatigue (feststecken) | 0 (0) | 0 (0) | 17 (16) | 214.60 (223.50) | 1037 (988) |
| Lernereignisse | 1.44 (1) | 1.37 (1) | 50.20 (52.50) | 162.70 (165.50) | 565 (605) |
| Idle Rate | 0.59 (0.60) | 0.00 (0) | 0.08 (0.08) | 0.23 (0.22) | 0.16 (0.15) |
| Gedanken | 0 (0) | 960.17 (985.50) | 203.80 (210.50) | 281.70 (296) | 1251.33 (1180) |
| Feuer entfacht | 0 (0) | 0.99 (1) | 0.60 (0.50) | 0 (0) | 0 (0) |
| Stunden bis zum ersten Feuer | – | 63.79 (10.90) [72/100] | 24.32 (12.50) [5/10] | – | – |
| Stunden bis zum Süßwasser | 14.38 (12.40) | 14.54 (14.50) | 1.59 (1.65) | 26.32 (13.75) | 12.23 (11.80) |
| Arten von Dingen entdeckt | 13 (13) | 14.43 (15) | 14 (14.50) | 12.50 (12) | 13.33 (13) |
| Gebautes und Gebundenes | 2.37 (2) | 0 (0) | 2.90 (2) | 2.30 (1) | 9.33 (9) |
| Mahlzeiten mit Werkzeug | 7.37 (7) | 0 (0) | 2.20 (1.50) | 7.30 (6.50) | 14.33 (20) |
| Längste Wiederholung ohne Neues | 0 (0) | 10.25 (9) | 18.70 (15.50) | 24 (24.50) | 79.33 (71) |

[n/m]: nur n von m Läufen haben einen Wert (z. B. nie Feuer gemacht).

## Streuung über die Seeds

Standardabweichung / Anzahl verschiedener Werte. Ein Skript in Verkleidung hätte überall 0 / 1.

| Kennzahl | rules, 30 T. | curious-rules, 30 T. | llm:claude-sonnet-5-5, 5 T. | llm:claude-haiku-5-5, 5 T. | llm:claude-haiku-5-5, 30 T. |
|---|---|---|---|---|---|
| Strategiewechsel | 3.26 / 14 | 0 / 1 | 5.06 / 10 | 33.89 / 9 | 151.86 / 3 |
| Strategy Fatigue (feststecken) | 0 / 1 | 0 / 1 | 8.97 / 10 | 35.62 / 10 | 138.71 / 3 |
| Stunden bis zum ersten Feuer | – | 74.22 / 38 | 18.73 / 5 | – | – |
| Stunden bis zum Süßwasser | 6.52 / 34 | 0.64 / 25 | 0.29 / 6 | 19.63 / 10 | 2.10 / 3 |
| Capability Gaps genannt | 0 / 1 | 0 / 1 | 1.00 / 4 | 30.11 / 10 | 7.13 / 3 |
| Lernereignisse | 0.59 / 3 | 1.44 / 7 | 13.46 / 9 | 20.19 / 8 | 101.20 / 3 |
| Verschiedene Läufe (Fingerabdruck) | 100 von 100 | 100 von 100 | 10 von 10 | 10 von 10 | 3 von 3 |

## Creator Backlog (Handoff §9)

497 verschiedene Lücken, 126 geprüft: 113 gibt es schon in der Welt, 0 nur latent, 13 fehlen wirklich.

371 Lücken ohne aufgezeichnetes Urteil sind nicht geprüft (mit `--creator ask` prüfen).

### Fehlt in der Welt

- **Mittel gegen Übelkeit** (3×, claude-haiku-5-5 #1)
  - „Ich brauche etwas, das die Übelkeit senkt und das ich bisher nicht gefunden habe.“ – bräuchte: stillt die Übelkeit; ist nicht die bekannte süße Milch oder das Wasser. _Nichts im Katalog senkt Übelkeit (Quellwasser, Früchte und gegartes Essen lindern sie nicht gezielt, die roten Beeren verursachen sie sogar), neuer Inhalt bräuchte eine essbare oder trinkbare Pflanze, Rinde oder Wurzel mit milder beruhigender Wirkung, die weder Kokosmilch noch Wasser ist und ohne Werkzeug oder mit einfacher Zubereitung (kauen, aufgießen über Feuer) nutzbar ist._
  - „Ich brauche etwas, das die Übelkeit senkt.“ – bräuchte: stillt die Übelkeit; ist nicht die bekannte süße Milch oder das Wasser. _Nichts im Katalog senkt Übelkeit (Quelle, Früchte, Kokos, Fisch und Feuer sind nur Nahrung, Wasser oder Wärme), daher bräuchte neuer Inhalt etwas Essbares oder Kaubares, etwa eine Kräuterpflanze, Wurzel oder Rinde, mit magenberuhigender Wirkung, das weder Wasser noch Kokosmilch ist und sich ohne Werkzeug oder höchstens durch Kauen oder Aufbrühen über Feuer nutzen lässt._
  - „Etwas, das die Übelkeit senkt.“ – bräuchte: stillt die Übelkeit; ist nicht die bekannte süße Milch oder das Wasser. _Nichts im Katalog senkt Übelkeit (Quelle, Früchte, Kokos, Feuer usw. nur Nahrung, Wasser, Wärme); neuer Inhalt bräuchte eine essbare oder trinkbare Pflanze bzw. Substanz mit beruhigender, übelkeitslindernder Wirkung (z. B. Kraut, Wurzel oder Rinde), die weder Wasser noch Kokosmilch ist._
- **stärkeres Bindemittel für feste Verbindungen** (2×, claude-haiku-5-5 #10)
  - „Ich brauche etwas, das die Teile fest verbindet, ohne dass ich sie halten muss.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als die Fasern von t9. _Die Faser der fiber_plant bindet nur so fest wie die Faser selbst und kann aufgehen; nichts in der Welt (kein Harz, Kleber, Nagel, Seil aus stärkerem Material) verbindet fester als sie, neuer Inhalt bräuchte also ein klebendes oder reißfesteres Material, das ohne Halten haftet und stärker als Pflanzenfaser ist._
  - „Ich brauche etwas, das die Teile fest zusammenhält, ohne dass ich sie halte.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als die Fasern von t9. _Faser aus fiber_plant bindet und hält ohne Festhalten, aber die Figur will etwas, das fester bindet als diese Fasern, und nichts in der Welt (kein Harz, Klebstoff, Nägel, kein stärkeres Seil) bietet das; neuer Inhalt bräuchte klebende oder zugfestere, dauerhafte Bindung, die auch unter Last und Nässe nicht aufgeht._
- **Fangnetz für Fische** (1×, claude-sonnet-5-5 #9)
  - „Flinke Tiere im Wasser lassen sich nicht greifen“ – bräuchte: fängt viele kleine Dinge gleichzeitig; bleibt im Wasser, ohne dass die Tiere entwischen; ist flächig statt nur eine einzelne Schnur. _Mit Speer (gebundenes Stück) lässt sich nur ein Fisch einzeln fangen, und Faserschnur ist nur linear; neuer Inhalt müsste flächig, netzartig und wasserbeständig sein, damit viele kleine Tiere gleichzeitig gefangen werden und nicht entwischen (z. B. Netz, Reuse oder Fischfalle mit engem Geflecht)._
- **Netz oder Reuse zum Fischfang** (1×, claude-sonnet-5-5 #10)
  - „Ich kann die flitzenden Tiere im Wasser nicht greifen“ – bräuchte: fängt viele kleine Tiere auf einmal; lässt sich ins Wasser halten, ohne dass sie durchschlüpfen. _Fische lassen sich nur einzeln mit einem langen spitzen Stück fangen; nichts bietet eine feinmaschige, flächige, flexible Struktur (Netz, Reuse, Korb), die viele Tiere auf einmal im Wasser festhält, ohne dass sie durchschlüpfen, denn Fasern und Wedel sind nur Schnur bzw. Flächen ohne Maschen._
- **stärkere Verbindung / Klebstoff oder Bindemittel** (1×, claude-haiku-5-5 #10)
  - „Ich brauche eine Verbindung, die ohne meine Hand hält.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als die Fasern von t9. _Die Faser aus fiber_plant bindet zwar ohne Hand, aber die Figur will etwas, das fester hält als diese Fasern, und nichts im Katalog (kein Harz, Klebstoff, Nagel, Lehm oder festeres Seil) bietet das; neuer Inhalt bräuchte eine haftende oder klemmende Wirkung, die stärker ist als Faserbindung, z. B. Baumharz, Pech oder reißfestes Tau, das aushärtet und beim Gebrauch nicht aufgeht._
- **Klebstoff oder Harz zum Fixieren** (1×, claude-haiku-5-5 #10)
  - „Ich brauche etwas, das die Fasern fest verbindet, während ich sie loslasse.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als die Fasern von t9. _Nichts in der Welt bindet Teile fester als die Faser selbst oder hält sie ohne Halten zusammen (Knoten, Gewicht oder Stein als Beschwerer wären nur Notbehelfe); neuer Inhalt müsste klebrig-aushärtend sein (z. B. Baumharz, Pech, Lehm), sich auf Fasern und Holz auftragen lassen und nach kurzer Zeit fest halten._
- **stärkeres Bindemittel für Verbindungen** (1×, claude-haiku-5-5 #10)
  - „Ich brauche etwas, das die Teile ohne meine Hand zusammenhält.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als die Fasern von t9. _Faser aus fiber_plant bindet und hält Teile ohne Hand, aber nichts in der Welt bindet fester als diese Fasern; neuer Inhalt bräuchte eine Substanz wie Harz, Kleber oder reißfestes Seil, das Teile dauerhaft und stärker als Faser verbindet._
- **stärkeres Bindemittel** (1×, claude-haiku-5-5 #10)
  - „Ich brauche etwas, das die Teile ohne meine Hand zusammenhält.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als Blätter. _Faser aus fiber_plant bindet zwar ohne Hand, aber nur so fest wie die Blätter selbst und kann aufgehen; nichts im Katalog bindet fester (etwa Harz, Klebstoff, Naturleim oder reißfestes Seil, das fest haftet und nicht nachgibt)._
- **stärkeres Bindemittel/Klebstoff** (1×, claude-haiku-5-5 #10)
  - „Etwas, das die Teile ohne meine Hand zusammenhält.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als die Fasern von t9. _Die Faserpflanze bindet zwar ohne Hand, aber nichts im Katalog bindet fester als ihre Fasern (kein Harz, Klebstoff, Nagel oder stärkere Schnur); neuer Inhalt bräuchte ein klebriges oder härtendes Material, das Holz und Stein dauerhaft und fester als Faser verbindet._
- **stärkeres Bindemittel zum Verbinden** (1×, claude-haiku-5-5 #10)
  - „Ich brauche etwas, das die Teile ohne meine Hand zusammenhält.“ – bräuchte: hält ohne Halten in der Hand; bindet die Teile fester als Blätter und Fasern von t9. _Es gibt nur Faserblätter (fiber_plant) und daraus Gebundenes, das nicht fester hält als die Faser selbst; neuer Inhalt bräuchte ein klebendes oder aushärtendes Bindemittel (z.B. Harz, Lehm-Pech) oder eine reißfestere Schnur, die Teile dauerhaft und fester als die Fasern fixiert._

### Gibt es schon (die Figur hat es nur noch nicht gefunden)

- **Werkzeug zum Öffnen harter Schalen** (24×): stones, coconut_palm, branches, bound piece, driftwood, fiber_plant
- **Schlagwerkzeug zum Öffnen harter Schalen** (8×): stones, driftwood, branches, bound piece, fiber_plant
- **hartes Schlagwerkzeug zum Öffnen von Schalen** (5×): stones, coconut_palm, bound piece
- **trockener Zunder und Brennstoff** (5×): fiber_plant, branches, fire
- **Werkzeug zum Erreichen hoher Früchte** (4×): branches, fiber_plant, bound piece, stones, coconut_palm, driftwood
- **Werkzeug zum Öffnen harter Früchte** (4×): stones, branches, bound piece, fiber_plant, coconut_palm, driftwood
- **Hilfsmittel zum Erreichen hoher Früchte** (4×): branches, fiber_plant, bound piece, driftwood, stones
- **hartes Schlagwerkzeug** (3×): stones, branches, bound piece, driftwood
- **schweres Schlagwerkzeug zum Öffnen harter Schalen** (3×): stones, driftwood
- **Zunder zum Feuermachen** (2×): fiber_plant, branches, fire
- … und 48 weitere Arten mit 51 Lücken
