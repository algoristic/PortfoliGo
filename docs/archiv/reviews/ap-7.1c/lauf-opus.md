# AP 7.1c – Modellreview: Wirtschaftsmodell: Bericht Lauf Opus

Geprüft: c1e2514 · Datum: 15.11.2026
(HEAD ist `805218b`. Gegenüber `c1e2514` ändert er nur CI-Workflows, README, CLAUDE.md und je eine Zeile in Änderungsprotokoll und TS, nichts am Wirtschaftsmodell.)

Arbeitsordner mit allen Skripten und Ausgaben: `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1c-opus/`

## Zusammenfassung

Das Wirtschaftsmodell ist in sich stimmig, sorgfältig spezifiziert und genau umgesetzt.

- **Beispieltabellen:** Ich habe alle Tabellen in TS §7 unabhängig nachgerechnet, mit einer eigenen Python-Referenz auf exakten Brüchen und mit den Wochentagen aus dem Kalender. Das sind über 100 Werte plus 43 Datumsangaben, und alle stimmen.
- **Zinseszins:** Ein Engine-Lauf über 10 Jahre mit 100.000 € auf Tagesgeld ergibt mit einer unabhängigen Tagesrechnung (act/365, Gutschrift am ersten Bankarbeitstag, Steuer über dem Pauschbetrag je Jahr) einen centgenau gleichen Saldo. Alle 119 Gutschriften stimmen. Geld entsteht und verschwindet nicht: Jede Transaktion summiert sich zu 0, und das Journal ergibt den Saldo im Zustand.
- **Steuern:** Das Steuermodell entspricht E-11 und in der vereinfachten Form dem deutschen Vorbild. Verlusttopf, Pauschbetrag, Jahreswechsel, Teilverkäufe und Dividenden sind richtig behandelt.

Die Befunde:

- **Wichtigster Befund (C-01):** Die zeitgewichtete Rendite rechnet die Lebenshaltung als Fluss am Tagesanfang. Am ersten Bankarbeitstag schrumpft die Basis deshalb bei knappen Haushalten auf wenige Euro, und die Kontoführung desselben Bank-Laufs treibt die Rendite eines reinen Bargeld-Spielers dauerhaft auf −100 % oder −68 %. Das verletzt US-PF-05 („Lebenshaltungskosten verfälschen sie nicht“).
- **Übrige Befunde:** Sie sind niedrig oder Hinweise:
  - Zeitraum der Zinsbuchung beim Kontoabschluss,
  - Gratis-Stücke durch Rundung bei kostenlosen Neobrokern,
  - fehlender Schutz jenseits von `MAX_SAFE_INTEGER` bei unbegrenzter geduldeter Überziehung,
  - kleine Doku-Lücken.

## Befunde

### C-01 Zeitgewichtete Rendite bricht bei kleiner Tagesbasis ein (bis −100 % für den Rest des Spiels)

- **Schwere:** mittel
- **Art:** Modellfehler (mit Testlücke)
- **Bereich:** TS §7.9 („Tagesrendite“, Flüsse am Tagesanfang); PS US-PF-05; `src/app/portfolio/domain/performance-logic.ts:60-66` (`dailyReturn`), `:181-218` (`closeDay`), `:132-141` (`investAtClose`, Benchmark)
- **Befund:**
  - **Mechanismus:** `r_day = V_end / (V_start + CF) − 1` setzt alle externen Flüsse an den Tagesanfang, auch die Lebenshaltung. Am ersten Bankarbeitstag bucht derselbe Bank-Lauf aber auch Kontoführung, Dispo- und Sollzinsen und die Depotgebühr. Das sind keine Flüsse, sie zählen als Rendite. Liegt das Vermögen vor dem Bank-Lauf nur knapp über der Lebenshaltung, ist die Basis `V_start + CF` winzig, und eine Gebühr von 9–12 € wird zu einer Tagesrendite von −40 %, −68 % oder −100 %.
  - **Folge:** Weil der Faktor nach §7.9 bei `V_end < 0` auf 0 fällt, bleibt die Rendite seit Spielbeginn dann für immer bei −100 %, auch wenn das Vermögen später um ein Vielfaches wächst.
  - **Benchmark:** Dasselbe gilt für die Benchmark. Ein negativer Fluss verkauft Einheiten erst zum Schluss, sie bleiben also den ganzen Tag dem Markt ausgesetzt, während die Basis schon um den Fluss gekürzt ist. Auch dort hebelt eine kleine Basis die Tagesbewegung.
  - **Wer betroffen ist:** Knappe Haushalte (Einkommen ≈ Lebenshaltung) und Startkapital 0 sind ausdrücklich erlaubt (`START_CAPITAL_RANGE` min 0, Lebenshaltung darf das Einkommen übersteigen, TS §7.4).
- **Beleg:** Engine-Szenario `twr_small_base.ts` (Testbanken, `b1` 12 € Kontoführung; Einkommen 2.500 €, Lebenshaltung 2.400 €; Startkapital so gewählt, dass am Mi 01.05.2030 nach der Lebenshaltung noch ein Rest bleibt). Der Spieler hat keine Wertpapiere, nur Bargeld:

  | Rest vor Gebühr | Startkapital | Tag 01.05. `index` | Rendite seit Start 2031-04 / 2035-04 | Vermögen 2035-04 |
  | --------------- | ------------ | ------------------ | ------------------------------------ | ---------------- |
  | 5 €             | 2.309,74 €   | 0                  | −100 % / −100 %                      | 8.983 €          |
  | 20 €            | 2.324,74 €   | 0,32               | −80,1 % / −83,0 %                    | 8.999 €          |
  | 50 €            | 2.354,74 €   | 0,7332             | −100 % / −100 % (später erneut)      | 9.029 €          |
  | 500 €           | 2.804,74 €   | 0,976              | −16,7 % / −27,2 %                    | 9.481 €          |

  Mit den eigenen Banken der Mini-Welt (`twr_presets.ts`, Hausbank 9,40 €/Monat) kommen reine Bargeld-Spieler auf diese Werte: Startkapital 0 (Einkommen 1.000 €, Lebenshaltung 900 €) −28,5 % im ersten Jahr, Preset „Student“ −15,7 % nach 5 Jahren (−3,3 % p. a.). Das Gebührenvolumen allein entspricht nur etwa −2 % p. a. auf das mittlere Vermögen.

  Kein Test deckt eine kleine positive Basis ab. Die Tabelle in TS §7.9 hat nur den Fall `V_start + CF ≤ 0`.

- **Vorschlag:**
  1. **Konvention ändern:** Negative externe Flüsse (Lebenshaltung) am Tagesende statt am Tagesanfang ansetzen, also `r = (V_end − CF⁻) / (V_start + CF⁺) − 1`. Das ist eine übliche konservative Konvention. Die Basis enthält dann das Vermögen vor der Entnahme, und die Gebühren des Bank-Laufs wirken auf eine realistische Basis. Die Benchmark rechnet mit derselben Formel, ihre Einheiten werden ja ebenfalls erst zum Schluss verkauft.
  2. **Alternative:** Tage mit sehr kleiner Basis relativ zu den Flüssen des Tages auslassen, etwa `V_start + CF < 5 % × |CF|`, oder die Rendite nur über die Anlagekonten rechnen (Depots und Verrechnungskonten), wie Banken es tun, und die Gesamtvermögens-Sicht über eine geldgewichtete Rendite zeigen (siehe C-09).
  3. **Tests:** In TS §7.9 eine Beispielzeile „kleine Basis“ und eine Property ergänzen: Ein Spieler ohne Wertpapiere mit konstanten Gebühren hat keine Tagesrendite unter −x %.
- **Folgen einer Änderung:**
  - Kein Golden Master (Marktmodell unberührt), keine `SIM_VERSION` nötig, wenn man nur die Engine-Logik betrachtet. Die Tagesreihe (`DailyPoint.index`, Benchmark-Index) ändert sich aber, und gespeicherte Punkte bleiben mit der alten Konvention stehen. Deshalb `SCHEMA_VERSION` anheben oder die Reihe beim Laden neu aufbauen (Regeln vor 1.0, TS §15, E-38).
  - Keine Kalibrierung.
  - Aufwand S–M (Formel, Spec-Tabelle, Engine-Szenario, Properties).

### C-02 Zinsbuchung beim Kontoabschluss nennt nur den Schließmonat als Zeitraum

- **Schwere:** niedrig
- **Art:** Implementierungsfehler
- **Bereich:** TS §7.4 („Textparameter … Zinsbuchungen `from` und `to` (bei quartalsweisem Tagesgeld die drei Monate des Quartals)“); `src/app/engine/domain/banking-system.ts:420-430` (`settlement` ruft `#creditDrafts(…, month, month, …)` mit dem Schließmonat), `:449-451` (`#debitDraft(…, month)`); Anzeige `src/app/banking/ui/statement-list/statement-text.utils.ts:176-193`
- **Befund:** `settlement` bucht `pendingCredit + credit`. Das umfasst beim quartalsweisen Tagesgeld bis zu drei Monate, und bei einem Abschluss zwischen Monatsanfang und erstem Bankarbeitstag den ganzen Vormonat. Die Textparameter tragen trotzdem immer `from = to = Schließmonat`. Der Kontoauszug zeigt deshalb einen zu kurzen Zeitraum. Beträge und Steuer sind richtig. Für Dispo- und Sollzinsen beim Abschluss gilt dasselbe.
- **Beleg:** `close_quarterly.ts`:
  - Quartalstagesgeld (`b2`) mit 10.000 € ab 01.04., geschlossen Mi 15.05.2030: Buchung +24,11 € mit `{"from":"2030-05","to":"2030-05"}`. Der Betrag entspricht 44 Tagen (10.000 € × 2 % × 44/365 = 24,1096 €), also dem 01.04.–14.05. Der Auszug zeigt „01.05.–14.05.“.
  - Monatliches Tagesgeld, geschlossen Mo 03.06.2030, 05:00: +9,06 € (Mai und 01.–02.06.) mit `from = to = 2030-06`. Der Auszug zeigt „01.06.–02.06.“.
- **Vorschlag:** `from` = erster Monat der noch nicht abgerechneten Abgrenzung. Das ist der Monat nach der letzten Gutschrift bzw. der Eröffnungsmonat; bei Quartalstagesgeld der erste Monat des laufenden Quartals, sonst der Vormonat, wenn `pendingCredit`/`pendingDebit` ≠ 0 ist. Ergänzend ein Engine-Szenario „Quartalstagesgeld mitten im Quartal schließen“.
- **Folgen einer Änderung:** Nur Textparameter neuer Buchungen. Kein Golden Master, keine `SIM_VERSION`, keine Kalibrierung. Gespeicherte Journale behalten den alten Text. Aufwand S.

### C-03 Orders mit Kurswert unter einem halben Cent ergeben Stücke zum Nulltarif

- **Schwere:** niedrig
- **Art:** Modellfehler (Randfall)
- **Bereich:** TS §7.1, §7.5 („Kurswert … einmal kaufmännisch auf Cent gerundet“); `src/app/trading/domain/order-execution-logic.ts:140-160` (`orderFill`), `order-command-logic.ts` (`sizeError` lässt jede positive Millionstel-Zahl zu); Weltgenerierung `src/app/world/domain/bank-generator.ts:51,159` (`flatOrFree` mit `orderFlat` [0, 1] € in 10-Cent-Schritten, beim Neobroker also gelegentlich `free`, immer mit `fractionalShares`)
- **Befund:**
  - **Mechanismus:** Bei einer Bank ohne Orderentgelt und Börsenentgelt kostet ein Kauf, dessen Kurswert unter 0,5 Cent liegt, 0 €. Er wird auch bei leerem Verrechnungskonto angenommen und ausgeführt, und gebucht werden zwei Postings über 0 und eine Stückbuchung. Jede solche Order schöpft bis zu 0,5 Cent Wert aus dem Nichts. Lot-Kosten 0 machen sie bei einem späteren Verkauf voll steuerpflichtig.
  - **Ausnutzbarkeit:** Wirtschaftlich unbedeutend, solange man es nicht automatisiert. Es fehlt aber eine Mindestordergröße, die reale Broker haben (Bruchstück-Orders meist ab 1 €).
- **Beleg:** `zero_value_order.ts`: 49 Millionstel zu 100,00 € bei `orderFee: free`, `exchangeFee: 0`, Saldo 0. Das ergibt `orderPlacementError` → `null`, `fill.total` = 0, `executionError` → `null` und gebucht `[acc-2 0, external:market 0]` mit Stückbuchung +49. 20.409 solcher Orders ergeben 1 Stück im Wert von 100 €.
- **Vorschlag:** Mindest-Kurswert für Einzelorders, z. B. 1,00 € wie `SAVINGS_PLAN_MIN_AMOUNT`, oder mindestens 1 Cent. Neuer Fehlercode beim Erteilen und bei Betragsorders, Tabellenzeile in TS §7.5. Alternativ beim Kauf den Kurswert aufrunden und beim Verkauf abrunden. Das schließt die Lücke ganz, ändert aber Beispielwerte.
- **Folgen einer Änderung:** Orderregeln, nicht der Golden Master. `SIM_VERSION` nur, wenn man Orderregeln dazuzählt (E-38). Mutationstests nachziehen. Aufwand S.

### C-04 Kein Schutz gegen Salden jenseits von ±9 · 10¹⁵ Cent; die geduldete Überziehung wächst unbegrenzt

- **Schwere:** niedrig
- **Art:** Modellfehler / Abweichung Doku↔Code
- **Bereich:** TS §7.1 („Beträge im Spiel liegen um Größenordnungen darunter“), §7.4 („Geduldete Überziehung: keine Obergrenze“); `src/app/banking/domain/ledger-logic.ts:46-58,74-90` (geprüft werden nur die Buchungsbeträge, nicht `balanceAfter`)
- **Befund:**
  - **Mechanismus:** Lebenshaltung bis 50.000 €/Monat bei Einkommen 0 ist zulässig (`LIVING_COSTS_RANGE`). Lebenshaltung und Dispozins (Satz + Aufschlag) werden immer gebucht und verzinsen sich monatlich weiter.
  - **Folge:** Der Saldo des Gehaltskontos verlässt nach rund 109 Spieljahren still den Bereich exakter Ganzzahlen. `bookTransaction` wirft nicht, weil jeder einzelne Buchungsbetrag noch sicher ist, und Cent-Genauigkeit geht verloren.
  - **Realismus:** Ohne Kündigung oder Obergrenze durch die Bank ist das Szenario auch fachlich unrealistisch.
- **Beleg:** `overflow.ts` (Mini-Welt, Startkapital 0, Einkommen 0, Lebenshaltung 50.000 €):
  - Saldo 2040 −1,39 · 10⁷ €, 2100 −2,18 · 10¹¹ €, 2130 −2,43 · 10¹³ €.
  - 2139: −9,98 · 10¹⁵ Cent, `Number.isSafeInteger` = false.
  - Kein Fehler, das Journal ist gleich dem Zustand (dieselben ungenauen Additionen).
  - Laufzeit wenige Sekunden im Stapelbetrieb.
- **Vorschlag:**
  - **Engine:** `bookTransaction` prüft zusätzlich `Number.isSafeInteger(balanceAfter)` (ein Programmierfehler-Pfad wie die übrigen Prüfungen).
  - **Fachlich:** Die geduldete Überziehung begrenzen, z. B. auf ein Vielfaches des Rahmens oder des Nettoeinkommens. Darüber kündigt die Bank, oder das Spiel endet mit einem „Insolvenz“-Ereignis. Diese Entscheidung gehört dem PO und kann in Stufe 2 (Lebenszyklus) kommen.
  - **Doku:** Den Satz in TS §7.1 präzisieren.
- **Folgen einer Änderung:** Die Prüfung allein hat keine Folgen. Eine Obergrenze ist eine Modelländerung (E-17 ergänzen, Engine-Szenario, `SIM_VERSION` nach E-38). Aufwand S (Prüfung) bzw. M (Obergrenze).

### C-05 Verkauf mit Kosten über dem Kurswert macht das Verrechnungskonto negativ; die Doku nennt nur Bankbelastungen

- **Schwere:** niedrig
- **Art:** Abweichung Doku↔Code (Doku-Lücke)
- **Bereich:** TS §7.4 („Verrechnungskonten: … Von der Bank veranlasste Belastungen (Gebühren, Zinsen) werden immer gebucht; ein Verrechnungskonto kann dadurch negativ werden“); TS §7.5 Kostentabelle (Verkauf 0,5 zu 3,335 € → −11,33 €); `order-execution-logic.ts:172-174` (`executionError` prüft beim Verkauf nur den Bestand)
- **Befund:** Ein Verkauf, dessen Kosten den Kurswert übersteigen, belastet das Verrechnungskonto und kann es ins Minus bringen. Danach fallen Sollzins und `account-uncovered` an, und neue Kauforders sind gesperrt. Das ist realistisch (Mindestentgelt) und in §7.5 als Zahl angelegt. In §7.4 fehlt dieser Weg ins Minus aber. Nebenbei hat die Schrittliste des Bank-Laufs in §7.4 eine doppelte „7.“: „6. Dispozinsen … und 7. Sollzinsen“, danach Punkt 7 „Daueraufträge“.
- **Beleg:** Code oben. Rechnung: 0,5 × 3,335 € = 1,6675 € → 1,67 €, Kosten F 10,00 € + 3,00 € → −11,33 € (stimmt mit §7.5).
- **Vorschlag:** In TS §7.4 ergänzen: „ebenso ein Verkauf, dessen Kosten den Kurswert übersteigen“. Optional zeigt das Order-Ticket einen Hinweis, wenn die Gutschrift negativ ist. Nummerierung korrigieren.
- **Folgen einer Änderung:** Nur Doku. Aufwand S.

### C-06 Betragsorder: „größte Stückzahl“ gilt nur bei monotonen Kosten

- **Schwere:** Hinweis
- **Art:** Abweichung Doku↔Code
- **Bereich:** TS §7.5 („Betragsorders (`amountOrderQuantity`) … auch bei nicht monotonen Stufenmodellen“); `order-execution-logic.ts:94-120`
- **Befund:** Die Suche verdoppelt `high`, bis die erste Stückzahl nicht mehr passt, und halbiert dann. Sie garantiert „Ergebnis passt, ein Schritt mehr nicht“, also ein lokales Maximum. Bei einer Gesamtbelastung `Kurswert + Kosten`, die nicht monoton steigt (Stufenmodell, dessen Gebühr an einer Grenze stärker fällt, als der Kurswert steigt), kann eine größere passende Stückzahl jenseits der ersten Lücke liegen. Die Spezifikation verspricht „die größte“. Die Standardwelt erzeugt `tiered` nicht, und die Stufen in TS §7.3 ergeben eine monotone Gesamtbelastung.
- **Vorschlag:** In TS §7.5 formulieren: „die größte bei monotoner Gesamtbelastung; sonst eine Stückzahl, bei der ein Schritt mehr nicht passt“. Alternativ monotone Stufen als Invariante der Konditionen festschreiben.
- **Folgen einer Änderung:** Nur Doku. Aufwand S.

### C-07 Zinsgutschrift erst am ersten Bankarbeitstag des Folgemonats; Dezemberzinsen zählen zum neuen Steuerjahr

- **Schwere:** Hinweis
- **Art:** Verbesserung (Realismus)
- **Bereich:** TS §7.4 (Bank-Lauf, „Zuflussprinzip“); `bank-run-logic.ts`, `banking-system.ts:556-572`
- **Befund:**
  - **Modell:** Die Zinsen des Vormonats werden am ersten Bankarbeitstag gebucht, oft am 2. oder 3. des Monats, und zählen mit diesem Tag steuerlich.
  - **Realität:** Banken schließen Tagesgeld und Verrechnungskonten meist zum Monats- bzw. Quartalsende ab (Wertstellung Periodenende), und die Dezemberzinsen gehören dann zum alten Jahr. Für regelmäßig wiederkehrende Einnahmen um den Jahreswechsel gilt zudem die 10-Tage-Regel (§ 11 Abs. 1 Satz 2 EStG).
  - **Folge im Spiel:** Die Zinsen eines Kalenderjahres verschieben sich um einen Monat ins Folgejahr, und der Pauschbetrag eines Jahres trifft Dezember-Vorjahr bis November. Das ist intern konsistent und spielerisch kaum spürbar.
- **Vorschlag:** In Stufe 2 erwägen, die Zinsen mit dem Monatsabschluss (00:00 des Folgemonats, Steuerjahr des abgeschlossenen Monats) zu buchen. Sonst nur in TS §7.7 als bewusste Vereinfachung kennzeichnen.
- **Folgen einer Änderung:** Neue Buchungstermine ändern Journale und Monatswerte (E-38). Aufwand M.

### C-08 Steuervereinfachungen begünstigen bzw. benachteiligen ETFs und Aktien gegenüber dem Vorbild spürbar

- **Schwere:** Hinweis
- **Art:** Verbesserung (dokumentierte Vereinfachung E-11)
- **Bereich:** TS §7.7 („ein Verlusttopf …, keine Teilfreistellung oder Vorabpauschale, keine Quellensteuer“)
- **Befund:** Gegen das deutsche Vorbild nachgerechnet:
  - **Verlusttopf:** Ein einziger Topf erstattet Steuer auf Zinsen und Dividenden aus Aktienverlusten. Real verrechnen sich Aktienverluste nur mit Aktiengewinnen (§ 20 Abs. 6 Satz 4 EStG).
  - **Teilfreistellung:** Ohne sie zahlen Aktien-ETFs effektiv 25 % statt 17,5 % (30 % Teilfreistellung).
  - **Vorabpauschale:** Ohne sie stunden thesaurierende ETFs die Steuer bis zum Verkauf vollständig.
  - **Bewertung:** Jede Abweichung ist für sich dokumentiert, zusammen verschieben sie aber die Abwägung Aktie ↔ ETF ↔ ausschüttend/thesaurierend. Die Mechanik selbst (kumulative Neuberechnung, Pauschbetrag nach dem Verlustvortrag, Verfall des Pauschbetrags, Verlustvortrag nur bei negativem Jahresergebnis, Erstattung nur im laufenden Jahr, FIFO je Depot, Anschaffungsnebenkosten und Veräußerungskosten im Gewinn) ist richtig.
- **Vorschlag:** Für den Steuerausbau in M10 (AP „Steuerdetails“) die Teilfreistellung zuerst, sie ist der größte Effekt. Danach Aktien-Verlusttopf und Vorabpauschale.
- **Folgen einer Änderung:** Steuermodell, Engine-Szenarien. Aufwand M–L.

### C-09 Keine geldgewichtete Rendite; die Benchmark-Rendite weicht an Flusstagen von der Indexrendite ab

- **Schwere:** Hinweis
- **Art:** Verbesserung
- **Bereich:** TS §7.9, PS US-PF-05; `performance-logic.ts:161-176` (`closeBenchmarkDay`)
- **Befund:**
  - **Geldgewichtete Rendite:** Der Prüfauftrag nennt sie, aber Spezifikation und Code kennen nur die zeitgewichtete Rendite und die absoluten Größen (`sinceStart`, `comparison`). Bei einem Haushalt mit Flüssen in der Größenordnung des Vermögens wäre eine geldgewichtete Rendite (interner Zinsfuß aus `V_0`, den Tagesflüssen und `V_jetzt`) die aussagekräftigere Größe für „was hat mein Geld verdient“ und unempfindlich gegen C-01.
  - **Benchmark an Flusstagen:** Die Flüsse warten bis zum Schluss als Bargeld, stehen aber schon in der Tagesbasis. Die Benchmark-Rendite eines Flusstags ist deshalb um den Faktor `B_start / (B_start + CF)` verdünnt bzw. gehebelt (TS-Tabelle: Di +4,76 % bei +10 % Index). Über ein Jahr ist der Effekt klein (geschätzt < 0,1 Pp. systematisch, sonst Rauschen). Er bedeutet aber, dass die Benchmark-Rendite nicht die Indexrendite ist.
- **Vorschlag:** Optional die geldgewichtete Rendite als dritte Kennzahl, mit Spec-Beispiel und Orakel aus einer Brute-Force-Nullstellensuche im Test. Bei der Benchmark ergibt Vorschlag 1 aus C-01 (negative Flüsse am Tagesende) zusammen mit positiven Flüssen erst ab dem Schluss die Indexrendite.
- **Folgen einer Änderung:** Neue Projektionsfelder. Aufwand M.

## Geprüft und in Ordnung

Nachgerechnet mit `ref_tables.py` (eigene Referenz mit `fractions.Fraction`, ohne Repo-Code; Ausgabe `ref_tables.out`, 101 Prüfungen OK und eine Fehlmeldung, die von einem Tippfehler in meiner eigenen Erwartung kam, Wert 29,975997 bestätigt) und von Hand:

- **§7.1 Rundung:** kaufmännisch über `roundHalfAwayFromZero`. Die Artefaktkorrektur auf 15 Stellen erklärt 1,005 → 1,01. Abschätzung für `marketValue` bei 10⁵ Stück × 1.000 €: Das Produkt liegt über 2⁵³, der Fehler (≈ 10⁻⁶ Cent) wird von der Artefaktkorrektur aufgefangen.
- **§7.2 Buchungsbeispiele 1–6, Auszug von `acc-1` und `acc-2`, Ablehnungsfälle, Kaufbeispiel:** Salden 7.646,83 € / 3.005,48 €, 8.896,83 € und 1.755,48 € stimmen. Die Suchtabelle (26 Zeilen) und die Zeitraumtabelle (8 Zeilen, Feb 2032 mit 29 Tagen) sind logisch nachvollzogen.
- **§7.3 Gebührentabelle (13 Zeilen), Stufenmodelle A/B (7 Zeilen), Depotgebühr (7 + 7 Zeilen):** Quartalstage 91/92, 30/364, 40/364, 46/368 und 1/368 stimmen, ebenso Ø 100,005 € → 100,01 €.
- **§7.3 Bankenvergleich:** Alle sechs Sortierungen und Werte stimmen, auch die deutsche Namenssortierung der Broker-Gleichstände (Darara, Helova, Serara, Valum).
- **§7.3 Zinstabelle (12 Zeilen):** act/365, Schaltjahr 366/365, Dispo-Stufung 5.000 € zu 11 % + 3.000 € zu 15 %, stetig an der Grenze. Die Zinsen ohne Rahmen stimmen ebenfalls.
- **Zinseszins über 10 Jahre (Engine gegen unabhängige Tagesrechnung):** `interest10y.ts` / `interest10y_ref.py`.
  - Ergebnis: 100.000 € bei 2 % monatlich → 118.901,53 € in beiden Rechnungen.
  - Die 119 Gutschriften sind identisch, die 66 Steuerbuchungen ergeben dasselbe Endergebnis.
  - Schaltjahre 2032 und 2036 sind eingeschlossen, ebenso der Pauschbetrag je Jahr und die Dezemberzinsen im Folgejahr.
- **Geldflüsse / Doppik:** In denselben 10 Jahren summiert sich jede Transaktion zu 0, und `journalBalances` ist gleich dem Zustand. Rundungsreste der Zinsabgrenzung verfallen nur unterhalb eines halben Cents je Abrechnung (dokumentiert). Neues Geld entsteht nur in C-03. Steuern: Ein Einbehalt ist ≤ 25 % des Ertrags + 1 Cent ≤ Ertrag ≤ Gutschrift, deshalb bringt die Steuer kein Konto unter seinen Stand vor der Gutschrift (Herleitung und Code `tax-logic.ts`).
- **§7.4 Termine:** Alle 43 genannten Daten haben den richtigen Wochentag (z. B. Sa 01.06.2030, Fr 28.06.2030, Mi 01.01.2031, Sa 28.02.2032 → Mo 01.03.2032, So 29.02.2032). Bank-Lauf-Tabelle, `nextBankRunTick`, Dauerauftragstermine (9 Zeilen) und erste Termine (7 Zeilen) sind logisch nachvollzogen. Die Reihenfolge im Bank-Lauf ist im Code wie spezifiziert.
- **§7.4 Kontoführung (10 Zeilen) und Kontoabschluss (5 Zeilen):** 16/30, 10/31, 1/31, 1/30, 3/30 stimmen, ebenso die Abrechnungsgrenze am ersten Bankarbeitstag um 06:00 (`closingAccountFees`).
- **§7.4 Dispo-Rahmen (11 Zeilen):** Cent, dann volle Euro (3.333,33 → 3.333, 1.666,67 → 1.666, 4.691,34 → 4.691), Gleichstandsregeln. Verfügbarer Betrag (6 Fälle) und Ereignistabelle (13 Zeilen) logisch nachvollzogen.
- **Dispo in Gegenrichtung:** Ein Verrechnungskonto mit Plus- und Minustagen im selben Monat führt Haben- und Sollzinsen getrennt, ohne Saldierung. Nur Haben ist steuerpflichtig, Sollzins ist nicht abzugsfähig. Girokonten haben keinen Habenzins. Arbitrage Dispo → Tagesgeld lohnt nicht (Dispo ≥ 7,3 % > Tagesgeld ≤ 2,3 % in den Beispielbanken).
- **§7.4 Monatswerte:** Sparquote 26,01 %, −50 %, `null`, 105 %; Erträge-und-Kosten-Tabelle (2030: 3.428 Cent, davon 66 geschätzt; TER 20,8 → 21); Spread- und TER-Beispiele stimmen.
- **§7.4 Bankkommandos:** `acc-2` April 7,95 € (29 Tage), Mai 2,47 € (9 Tage auf 5.007,95 €), Rest 5.010,42 €. `acc-3` 9,57 € + 3,19 € → 987,24 €, bei 9,60 € Rest −3,16 €.
- **§7.5 Orders:**
  - Prüftabelle je Tick (20 Zeilen) mit Kurslücke, Kosten (4 Zeilen inkl. −11,33 €) und Buchungsbeispielen.
  - Betragsorders (6 Zeilen), mit eigener binärer Suche nachgerechnet: 29,975997 / 29 / 19,8524 / 99 / 0 / 0,001.
  - Reservierungen (10 Zeilen), Erteilen (Market 14 = 1.484,47 € angenommen, 15 = 1.589,58 € abgelehnt), Ändern (+10 / +490 / +500 €), Ausführung (1.513,00 € / 1.512,99 €).
  - Gültigkeitstabelle (15 Zeilen inkl. 29.02. → 28.02.).
- **§7.6 Lots:** Teilverkaufstabelle (realisiert +44,80 / −115,80 / −112,00, Summe −183,00 €, Kosten exakt 1.533,00 €), Rundung 333,33/333,34/333,33 und 5,005 → 5,01, Einstandskurse. `lotCostShare` rechnet exakt mit `BigInt`. FIFO je Depot entspricht der deutschen Regel.
- **§7.7 Steuern:**
  - Tabellen alle nachgerechnet: Jahr 2030 (54,2475 → 54,25), Verlustvortrag (−2.500 → 125,00 €), Verkäufe mit Erstattungen (225 / −150 / −75 / 0 / 0 / 100), Übersicht 2030/2031, „nur Gewinne“, „nur Verluste“, Vorschau (250,00 / −54,25 / −25,00).
  - Code `tax-logic.ts` setzt die Formel 1:1 um. `usedAllowance` rechnet nach dem Verlustvortrag, der Pauschbetrag verfällt zum Jahresende.
- **§7.8 Sparpläne:** Mengen 2,665245 / 0,410416 / 0,093981 / 3,333333 / 0 mit „exakter Kurswert aufgerundet ≤ Betrag − Kosten“, Terminbeispiele (6 Zeilen, Wochenenden), erste Termine (4 Zeilen).
- **§7.9 Bewertung:**
  - TWR-Tabelle (`index` 1,040502), Benchmark-Tabelle (11,904762 Einheiten, +4,1667 %, −619,05 € bar), Annualisierung (+4,8809 %, −10 %, `null` unter 365 Tagen) und laufendes Jahr (+3 %).
  - Veränderung heute (+22,00 € / +0,7097 %), Depotübersicht (8,59 % / −4,81 % / 36,54 %), Allokation mit Durchschau (61,93 % / 38,07 %, Assetklassen 47,75 / 27,50 / 24,75 %), `apportionCents`, Positionsdetail (102,527… / 102,907…).
  - `annualizedReturn` nutzt `detExp`/`detLog` statt `**`.
  - Startkapital 0 behandelt der Code ohne Division durch 0 (Tage ausgelassen, Hinweis über `skippedDays`). Totalverlust: Der Faktor fällt auf 0 und bleibt dort, wie spezifiziert (zu den Folgen siehe C-01).
- **Bestehende Tests:** `npx vitest run` über `shared/banking/taxes/trading/portfolio/domain` und die Engine-Szenarien Banking, Bankkommandos, Steuern, Performance, Orders, Portfolio, Sparpläne und Daueraufträge: 47 Dateien, 1.159 Tests grün. Die Spec-Tabellen sind dort als Beispieltabellen kodiert (stichprobenartig gelesen).
- **Entscheidungen:**
  - E-09: Cent und Millionstel sind ganzzahlig, die Kurse liegen auf dem Raster.
  - E-11: Formel und Konstanten 25 % / 1.000 €.
  - E-17: Rahmen je Bank aus drei Monaten, Aufschlag nur über dem Limit, Überweisungen bis zum verfügbaren Betrag, Bankbelastungen auch ins Minus.
  - E-19: Bank-Lauf 06:00, Gehalt am letzten, Lebenshaltung am ersten Bankarbeitstag.
  - E-21: Daueraufträge als letzter Schritt, ohne Teilüberweisung.
  - Alle sind im Code so umgesetzt wie in TS §16 beschrieben.
- **Realismus der Parameter:**
  - Dispo 11–14 % + 3–5 Pp., Rahmen 2 × Nettogehalt, Gebührenbefreiung ab 700 € Geldeingang, Depotgebühr 0,14–0,2 % mit Minimum, Orderentgelt 0,25 % mit min/max: plausibel für deutsche Filial- und Direktbanken.
  - Mindest-Depotgebühr auch für leere Depots: streng, aber bei Filialbanken üblich.

## Nicht geprüft / Grenzen

- **Ablauf in der Engine:** Ich habe die Tabellen gegen die Spezifikation nachgerechnet und den Code gelesen. Den Ablauf in der Engine habe ich nur mit eigenen Szenarien geprüft:
  - Zinsen über 10 Jahre,
  - Abschluss von Tagesgeld,
  - TWR bei kleiner Basis,
  - Überlauf,
  - Gratis-Order (rein funktional, nicht als Engine-Lauf mit einem echten Neobroker der Standardwelt).
- **Weitere Engine-Szenarien:** Orders, Dividenden, Sparpläne und Daueraufträge in der Engine habe ich über die vorhandenen grünen Szenarien und die Lektüre von `order-execution-logic.ts`, `banking-system.ts`, `tax-logic.ts`, `lot-logic.ts` und `performance-logic.ts` geprüft, nicht mit eigenen Langläufen.
- **Nicht gelesen:** `order-system.ts`, `distribution-system.ts`, `savings-plan-system.ts`, `bank-commands.ts`, `custody-fee-logic.ts`, `overdraft-logic.ts`, `standing-order-logic.ts`, `savings-plan-logic.ts`, `order-command-logic.ts` und `order-reservation-logic.ts` habe ich nur stichprobenartig oder gar nicht Zeile für Zeile gelesen. Ihre Tabellen decken die vorhandenen Specs ab.
- **Gesucht, nicht gefunden:** Doppelbuchung derselben Ausschüttung bei Umleitung über mehrere geschlossene Konten. Rein lesend gesucht, kein eigenes Szenario.
- **Außerhalb des Auftrags:** UI-Vorschauen (`order-preview-logic.ts`, Dashboard „Demnächst“) nur auf ihre Wiederverwendung der Engine-Funktionen geprüft (laut `trading.md` und `dashboard.md`), nicht nachgerechnet. Mutationstests, Kalibrierung, Marktmodell und Weltgenerierung (Wertebereiche der Konditionen) waren nicht Gegenstand.
- **Annahmen:**
  - Die Rendite bewertet das gesamte Nettovermögen inkl. Gehaltskonto (so in TS §7.9).
  - Die in C-01 gezeigten knappen Haushalte sind zulässige Spielerprofile (Formular erlaubt Startkapital 0 und Lebenshaltung ≥ Einkommen).
