# AP 7.1c – Modellreview: Wirtschaftsmodell: Bericht Lauf Fable 5.2

Geprüfter Stand: c1e2514 · Datum: 15.11.2026

Arbeitsordner mit allen Skripten: `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1c-fable/` (`s1.ts` … `s7.ts`, je mit gebündeltem `.mjs`).

## Zusammenfassung

Das Wirtschaftsmodell ist in sich stimmig und sauber umgesetzt. Alle Beispieltabellen in TS §7.1–§7.9 habe ich von Hand nachgerechnet: Die Zahlen stimmen, falsch ist nur ein Wochentag. Eigene Referenzrechnungen gegen Engine-Läufe über 6 bis 40 Spieljahre ergaben keine einzige Abweichung bei Zinsen, Steuern, Gebühren, Lots, Dividenden, Zeitreihe und Benchmark. Geld entsteht und verschwindet nicht.

Der wichtigste Befund betrifft die Kennzahl, nicht die Buchhaltung: Die zeitgewichtete Rendite ist bei kleinem Vermögen von den Kosten des Girokontos bestimmt. Wer nie investiert, sieht in der Voreinstellung „Studium“ nach fünf Jahren −16 % bis −20 %; mit 500 € Startkapital reichen 18,15 € Gebühren und Zinsen an einem Tag für dauerhaft −32 %. Dazu kommen Sonderfälle bei negativem Vermögen (dauerhaft −100 % oder „0 %“ trotz Verlusten). Die übrigen Befunde sind klein: ein Verkauf, dessen Kosten den Kurswert übersteigen, überzieht das Verrechnungskonto, zwei Doku-Fehler und eine theoretische Doppelrundung bei Positionen ab etwa 10 Mio. €.

## Befunde

### C-01 Zeitgewichtete Rendite wird bei kleinem Vermögen von den Kontokosten bestimmt

- **Schwere:** hoch
- **Art:** Modellfehler
- **Bereich:** TS §7.9 (Tagesrendite, externe Flüsse); PS §5.1 (Voreinstellungen), US-PF-05; `src/app/portfolio/domain/performance-logic.ts:63` (`dailyReturn`), `:47` (`externalFlow`)
- **Befund:**
  - Die Formel `r_day = V_end / (V_start + CF) − 1` ist richtig umgesetzt. Als Rendite zählen aber auch Kontoführung und Dispozinsen des Girokontos, bezogen auf das ganze Vermögen des Tages.
  - Die Lebenshaltung fließt am ersten Bankarbeitstag als `CF` ab, am selben Tag bucht die Bank Kontoführung und Dispozinsen. Die Basis `V_start + CF` ist an genau diesem Tag am kleinsten, die Kosten treffen also immer die kleinste Basis des Monats.
  - Ein einzelner Tag mit kleiner Basis prägt die Rendite seit Spielbeginn für immer, weil verkettet wird.
  - Betroffen sind die Voreinstellung „Studium“ (2.000 / 1.000 / 900 €) und jedes Spiel mit kleinem oder ohne Startkapital (erlaubt sind 0–1.000.000 €). Mit der Vorgabe „Berufseinstieg“ ist der Effekt klein.
  - Der Vergleich mit der Benchmark ist für diese Spieler nicht aussagekräftig: Die Benchmark trägt keine Kontokosten.
  - Eine geldgewichtete Rendite, die der Auftrag zu AP 7.1c nennt, gibt es weder in TS §7.9 noch im Code.
- **Beleg:** `s6.ts` (Spieler investiert nie, Hausbank der Mini-Welt mit 9,40 € bzw. 10,60 € Kontoführung), `s7.ts` (Tage einzeln), `s2.ts` Szenario D.

  | Spiel (Start / Einkommen / Lebenshaltung) | Seed   | Kosten in 5 Jahren | Vermögen nach 5 Jahren | TWR seit Beginn | TWR p. a. |
  | ----------------------------------------- | ------ | ------------------ | ---------------------- | --------------- | --------- |
  | Studium 2.000 / 1.000 / 900 €             | mini-1 | 554,60 €           | 7.964,35 €             | −15,67 %        | −3,35 %   |
  | Studium                                   | mini-2 | 625,40 €           | 7.119,23 €             | −19,99 %        | −4,36 %   |
  | Berufseinstieg 10.000 / 2.500 / 1.800 €   | mini-1 | 554,60 €           | 52.483,32 €            | −2,32 %         | −0,47 %   |
  | 0 / 2.500 / 1.800 €                       | mini-1 | 590,48 €           | 42.447,44 €            | −13,44 %        | −2,84 %   |
  | 500 / 2.500 / 1.800 €                     | mini-2 | 645,26 €           | 41.343,99 €            | −36,69 %        | −8,73 %   |

  Der Tag, der die letzte Zeile erklärt (`s7.ts`): Mo 03.06.2030, `V_start` 1.721,94 €, `CF` −1.665,42 € (Lebenshaltung), Basis 56,52 €, Kontoführung 10,60 € und Dispozinsen 7,55 €, `V_end` 38,37 €, `r_day` = −32,11 %. Der Index steht danach bei 0,6789 und erholt sich nie.

  Zum Vergleich in `s2.ts`, Szenario D (0 / 2.800 / 1.700 €, 2 Jahre): TWR p. a. −4,09 %, eigene geldgewichtete Rendite (XIRR über Startkapital, Flüsse und Endvermögen) −1,36 % p. a.

- **Vorschlag:** Der PO entscheidet zwischen:
  1. Zusätzlich eine geldgewichtete Rendite (XIRR oder Modified Dietz) zeigen und sie für „seit Spielbeginn“ zur Hauptzahl machen; die TWR bleibt für den Vergleich mit der Benchmark.
  2. Die TWR nur über das Depot rechnen (Flüsse = Käufe und Verkäufe), also die Anlageentscheidungen messen und nicht den Haushalt.
  3. Mindestens: Tage mit sehr kleiner Basis wie die Tage mit Basis ≤ 0 auslassen (Schwelle z. B. relativ zum Monatseinkommen) und in der Anzeige erklären, dass Kontokosten als Rendite zählen.
- **Folgen einer Änderung:** kein Golden Master, keine neue `SIM_VERSION` (Kurse unberührt). `PerformanceState` und die gespeicherte Tagesreihe (`index`, `skippedDays`) ändern ihre Bedeutung: neue `SCHEMA_VERSION` oder Neuberechnung aus dem Journal. Tabellen in TS §7.9, `performance-logic.spec.ts`, `game-engine-performance.spec.ts`, Glossar und Kontexthilfe sind anzupassen. Aufwand M (Variante 3: S).

### C-02 Sonderfälle der Rendite bei negativem Vermögen: dauerhaft −100 %, „0 %“ trotz Verlusten

- **Schwere:** mittel
- **Art:** Modellfehler
- **Bereich:** TS §7.9 („Tagesrendite“, „Tage mit `V_start + CF ≤ 0`“); `src/app/portfolio/domain/performance-logic.ts:63–69`, `:86–93`
- **Befund:**
  - **Dauerhaft −100 %:** Endet ein Tag mit positiver Basis unter 0, wird der Faktor 0. Der Index bleibt für den Rest des Spiels bei 0, „im laufenden Jahr“ wird `null`, annualisiert −100 %. Das ist so spezifiziert, aber die Regel ist unstetig: Bei Basis ≤ 0 wird derselbe Verlust ausgelassen, bei 1 Cent Basis ist er endgültig.
  - **„0 %“ trotz Verlusten:** Bleibt das Vermögen dauerhaft negativ, werden fast alle Tage ausgelassen. Die Rendite steht bei 0,00 %, während Gebühren und Dispozinsen laufen. Die Zahl der ausgelassenen Tage wird gezählt, die Rendite selbst sieht aber wie ein Messwert aus.
  - **Benchmark läuft asynchron:** Die Benchmark lässt Tage nach ihrer eigenen Basis aus. Portfolio und Benchmark verketten dann verschiedene Tage, der Vergleich beider Indizes stimmt nicht mehr. Die ausgelassenen Tage der Benchmark werden nicht gezählt.
- **Beleg:** `s2.ts`.
  - Szenario C (10 € Startkapital, kein Einkommen, Testbank mit 12 € Kontoführung): am 01.05.2030 Basis 10,00 €, `V_end` −2,00 €, danach `sinceStart` −1, `yearToDate` `null`, `annualized` −1 bis zum Ende des Laufs.
  - Szenario B (0 / 2.000 / 2.000 €, 5 Jahre): 1.785 von 1.827 Tagen ausgelassen, Index 1,0 (Rendite 0 %), Veränderung seit Spielbeginn −1.811,15 €.
  - Szenario E (2.000 / 2.000 / 2.050 €, 6 Jahre): 2.108 von 2.193 Tagen ausgelassen, Rendite 0 %, Veränderung −2.029,66 €.
  - `s3.ts`, zweiter Lauf (500 / 1.500 / 1.900 €): Die Benchmark lässt 1.094 von 1.095 Tagen aus.
- **Vorschlag:** Den Tag mit `V_end < 0` wie einen ausgelassenen Tag behandeln statt als −100 %. Ab einem Anteil ausgelassener Tage die Rendite als „–“ zeigen. Portfolio und Benchmark an denselben Tagen auslassen. Mit Vorschlag 1 oder 2 aus C-01 entfällt der Fall weitgehend.
- **Folgen einer Änderung:** wie C-01 (keine `SIM_VERSION`, Bedeutung gespeicherter `index`-Werte ändert sich, Tabelle TS §7.9 Zeile „Mi“ und Tests anpassen). Aufwand S–M.

### C-03 Verkauf mit Kosten über dem Kurswert überzieht das Verrechnungskonto

- **Schwere:** niedrig
- **Art:** Abweichung Doku↔Code
- **Bereich:** TS §7.4 („Verrechnungskonten“), §7.5 (Tabelle „Verkauf 0,5 zu 3,335 €“, Belastung −11,33 €); `src/app/trading/domain/order-execution-logic.ts` (`executionError`, Zweig `sell`), `order-command-logic.ts` (`orderPlacementError`)
- **Befund:** TS §7.4 nennt als Ursache eines negativen Verrechnungskontos nur „von der Bank veranlasste Belastungen (Gebühren, Zinsen)“. Ein Verkauf, dessen Mindestentgelt den Kurswert übersteigt, belastet das Konto ebenfalls. Weder beim Erteilen noch bei der Ausführung wird das geprüft. Das Konto wird negativ, es fällt Sollzins an, und Käufe sind gesperrt, bis es ausgeglichen ist.
- **Beleg:** `s5.ts`, Abschnitt 5 (Bank `bnk-0001` der Mini-Welt: 0,25 %, mind. 10,00 €, Börsenentgelt 2,60 €). Verrechnungskonto 0,00 €, Verkauf von 0,01 Stück zu 53,23 €: Kurswert 0,53 €, Kosten 12,60 €, Buchung −12,07 €, Ereignis `account-uncovered` mit Saldo −12,07 €. Die Order wurde ohne Hinweis angenommen.
- **Vorschlag:** In TS §7.4 und §7.5 als gewollt festhalten (reale Banken rechnen so ab) und im Order-Ticket warnen, wenn die Gutschrift negativ ist. Eine Ablehnung wäre falsch: Kleinstbestände ließen sich dann nicht mehr verkaufen und das Depot nicht schließen.
- **Folgen einer Änderung:** nur Doku und UI-Hinweis, keine Versionen betroffen. Aufwand S.

### C-04 Doku-Fehler in TS §7.4: Wochentag und Nummerierung

- **Schwere:** niedrig
- **Art:** Abweichung Doku↔Code
- **Bereich:** TS §7.4, Zeile 1361 (Tabelle „Erster Termin“) und Zeilen 1377–1378 (Schritte des Bank-Laufs)
- **Befund:**
  - Die Tabelle „Erster Termin“ nennt „Fr 29.03.2032 06:00“. Der 29.03.2032 ist ein Montag: Der 28.03. ist ein Sonntag, deshalb die Verschiebung. Datum und Code sind richtig, nur der Wochentag ist falsch. TS §7.8 nennt denselben Tag richtig als „Mo 29.03.2032“.
  - In der Liste der Schritte des Bank-Laufs steht „6. Dispozinsen und 7. Sollzinsen“ in einem Punkt, der nächste Punkt heißt wieder „7. Daueraufträge“. `BANK_RUN_STEPS` hat neun Schritte (Depotgebühr eigener Schritt).
- **Beleg:** `s5.ts`, erste Zeile: `weekday` des Repos und `Date.UTC` geben für den 29.03.2032 beide Montag. `standing-order-logic.spec.ts:145` prüft nur das Datum.
- **Vorschlag:** Wochentag korrigieren, Schritte durchnummerieren.
- **Folgen einer Änderung:** nur Doku. Aufwand S.

### C-05 Doppelrundung in `roundHalfAwayFromZero` bei sehr großen Werten

- **Schwere:** Hinweis
- **Art:** Verbesserung
- **Bereich:** TS §7.1; `src/app/shared/domain/money-logic.ts:11` (`withoutArtefacts`, `toPrecision(15)`)
- **Befund:** Die Reduktion auf 15 signifikante Stellen vor dem Runden rundet zweimal. Liegt ein Wert knapp unter ,5 und hat mehr als 15 Stellen, wird er erst auf ,5 und dann aufgerundet. Je größer der Betrag, desto weniger Nachkommastellen bleiben. Bei spielüblichen Beträgen (unter 1 Mio. €) liegt die Wahrscheinlichkeit je Rundung unter 10⁻⁶ und der Fehler bei 1 Cent; das Ergebnis bleibt deterministisch.
- **Beleg:** `s5.ts`, Abschnitt 1. `marketValue` gegen exakte Ganzzahlrechnung (`BigInt`) für 2.000.000 zufällige Paare (bis 5.000 Stück, Kurse bis 5.000 € im Raster 0,001 €): 3 Abweichungen um 1 Cent, alle bei Kurswerten über 6 Mio. €, z. B. 3.554,224689 Stück × 3.639,791 € → 12.936.635,04 € statt 12.936.635,03 €. Einzelwert: `roundHalfAwayFromZero(99999999999999.45)` ergibt 100000000000000.
- **Vorschlag:** So lassen und in TS §7.1 als bekannte Grenze nennen. Wer es exakt will, rechnet `marketValue` wie `lotCostShare` in `BigInt` (Kurs im Raster als Ganzzahl).
- **Folgen einer Änderung:** Eine exakte Rechnung könnte einzelne Cent in gespeicherten Journalen anders runden: Replay-Tests und Prüfsummen der Engine-Szenarien prüfen, keine `SIM_VERSION` der Kurse. Aufwand S.

### C-06 Kein Langzeit-Szenario gegen eine unabhängige Referenz in der Suite

- **Schwere:** Hinweis
- **Art:** Testlücke
- **Bereich:** `src/app/engine/domain/banking-system.spec.ts`, `engine-properties.spec.ts`
- **Befund:** Die Engine-Szenarien decken einzelne Monate von 2030/2031 ab, die Eigenschaften prüfen Stückelung, Snapshot und Replay. Kein Test rechnet Zinsen und Steuern über viele Jahre gegen eine zweite Rechnung nach. Der 29. Februar kommt nur in der reinen Funktion vor (`interest-logic.spec.ts:32`), nicht in einem Engine-Lauf. Ein Fehler in der Reihenfolge von Tageswechsel, Monats- und Jahresabschluss fiele damit nur in den geprüften Monaten auf.
- **Beleg:** `grep` nach `2032`, `leap`, `366` in den beiden Specs: keine Treffer. Meine Läufe `s1.ts` (bis 40 Jahre) fanden keinen Fehler.
- **Vorschlag:** `s1.ts` als Vorlage für ein Szenario über 3–4 Jahre mit Schaltjahr übernehmen (Referenz: Tagessalden aus dem Journal, eigene Zins- und Steuerrechnung).
- **Folgen einer Änderung:** nur Tests. Aufwand S.

## Geprüft und in Ordnung

**Beispieltabellen, von Hand nachgerechnet**

- **§7.2 Hauptbuch:** Journal 1–6 mit Salden, Auszug von `acc-1` und `acc-2`, abgelehnte Buchungen, Kaufbeispiel: alle Zeilen stimmen. Suchtabelle und Zeiträume auf Plausibilität und Wochentage geprüft.
- **§7.3 Gebühren:** alle 13 + 7 Zeilen stimmen (z. B. 1,5 % × 123,45 € = 1,85175 €; 0,25 % × 1.002 € = 2,505 € → 2,51 €). Der Code liefert 251 Cent trotz Gleitkomma `250.49999999999997`.
- **§7.3 Depotgebühr:** beide Tabellen stimmen (80 € × 30/91 = 26,37 €; 80 € × 30/364 = 6,59 €; 30 € × 40/364 = 3,30 €; 50 € × 46/368 = 6,25 €; 30 € × 1/368 = 0,08 €).
- **§7.3 Bankenvergleich:** alle Werte der sechs Beispielbanken stimmen.
- **§7.3 Zinsen:** alle 12 Zeilen stimmen (act/365, 366 Tage → 200,55 €, Dispo 11 % + 4 Pp. mit Limit).
- **§7.4:** Bank-Lauf-Kalender und Dauerauftragstermine (alle Wochentage 2030–2032 bis auf C-04), Kontoführung anteilig, Kontoabschluss, Dispo-Rahmen (3.333 €, 1.666 €, 4.691 €), Ereignistabelle, Monatswerte und Sparquote 26,01 %, Erträge und Kosten je Jahr (3.428 / 66), Abschlussbeispiele (2,47 € Zinsen, Rest 5.010,42 € und 987,24 €): stimmen.
- **§7.5:** Gültigkeit, Prüfung je Tick, Kosten, Betragsorders (29,975997 Stück; 19,8524 Stück mit 7,38 € Kosten; 99 Stück), Reservierungen (1.064,05 €; 10.539,78 €; 117,99 €; 1.484,47 € / 1.589,58 €), Ändern und Ausführung: stimmen.
- **§7.6 Lots:** Teilverkäufe (405,20 €, 815,80 €, Summe 1.533,00 €, −183,00 €), Rundung 333,33 / 333,34 / 333,33 €, Einstandskurse: stimmen.
- **§7.7 Steuern:** alle drei Tabellen und die Übersichten 2030/2031 stimmen.
- **§7.8 Sparpläne:** Stückzahlen (2,665245; 0,410416; 0,093981; 3,333333) und Termine stimmen.
- **§7.9:** TWR-Tabelle (Index 1,040502), Benchmark-Tabelle (11,904762 Einheiten, Index 1,091270, −619,05 € bar), Annualisierung, Depotübersicht, Allokation, `apportionCents`, Positionsdetail: stimmen.

**Code und Tests gegen die Tabellen**

- Die 65 Logic-Spec-Dateien der Bereiche (`banking`, `taxes`, `trading`, `portfolio`, `shared/domain`, `engine/domain`) laufen grün (1.440 Tests). Stichproben zeigen, dass die Specs die Tabellenwerte der TS tragen und nicht aus dem Code ableiten (z. B. `2_637`, `659`, `247`, `330`, `1.040502`).

**Eigene Referenzrechnungen gegen die Engine**

- **Zinsen und Zinseszins** (`s1.ts`, 12 und 40 Jahre, Testbanken): Tagesgeld monatlich und quartalsweise, Verrechnungskonto, Dispo mit ausgeschöpftem Rahmen. Referenz aus Tagesend-Salden des Journals, act/365, Rundung erst bei der Buchung. 1.126 Zinsbuchungen, 0 Abweichungen, auch über zehn Schaltjahre. Kein Monat mit Referenzzins blieb ohne Buchung. Die Zinsen wachsen mit dem Saldo (164,38 € im ersten, 465,91 € im 480. Monat); eine Drift gibt es nicht, weil die Abgrenzung monatlich neu beginnt.
- **Steuern auf Zinsen** (`s1.ts`): 1.120 Ereignisse über 40 Steuerjahre, 0 Abweichungen. Dezemberzinsen zählen im neuen Jahr.
- **Hauptbuch** (`s1.ts`, `s4.ts`): jede Transaktion summiert sich zu 0, `balanceAfter` und Salden stimmen mit dem Journal, Summe der Spielerkonten = −Summe der Gegenkonten.
- **Handel, Lots, Dividenden, Steuern** (`s4.ts`, Seeds mini-1 und mini-2, 6 und 8 Jahre, erzeugte Banken mit Prozent- und Pauschalentgelt, mit und ohne Bruchstücke): 599 bzw. 823 Orders, 144 Sparplan-Ausführungen, 52 bzw. 100 Ausschüttungen, 205 Steuerbuchungen. Geprüft je Buchung: Kurswert, Entgelt, Belastung bzw. Gutschrift, FIFO-Anschaffungskosten (eigene `BigInt`-Rechnung), realisierter Gewinn, Steuer bzw. Erstattung nach eigener Jahresrechnung mit Verlustvortrag, Konto der Steuerbuchung, Einbehalt ≤ Ertrag, Ausschüttung = Stück vor dem Ex-Tick × Betrag, Sparplan-Stück maximal, Lots am Ende. 0 Abweichungen.
- **Steuern fachlich:** Die Verrechnung von Verlusten vor dem Pauschbetrag, das Wiederaufleben des Pauschbetrags nach einem Verlust im selben Jahr, der Verfall des ungenutzten Pauschbetrags, der Vortrag nur negativer Jahresergebnisse und Kauf- und Verkaufskosten im Gewinn entsprechen dem deutschen Vorbild in der Vereinfachung von E-11. Probe in `s5.ts`: +900 €, −2.000 €, Dividende 500 € → Vortrag −600 €; 2031 +1.500 € → keine Steuer, +200 € → 25,00 €; Vortrag 2032 = 0.
- **Zeitreihe und TWR** (`s2.ts`, 5 Szenarien): Index, ΣCF, Vergleichsgröße, ausgelassene Tage und Bargeld aus Journal und Tagespunkten neu gerechnet, Abweichung 0.
- **Benchmark** (`s3.ts`, 3 Jahre, 784 Schlusskurse): Schattenportfolio mit eigener Rechnung, Wert auf den Cent gleich, Index gleich bis 2 · 10⁻¹⁶.
- **Betragsorders und Sparplan-Stück** (`s5.ts`): 20.000 bzw. 200.000 Zufallsfälle gegen exakte Ganzzahlrechnung: „passt, ein Rasterschritt mehr passt nicht“ ohne Verletzung.
- **Große und ungültige Beträge** (`s5.ts`): Überweisungen mit 0,5, `NaN`, `Infinity`, −1, 2⁵³ → `invalid-amount`; Stückzahl über 2⁵³ → `invalid-quantity`; `lotCostShare` mit 9 · 10¹⁵ Cent exakt; `bookTransaction` verlangt sichere Ganzzahlen. Erreichbare Spielbeträge liegen um Größenordnungen unter 9 · 10¹⁵ Cent.
- **Annualisierung und Sonderwerte** (`s5.ts`): `periodReturns(0, 0, …)` liefert `yearToDate` `null` statt `NaN`.

**Durchsicht ohne Befund**

- `banking-system.ts`, `bank-commands.ts` (Überweisen, Schließen), `distribution-system.ts`, `order-system.ts`, `order-execution-logic.ts`, `order-reservation-logic.ts`, `order-validity-logic.ts`, `savings-plan-logic.ts`, `custody-fee-logic.ts`, `account-fee-logic.ts`, `inflow-logic.ts`, `overdraft-logic.ts`, `tax-logic.ts`, `lot-logic.ts`, `position-logic.ts`, `money-logic.ts`, `price-step-logic.ts`, `performance-logic.ts`, `performance-system.ts`.
- Entscheidungen E-09, E-11, E-17, E-19, E-21 sind so umgesetzt, wie TS §16 sie nennt.
- Rundungsreste: Die Steuer wird aus dem Jahresergebnis neu gerechnet (keine Drift), Lot-Anteile summieren sich exakt. Zinsabgrenzungen unter einem halben Cent je Abrechnung verfallen (dokumentiert, wie bei realen Banken).

## Nicht geprüft / Grenzen

- **Limit-, Stop- und Stop-Limit-Orders, Ändern, Storno, Ablauf** in Engine-Läufen: nur über die Tabellen von Hand und die vorhandenen Specs; meine Zufallsläufe erteilen nur Market-Orders in der Handelszeit.
- **Daueraufträge, Kontoabschluss, Gehaltskontowechsel, Depotgebühr im Quartal** in eigenen Engine-Szenarien: nicht nachgestellt; geprüft sind die Tabellen von Hand, der Code per Durchsicht und die vorhandenen Specs.
- **Kontoauszug mit Suche, Bankenvergleich, Allokation, Positionsdetail:** nur Tabellen von Hand und vorhandene Specs.
- **UI:** nicht geprüft, auch nicht die Stellen, an denen sie Werte aus Quotes rechnet (`venueQuote`, Positionswerte in der Projektion).
- **Mutationstests, Performance-Suite, Kalibrierung:** nicht ausgeführt.
- **Standardwelt:** Alle Läufe nutzen die Mini-Welt (gleiche Bankenerzeugung, 24 Unternehmen) oder die Testbanken, nicht die Standardwelt mit rund 250 Instrumenten.
- **Kurse als Eingabe:** Die Benchmark der Mini-Welt lief in Szenario A mit rund 14,6 % p. a.; ob das plausibel ist, gehört zu AP 7.1b.
- **Annahme zu C-01:** Die Zahlen gelten für Spieler, die nie investieren. Mit Depot kommen Kursbewegungen dazu, der Effekt der Kontokosten auf die kleine Basis bleibt derselbe.
