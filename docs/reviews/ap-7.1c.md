# AP 7.1c – Modellreview: Wirtschaftsmodell: Gegenüberstellung und gemeinsame Befundliste

> Geprüfter Stand: `c1e2514` · Läufe: Opus 5.5 (`effort: high`), Fable 5.2 (`effort: medium`) · Gegenüberstellung: 15.11.2026
> Rohberichte: [Lauf Opus](./ap-7.1c/lauf-opus.md) · [Lauf Fable](./ap-7.1c/lauf-fable.md)

## Ergebnis

Hauptbuch, Zinsen, Gebühren, Orders, Lots, Steuern und Sparpläne sind richtig. Beide Läufe haben alle Beispieltabellen in TS §7 unabhängig nachgerechnet und Langläufe der Engine gegen eigene Referenzen geprüft, ohne Abweichung. Geld entsteht nur im Randfall 7.1c-03, in Bruchteilen eines Cents. Grundlegende Modellfehler, die eine neue `SIM_VERSION` brauchen, gibt es nicht. Es gibt aber ein falsches Ergebnis, das Spieler sehen: Bei kleinem Vermögen zeigen die zeitgewichtete Rendite und die Benchmark-Rendite grob falsche Werte (7.1c-01, 7.1c-02). Im eigenen Szenario zeigt die Engine für einen reinen Bargeld-Spieler −8,73 % p. a. statt rund −0,7 % p. a. Für seine Benchmark zeigt sie +15,1 %, obwohl der Weltindex im selben Zeitraum −33,8 % verliert. Die Rechnung ist eine Auswertung außerhalb des Golden Masters: Die Korrektur braucht keine `SIM_VERSION`, wohl aber eine neue `SCHEMA_VERSION` oder eine Neuberechnung der gespeicherten Tagesreihe. Empfohlen wird deshalb ein Teil-AP 7.3 für die Rendite und eines für kleine Korrekturen an Code und Doku. Alles Übrige wird bei der nächsten Modelländerung mitgenommen oder bleibt bewusst so.

## Gegenüberstellung

| Thema                                                                                        | Lauf Opus                                          | Lauf Fable                                                 | Verhältnis                        | Ergebnis der Abwägung                                                                                             |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Zeitgewichtete Rendite (TWR) bei kleiner Tagesbasis                                          | C-01, mittel                                       | C-01, hoch                                                 | übereinstimmend, Schwere strittig | bestätigt, Schwere **hoch**; die Benchmark ist stärker betroffen als beide melden (7.1c-01)                       |
| Benchmark-Rendite an Flusstagen                                                              | in C-01 (Mechanismus), C-09 (Hinweis, „< 0,1 Pp.“) | in C-01 („nicht aussagekräftig“, Grund: keine Kontokosten) | Widerspruch in der Größe          | bei kleinem Vermögen bis +49 Pp. Abweichung vom Index; bei üblichen Haushalten 0,1–2 Pp. in 5 Jahren (in 7.1c-01) |
| Negatives Vermögen: dauerhaft −100 %, „0 %“ trotz Verlusten, Benchmark lässt andere Tage aus | in C-01 (−100 %)                                   | C-02, mittel                                               | nur Fable (Teil auch Opus)        | bestätigt, mittel (7.1c-02)                                                                                       |
| Geldgewichtete Rendite fehlt                                                                 | C-09, Hinweis                                      | in C-01 (Vorschlag 1)                                      | übereinstimmend                   | Umfang ist PO-Frage (7.1c-08)                                                                                     |
| Verkauf mit Kosten über dem Kurswert macht das Verrechnungskonto negativ                     | C-05, niedrig                                      | C-03, niedrig                                              | übereinstimmend                   | bestätigt, Doku und Hinweis im Order-Ticket (7.1c-06)                                                             |
| Doku TS §7.4: Nummerierung der Schritte des Bank-Laufs                                       | in C-05                                            | in C-04                                                    | übereinstimmend                   | bestätigt (7.1c-07)                                                                                               |
| Doku TS §7.4: Wochentag „Fr 29.03.2032“                                                      | „alle 43 Daten richtig“                            | C-04, niedrig                                              | Widerspruch                       | Fable hat recht, der 29.03.2032 ist ein Montag (7.1c-07)                                                          |
| Gratis-Stücke bei Kurswert unter 0,5 Cent                                                    | C-03, niedrig                                      | „Geld entsteht nicht“ (kein kostenloser Broker geprüft)    | nur Opus                          | bestätigt, niedrig (7.1c-03)                                                                                      |
| Zeitraum der Zinsbuchung beim Kontoabschluss                                                 | C-02, niedrig                                      | –                                                          | nur Opus                          | bestätigt (7.1c-04)                                                                                               |
| Salden über `MAX_SAFE_INTEGER`, geduldete Überziehung ohne Grenze                            | C-04, niedrig                                      | „erreichbare Beträge um Größenordnungen darunter“          | nur Opus                          | bestätigt; nur in einem extremen, zulässigen Profil nach 109 Jahren (7.1c-05)                                     |
| Doppelrundung in `roundHalfAwayFromZero` ab etwa 10⁷ €                                       | „Artefaktkorrektur fängt den Fehler auf“           | C-05, Hinweis                                              | Widerspruch                       | Fable hat recht, Fehler 1 Cent, sehr selten (7.1c-09)                                                             |
| Betragsorder findet bei nicht monotonen Kosten nur ein lokales Maximum                       | C-06, Hinweis                                      | –                                                          | nur Opus                          | bestätigt, nur Doku (7.1c-10)                                                                                     |
| Kein Langzeit-Szenario gegen eine Referenz in der Suite                                      | –                                                  | C-06, Hinweis                                              | nur Fable                         | bestätigt (7.1c-11)                                                                                               |
| Zinsgutschrift erst im Folgemonat, Dezemberzinsen im neuen Steuerjahr                        | C-07, Hinweis                                      | als richtig vermerkt                                       | Bewertung verschieden             | dokumentierte Vereinfachung, M8 (7.1c-12)                                                                         |
| Steuervereinfachungen gegenüber dem Vorbild                                                  | C-08, Hinweis                                      | als richtig vermerkt (E-11)                                | Bewertung verschieden             | bereits AP 9.11 (7.1c-13)                                                                                         |

## Nachgeprüft

Skripte und Ausgaben liegen im Arbeitsordner `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1c-synthese/`.

**1. Wo die Rendite gerechnet wird und was eine Korrektur berührt.** Gelesen: `portfolio/domain/performance-logic.ts`, `engine/domain/performance-system.ts`, `engine/domain/version.ts`, `market/domain/golden-master.ts`, TS §7.9 und §15.

- Die TWR ist Engine-Zustand: `PlayerState.performance` (`index`, `yearStartIndex`, Benchmark mit `index`) liegt im Snapshot. Jeder Tag wird ein `DailyPoint` mit `index` und `benchmarkIndex`. Der Host speichert die Punkte in IndexedDB (`series`), und der Export trägt sie.
- Die Rendite wirkt auf keine Spielregel zurück: Kein Code außerhalb von `performance-logic.ts` liest `index` oder `benchmarkIndex`, nur Projektion und Anzeige.
- Der Golden Master umfasst nur Welt und Markt (`golden-master.ts` importiert Weltgenerierung, Marktkontext und Prüfsummen). `SIM_VERSION` steigt laut `version.ts` und TS §15 nur bei einem Golden-Master-Bruch. Eine neue Formel braucht also **keine `SIM_VERSION`** und keine Kalibrierung.
- **Gespeicherte Spielstände:** Die Struktur bleibt gleich, die Bedeutung der gespeicherten Werte ändert sich. Ein Spieler mit `index` 0 bliebe auch mit neuer Formel bei −100 %, weil der Faktor 0 verkettet bleibt. Zwei Wege:
  - `SCHEMA_VERSION` anheben (vor 1.0 zulässig, E-25; E-38 schlägt eine Erhöhung je Meilenstein vor). Das sperrt alle Spieler. Bricht 7.3 ohnehin eine `SIM_VERSION` aus AP 7.1a oder 7.1b, kostet es nichts zusätzlich.
  - Die Kette beim Laden aus den gespeicherten Tagespunkten neu rechnen: Die Punkte enthalten Vermögen und Fluss je Tag. Gehalt (letzter Bankarbeitstag) und Lebenshaltung (erster Bankarbeitstag) fallen nie auf denselben Tag, das Vorzeichen des Tagesflusses trennt also Zu- und Abfluss. Die Benchmark ist nur aus dem auf Cent gerundeten `benchmarkValue` rekonstruierbar, das ist eine kleine Näherung.
- **Folgerung:** Kategorie „7.3 ohne Modelländerung“. Die Fragen an den PO: Welche Konvention gilt (die alte ist eine PO-Entscheidung vom 13.11.2026), und gibt es eine neue `SCHEMA_VERSION` oder eine Migration?

**2. Eigenes Szenario zur TWR (`twr.ts`, Ausgabe `twr.out`).**

- **Aufbau:** Spieler ohne Wertpapiere mit der erzeugten Hausbank der Mini-Welt (Seeds `mini-1` und `mini-2`), Presets und kleines Startkapital, je 5 Jahre. Dazu zwei Fälle mit Testbanken und ein Anleger mit ETF-Kauf und Sparplan.
- **Nachrechnung:** Die TWR habe ich aus Tagespunkten und Journal neu gerechnet. Unabhängige Vergleichsgrößen ohne Repo-Helfer: Modified Dietz über den ganzen Zeitraum, XIRR (Bisektion) und die naive Kostenquote (Kosten / Ø Vermögen p. a.).
- **Varianten:** „Abflüsse am Tagesende“ (Opus, `(V_end − CF⁻) / (V_start + CF⁺) − 1`) und „Tage mit Basis < 5 % von |CF| auslassen“ (Fable, Vorschlag 3).

| Fall (Start / Einkommen / Lebenshaltung)                        | Seed   | Engine-TWR p. a.               | schlechtester Tag                           | Abflüsse am Tagesende p. a. | Basis < 5 % auslassen p. a. | XIRR p. a. |
| --------------------------------------------------------------- | ------ | ------------------------------ | ------------------------------------------- | --------------------------- | --------------------------- | ---------- |
| Studium 2.000 / 1.000 / 900 €                                   | mini-1 | −3,35 %                        | −0,78 %                                     | −2,51 %                     | −3,35 %                     | −2,59 %    |
| Studium                                                         | mini-2 | −4,36 %                        | −0,94 %                                     | −3,17 %                     | −4,36 %                     | −3,46 %    |
| Berufseinstieg 10.000 / 2.500 / 1.800 €                         | mini-1 | −0,47 %                        | −0,11 %                                     | −0,43 %                     | −0,47 %                     | −0,38 %    |
| 0 / 2.500 / 1.800 €                                             | mini-1 | −2,84 %                        | −8,28 %                                     | −2,15 %                     | −2,84 %                     | −0,61 %    |
| 500 / 2.500 / 1.800 €                                           | mini-2 | **−8,73 %** (−36,69 % in 5 J.) | **−32,11 %** (Mo 03.06.2030, Basis 56,52 €) | −1,52 %                     | −1,38 %                     | −0,69 %    |
| Anleger 10.000 / 2.800 / 1.700 €, ETF und Sparplan (Testbanken) | mini-1 | +10,57 %                       | −1,97 %                                     | +10,61 %                    | +10,57 %                    | +11,48 %   |

- **Engine gegen Nachrechnung:** Die Engine rechnet genau wie spezifiziert (Abweichung 0). Fables Werte (−15,67 %, −19,99 %, −36,69 %, Tag 03.06.2030) und Opus' Mechanismus sind reproduziert.
- **Ursache:** Die Schritte des Bank-Laufs buchen die Lebenshaltung vor Kontoführung und Dispozins (`BANK_RUN_STEPS`). Eine strenge TWR mit Bewertung zu jedem Fluss träfe also dieselbe kleine Basis. Die Formel ist damit kein Umsetzungsfehler. Das Problem ist die Festlegung: Feste Kosten auf einer Basis nahe 0 ergeben beliebig große Tagesverluste, und ein einziger Tag prägt die Kette für immer.
- **Varianten:**
  - Beide beseitigen den Ausreißer.
  - Bei normalen Anlegern ändern sie die Rendite kaum (+10,61 % statt +10,57 % p. a.).
  - Der verbleibende Abstand zur XIRR bei Start 0 (−2,15 % gegen −0,61 %) ist eine Eigenschaft jeder TWR: Sie gewichtet die frühen Monate mit kleinem Vermögen und vollen Gebühren gleich. Er ist kein Fehler.
- **Fälle mit Testbank (Fable C-02):**
  - 10 € ohne Einkommen: Am 01.05.2030 ist die Basis 10,00 € und das Vermögen am Tagesende −2,00 €. Die TWR steht danach dauerhaft bei −100 %, auch in beiden Varianten.
  - 0 / 2.000 / 2.000 €: 1.785 ausgelassene Tage, TWR 0,00 % bei −1.811,15 € Veränderung ohne Flüsse.
  - Damit ist bestätigt, dass 7.1c-02 eine eigene Regel braucht.

**3. Benchmark gegen den Index ohne Flüsse (`bench.ts`, `bench2.ts`).** Benchmark-Index nach 5 Jahren gegen den Benchmark-Index eines Spielers ohne Flüsse (reine Indexrendite, gleiche Tage):

| Seed   | Index ohne Flüsse | Studium   | Berufseinstieg | Start 0   | Start 500 €  |
| ------ | ----------------- | --------- | -------------- | --------- | ------------ |
| mini-1 | +135,44 %         | +131,40 % | +133,46 %      | +113,85 % | +134,24 %    |
| mini-2 | −33,77 %          | −33,65 %  | −33,74 %       | −16,70 %  | **+15,13 %** |

- **Größter Tagesfehler:** mini-2, Start 500 €, Mo 03.06.2030. Der Index steigt um 1,44 %, die Benchmark um 57,65 %, also 56,21 Pp. mehr.
- **Ursache:** Der Abfluss steht schon in der Basis, verkauft aber erst zum Schluss. Bei kleinem Schattenvermögen hebelt das die Tagesbewegung, wie Opus beschreibt.
- **Größe:** Opus' Schätzung „< 0,1 Pp. systematisch“ gilt nur für übliche Haushalte. Selbst dort sind es 2 Pp. in 5 Jahren (mini-1 Berufseinstieg, ≈ 0,2 Pp. p. a.).
- **Gegenprobe:** Alle Flüsse am Tagesende, also `(B_end − CF) / B_start`, aus den gespeicherten Punkten gerechnet, ergeben in allen vier Fällen ohne ausgelassene Tage genau die Indexrendite (135,44 % bzw. −33,77 %). Bei Start 0 und 500 € weichen sie nur noch ab, weil das Schattenportfolio an 59–85 Tagen kein Vermögen hat.
- **Folgerung:** Die Benchmark-Rendite ist in diesen Fällen so falsch, dass der Vergleich nach US-PF-05 das Gegenteil der Wahrheit zeigt. Der Wert des Schattenportfolios selbst ist richtig (Fable `s3.ts`: centgenau).

**4. Wochentag 29.03.2032.** Python `datetime`: 28.03.2032 Sonntag, 29.03.2032 Montag. TS §7.4 Zeile 1361 nennt „Fr“, TS §7.8 Zeile 1844 richtig „Mo“. Fable hat recht, Opus' Aussage „alle 43 Daten richtig“ stimmt nicht.

**5. Doppelrundung.** Exakt mit `fractions.Fraction`: 3.554,224689 Stück × 3.639,791 € = 1.293.663.503,4999999 Cent, richtig gerundet 12.936.635,03 €. `toPrecision(15)` macht daraus …503,500000, das Ergebnis ist …635,04 €. Fables Beleg stimmt. Opus' Abschätzung betraf nur Gleitkommafehler des Produkts, nicht die zweite Rundung.

**6. Befunde nur von Opus, Skripte erneut ausgeführt.**

- **`zero_value_order.mjs`:** 49 Millionstel zu 100 € bei kostenloser Bank. Kurswert 0, Kosten 0, angenommen und mit Stückbuchung ausgeführt. Code: `orderFill` rundet den Kurswert, `executionError` prüft nur `fill.total > free`.
- **Häufigkeit (`freebroker.ts`):** In 11 von 200 Standardwelten gibt es eine Bank ohne Order- und Börsenentgelt. Grund: Neobroker mit `orderFlat` [0, 1] € in 10-Cent-Schritten, `flatOrFree`.
- **`close_quarterly.mjs`:** +24,11 € mit `{"from":"2030-05","to":"2030-05"}` für 44 Tage ab 01.04. Code `banking-system.ts:426`: `#creditDrafts(tick, account, credit, month, month, taxYear)`.
- **`overflow.mjs`:** Saldo 2139 −9,98 · 10¹⁵ Cent, `isSafeInteger` false, kein Fehler. Code `ledger-logic.ts:74-90`: `checkPostings` prüft nur Buchungsbeträge.

## Gemeinsame Befundliste

### 7.1c-01 Zeitgewichtete Rendite und Benchmark-Rendite brechen bei kleiner Tagesbasis ein

- **Schwere:** hoch, **Art:** Modellfehler (Festlegung der Kennzahl) mit Testlücke
- **Quelle:** Opus C-01, C-09 (Benchmark-Teil); Fable C-01
- **Befund:**
  - **Mechanismus:** `r_day = V_end / (V_start + CF) − 1` setzt die Lebenshaltung an den Tagesanfang. Kontoführung, Dispo- und Sollzinsen desselben Bank-Laufs sind Rendite. Am ersten Bankarbeitstag treffen sie die kleinste Basis des Monats.
  - **Folge für das Portfolio:** Bei knappen Haushalten und kleinem Startkapital, die zulässig sind und beim Preset „Studium“ nahe liegen, entsteht ein einzelner Tag mit −8 % bis −100 %. Er prägt die Rendite seit Spielbeginn dauerhaft.
  - **Folge für die Benchmark:** Ihr Abfluss verkauft erst zum Schluss, steht aber schon in der Basis. Das hebelt die Indexbewegung.
  - **Spec:** US-PF-05 („Einkommen und Lebenshaltungskosten verfälschen sie nicht“) ist verletzt. Die TS-Tabelle kennt nur den Fall `V_start + CF ≤ 0`.
  - **Bewertung:** Für die betroffenen Spieler ist das ein falsches Ergebnis, das sie sehen. Es ist grundlegend für die Kennzahl, nicht für das Modell: Geld und Buchungen stimmen.
- **Beleg:**
  - **Code:** `portfolio/domain/performance-logic.ts:60-66` (`dailyReturn`), `:161-176` (`closeBenchmarkDay`), `:132-141` (`investAtClose`); `banking/domain/models/household.model.ts:13-22` (Reihenfolge der Schritte im Bank-Lauf).
  - **Eigenes Szenario (Nachgeprüft 2 und 3):** 500 / 2.500 / 1.800 €, nur Bargeld, Seed `mini-2`, ergibt −8,73 % p. a. Die XIRR ist −0,69 % p. a., die Kostenquote −0,70 % p. a. Die Benchmark steht bei +15,13 %, der Index bei −33,77 %.
- **Vorschlag:**
  1. **Portfolio:** Abflüsse am Tagesende ansetzen, `r = (V_end − CF⁻) / (V_start + CF⁺) − 1` (Opus). Das beseitigt den Ausreißer und ändert normale Anleger kaum. Die Schwellenvariante (Fable 3) wirkt ähnlich, braucht aber eine willkürliche Schwelle.
  2. **Benchmark:** alle Flüsse am Tagesende, `(B_end − CF) / B_start`. Ihre Käufe und Verkäufe laufen ohnehin erst zum Schluss, so ist die Benchmark-Rendite genau die Indexrendite, solange das Schattenportfolio investiert ist (gemessen).
  3. **Spec:** In TS §7.9 eine Beispielzeile „kleine Basis“ aufnehmen und erklären, dass Kontokosten als Rendite zählen. Dazu eine Property: Ein Spieler ohne Wertpapiere mit konstanten Gebühren hat keinen Tag unter −x %, und die Benchmark ohne leere Tage entspricht der Indexrendite.
  4. **Engine-Szenario:** der Fall „500 € Startkapital“.
- **Folgen:**
  - Kein Golden Master, keine `SIM_VERSION`, keine Kalibrierung.
  - Gespeicherte `index`-Werte und Tagespunkte behalten die alte Konvention, betroffene Spieler bleiben ohne Eingriff bei −100 %. Deshalb `SCHEMA_VERSION` anheben, mit den übrigen Versionssprüngen von 7.3 gebündelt (E-38), oder die Kette beim Laden aus den Tagespunkten neu rechnen (Nachgeprüft 1).
  - TS §7.9, `performance-logic.spec.ts`, `game-engine-performance.spec.ts`, Glossar und Kontexthilfe anpassen.
  - Aufwand M.
- **Empfehlung:** 7.3 ohne Modelländerung. Es ist ein falsches, sichtbares Ergebnis, die Korrektur ist eine Auswertung außerhalb des Golden Masters. Der PO bestätigt die neue Konvention, denn die alte ist eine Entscheidung vom 13.11.2026.

### 7.1c-02 Rendite bei negativem Vermögen: dauerhaft −100 %, „0 %“ trotz Verlusten, Benchmark lässt andere Tage aus

- **Schwere:** mittel, **Art:** Modellfehler (Festlegung der Kennzahl)
- **Quelle:** Fable C-02; Opus C-01 (Teil −100 %)
- **Befund:**
  - **Dauerhaft −100 %:** Ein Tag mit positiver Basis und `V_end < 0` setzt den Faktor auf 0, die Rendite bleibt für immer bei −100 %. Derselbe Verlust bei Basis ≤ 0 wird ausgelassen, die Regel ist also unstetig.
  - **„0 %“ trotz Verlusten:** Bleibt das Vermögen negativ, werden fast alle Tage ausgelassen. Die Anzeige zeigt dann 0 % wie einen Messwert.
  - **Benchmark:** Sie lässt Tage nach ihrer eigenen Basis aus und zählt sie nicht.
- **Beleg:** `performance-logic.ts:63-69`. Eigenes Szenario: 10 € ohne Einkommen ergibt nach 01.05.2030 dauerhaft −100 %. 0 / 2.000 / 2.000 € ergibt 1.785 ausgelassene Tage in 5 Jahren und 0,00 % bei −1.811,15 €. Die Varianten aus 7.1c-01 lösen das nicht: Auch mit Abflüssen am Tagesende bleibt es bei −100 %.
- **Vorschlag:**
  - Einen Tag mit `V_end < 0` wie einen ausgelassenen Tag behandeln statt als −100 %.
  - Ab einem Anteil ausgelassener Tage (z. B. 50 % des Zeitraums) „–“ mit Hinweis zeigen.
  - Ausgelassene Tage der Benchmark zählen. Portfolio und Benchmark an der Vereinigung beider Auslassungen auslassen.
- **Folgen:** wie 7.1c-01, im selben Teil-AP. Zeile „Mi“ der Tabelle in TS §7.9 prüfen. Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung, mit 7.1c-01: Die Anzeige ist irreführend, die Korrektur berührt nur die Auswertung.

### 7.1c-03 Orders mit Kurswert unter 0,5 Cent ergeben Stücke zum Nulltarif

- **Schwere:** niedrig, **Art:** Modellfehler (Randfall, Lücke in der Prüfung)
- **Quelle:** Opus C-03
- **Befund:**
  - **Mechanismus:** Bei einer Bank ohne Order- und Börsenentgelt kostet ein Kauf mit Kurswert unter 0,5 Cent nichts. Er wird auch bei leerem Verrechnungskonto ausgeführt, je Order entsteht bis zu 0,5 Cent Wert.
  - **Wo es vorkommt:** Kostenlose Neobroker gibt es in etwa 5 % der Standardwelten.
  - **Ausnutzbarkeit:** Ohne Automatisierung keine (20.409 Orders für 100 €). Reale Broker haben eine Mindestordergröße.
- **Beleg:** `trading/domain/order-execution-logic.ts:140-174`; `world/domain/bank-generator.ts:50,159`; `zero_value_order.mjs`, `freebroker.ts` (Nachgeprüft 6).
- **Vorschlag:** Mindest-Kurswert für Einzelorders beim Erteilen und bei der Ausführung, z. B. 1,00 € wie `SAVINGS_PLAN_MIN_AMOUNT`. Dazu ein neuer Fehlercode und eine Tabellenzeile in TS §7.5.
- **Folgen:** Prüfregel der Orders, kein Golden Master, keine `SIM_VERSION`. Mutationstests nachziehen, Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung. Formal entsteht Geld, die Korrektur ist eine Prüfregel ohne Wirkung auf Kurse oder bestehende Buchungen.

### 7.1c-04 Zinsbuchung beim Kontoabschluss nennt nur den Schließmonat als Zeitraum

- **Schwere:** niedrig, **Art:** Implementierungsfehler (Textparameter)
- **Quelle:** Opus C-02
- **Befund:**
  - Beim Abschluss bucht `settlement` die gesamte offene Abgrenzung, beim Quartalstagesgeld bis zu drei Monate.
  - `from`/`to` sind immer der Schließmonat, der Kontoauszug zeigt deshalb einen zu kurzen Zeitraum. Das gilt auch für Dispo- und Sollzinsen.
  - Beträge und Steuer sind richtig.
- **Beleg:** `engine/domain/banking-system.ts:426`, `:449-451`; `close_quarterly.mjs` (+24,11 € für 01.04.–14.05., Text „2030-05“).
- **Vorschlag:** `from` = erster Monat der offenen Abgrenzung. Dazu ein Engine-Szenario „Quartalstagesgeld mitten im Quartal schließen“.
- **Folgen:** nur Textparameter neuer Buchungen. Keine Versionen, Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung: ein reiner Anzeigefehler außerhalb der Simulation.

### 7.1c-05 Kein Schutz gegen Salden jenseits von 2⁵³ Cent; geduldete Überziehung ohne Grenze

- **Schwere:** niedrig, **Art:** fehlende Prüfung, Doku
- **Quelle:** Opus C-04
- **Befund:**
  - `checkPostings` prüft nur die Buchungsbeträge, nicht `balanceAfter`.
  - **Extremprofil:** Einkommen 0 und Lebenshaltung 50.000 €. Hier verlässt der Saldo nach rund 109 Spieljahren still den Bereich exakter Ganzzahlen.
  - **Spec:** TS §7.1 („Beträge … um Größenordnungen darunter“) stimmt nur für übliche Profile.
- **Beleg:** `banking/domain/ledger-logic.ts:42-90`; `overflow.mjs` (2139: −9,98 · 10¹⁵ Cent, kein Fehler).
- **Vorschlag:** `bookTransaction` prüft auch `Number.isSafeInteger(balanceAfter)`, und der Satz in TS §7.1 wird präzisiert. Eine Obergrenze der geduldeten Überziehung (Kündigung, „Insolvenz“) gehört in die spätere Planung des Lebenszyklus.
- **Folgen:** Die Prüfung allein ändert kein Ergebnis. Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung, nur Prüfung und Doku. Die Obergrenze ist eine Modelländerung und kein grundlegender Fehler.

### 7.1c-06 Verkauf mit Kosten über dem Kurswert macht das Verrechnungskonto negativ

- **Schwere:** niedrig, **Art:** Abweichung Doku↔Code (Doku-Lücke)
- **Quelle:** Opus C-05, Fable C-03
- **Befund:** Ein Verkauf, dessen Mindestentgelt den Kurswert übersteigt, belastet das Verrechnungskonto ohne Prüfung und Hinweis. Danach fallen Sollzins und `account-uncovered` an. Das ist realistisch, und TS §7.5 enthält den Fall als Zahl (−11,33 €). TS §7.4 nennt als Weg ins Minus aber nur Bankbelastungen.
- **Beleg:** `order-execution-logic.ts:153-155`; Fable `s5.ts` Abschnitt 5 (−12,07 €).
- **Vorschlag:** In TS §7.4 als gewollt festhalten. Das Order-Ticket warnt, wenn die Gutschrift negativ ist. Keine Ablehnung, weil sich Kleinstbestände sonst nicht verkaufen ließen.
- **Folgen:** Doku und UI-Hinweis, keine Versionen, Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung: Das Verhalten ist richtig, nur Doku und Hinweis fehlen.

### 7.1c-07 Doku-Fehler in TS §7.4: Wochentag und Nummerierung

- **Schwere:** niedrig, **Art:** Doku
- **Quelle:** Fable C-04; Opus C-05 (Nummerierung)
- **Befund:** Die Tabelle „Erster Termin“ nennt „Fr 29.03.2032 06:00“, richtig ist Montag. In der Schrittliste des Bank-Laufs steht „6. … und 7.“ in einem Punkt, der nächste heißt wieder „7.“.
- **Beleg:** TS Zeile 1361 und 1377–1378; Nachgeprüft 4.
- **Vorschlag:** Wochentag korrigieren und die Schritte wie `BANK_RUN_STEPS` durchnummerieren.
- **Folgen:** nur Doku, Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung: reine Doku-Korrektur.

### 7.1c-08 Keine geldgewichtete Rendite

- **Schwere:** Hinweis, **Art:** Verbesserung (Umfang)
- **Quelle:** Opus C-09, Fable C-01 (Vorschlag 1)
- **Befund:** Der Prüfauftrag nennt die geldgewichtete Rendite, TS §7.9 und Code kennen nur die TWR und absolute Größen. Für „was hat mein Geld verdient“ wäre sie bei Haushalten mit großen Flüssen aussagekräftiger. Im eigenen Szenario liegt sie nahe an der Kostenquote: −0,69 % gegen −0,70 % p. a.
- **Vorschlag:** XIRR seit Spielbeginn als dritte Kennzahl, mit Spec-Beispiel und Brute-Force-Orakel im Test. Die TWR bleibt für den Vergleich mit der Benchmark.
- **Folgen:** neue Projektionsfelder, aus den Tagespunkten berechenbar, keine Versionen. Aufwand M.
- **Empfehlung:** PO entscheidet. Mein Vorschlag: nicht in 7.3, sondern als Story für den UI-Overhaul oder später, weil 7.1c-01 den Fehler schon behebt.

### 7.1c-09 Doppelrundung in `roundHalfAwayFromZero` bei sehr großen Beträgen

- **Schwere:** Hinweis, **Art:** Grenze der Rechnung
- **Quelle:** Fable C-05 (Opus: „Artefaktkorrektur fängt den Fehler auf“, widerlegt)
- **Befund:** Die Reduktion auf 15 signifikante Stellen vor dem Runden rundet zweimal. Ab etwa 10⁷ € Kurswert kann ein Wert knapp unter ,5 Cent aufgerundet werden. Der Fehler ist 1 Cent, deterministisch und sehr selten: 3 von 2 Mio. Zufallsfällen, alle über 6 Mio. €.
- **Beleg:** `shared/domain/money-logic.ts:11-17`; Nachgeprüft 5.
- **Vorschlag:** In TS §7.1 als bekannte Grenze nennen. Eine exakte Rechnung von `marketValue` in `BigInt` lohnt erst, wenn sich die Rundung ohnehin ändert.
- **Folgen:** Doku, Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung, nur Doku. Eine Korrektur des Codes ist nicht nötig.

### 7.1c-10 Betragsorder: „größte Stückzahl“ gilt nur bei monotoner Gesamtbelastung

- **Schwere:** Hinweis, **Art:** Abweichung Doku↔Code
- **Quelle:** Opus C-06
- **Befund:** Die Suche verdoppelt, bis eine Stückzahl nicht mehr passt, und halbiert dann. Bei einem Stufenmodell, dessen Gebühr an einer Grenze stärker fällt, als der Kurswert steigt, findet sie ein lokales Maximum. TS §7.5 verspricht „die größte“. Die Standardwelt erzeugt keine solchen Stufen.
- **Beleg:** `order-execution-logic.ts:94-113`.
- **Vorschlag:** TS §7.5 präzisieren oder monotone Gesamtbelastung als Invariante der Konditionen festschreiben.
- **Folgen:** Doku, Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung, nur Doku.

### 7.1c-11 Kein Langzeit-Szenario gegen eine unabhängige Referenz in der Suite

- **Schwere:** Hinweis, **Art:** Testlücke
- **Quelle:** Fable C-06
- **Befund:** Die Engine-Szenarien decken einzelne Monate 2030/2031 ab. Der 29. Februar und mehrere Jahreswechsel kommen in keinem Engine-Lauf vor. Beide Läufe haben Langläufe als eigene Skripte geprüft: Opus 10 Jahre, Fable bis 40 Jahre, ohne Abweichung.
- **Vorschlag:** Ein Szenario über 3–4 Jahre mit Schaltjahr 2032, Referenz aus Tagessalden mit eigener Zins- und Steuerrechnung. Vorlage: Opus `interest10y.ts` oder Fable `s1.ts`.
- **Folgen:** nur Tests, Aufwand S.
- **Empfehlung:** 7.3 ohne Modelländerung: Der Test sichert die Modelländerungen von M8 ab.

### 7.1c-12 Zinsgutschrift am ersten Bankarbeitstag; Dezemberzinsen zählen zum neuen Steuerjahr

- **Schwere:** Hinweis, **Art:** Verbesserung (Realismus)
- **Quelle:** Opus C-07
- **Befund:** Reale Banken schließen zum Perioden-Ende ab, die Dezemberzinsen gehören dann zum alten Jahr. Im Spiel verschieben sich die Zinsen eines Jahres um einen Monat. Das ist intern konsistent, in TS §7.4 dokumentiert und spielerisch kaum spürbar.
- **Vorschlag:** Mit dem Zinsmodell in M8 die Buchung zum Monatsabschluss erwägen. Bis dahin in TS §7.7 als Vereinfachung kennzeichnen.
- **Folgen:** Buchungstermine, Journale und Monatswerte ändern sich, Aufwand M.
- **Empfehlung:** Bei nächster Modelländerung mitnehmen. M8 ändert ohnehin Zinsen und Kalender.

### 7.1c-13 Steuervereinfachungen gegenüber dem deutschen Vorbild

- **Schwere:** Hinweis, **Art:** dokumentierte Vereinfachung (E-11)
- **Quelle:** Opus C-08
- **Befund:** Die Vereinfachungen sind ein einziger Verlusttopf, keine Teilfreistellung und keine Vorabpauschale. Zusammen verschieben sie die Abwägung zwischen Aktie und ETF und zwischen ausschüttend und thesaurierend. Die Mechanik selbst ist richtig, beide Läufe haben sie nachgerechnet.
- **Vorschlag:** Teilfreistellung zuerst, danach Aktien-Verlusttopf.
- **Folgen:** Steuermodell, Aufwand M–L.
- **Empfehlung:** Nicht umsetzen in 7.3. Die Vereinfachung ist bewusst (E-11), Teilfreistellung und Vorabpauschale sind als AP 9.11 geplant. Den Aktien-Verlusttopf dort mit aufnehmen.

## Verworfen

- **Opus, „alle 43 Datumsangaben haben den richtigen Wochentag“:** falsch, siehe 7.1c-07.
- **Opus C-09, Benchmark-Effekt „geschätzt < 0,1 Pp. systematisch“:** Bei üblichen Haushalten sind es ≈ 0,2 Pp. p. a., bei kleinem Vermögen bis +49 Pp. in 5 Jahren. Der Befund geht in 7.1c-01 auf.
- **Opus, Rundung: „Fehler wird von der Artefaktkorrektur aufgefangen“:** gilt für Gleitkommafehler, nicht für die Doppelrundung (7.1c-09).
- **Fable, „Geld entsteht und verschwindet nicht“:** gilt für alle geprüften Läufe, aber nicht allgemein. Mit kostenlosem Broker entsteht Wert in Bruchteilen eines Cents (7.1c-03).
- **Fable C-01, Begründung „die Benchmark trägt keine Kontokosten“:** Das ist gewollt (US-PF-05, E-28) und kein Fehler. Der eigentliche Fehler der Benchmark ist die Hebelung an Flusstagen (7.1c-01).
- **Opus C-03, „`SIM_VERSION` nur, wenn man Orderregeln dazuzählt (E-38)“:** Laut TS §15 und `version.ts` steigt `SIM_VERSION` nur bei einem Golden-Master-Bruch. Orderregeln gehören nicht dazu.
- **Beide Läufe, die TWR-Formel sei „richtig umgesetzt, aber falsch“:** Die Einordnung ist genauer zu fassen. Weil die Lebenshaltung im Bank-Lauf vor den Gebühren gebucht wird, misst auch eine strenge TWR die kleine Basis. Zu ändern ist die Festlegung der Kennzahl, nicht ihre Umsetzung.

## Empfehlung an den Product Owner

- **7.3 Modell:** keine.
- **7.3 ohne Modelländerung:**
  - 7.1c-01 Zeitgewichtete Rendite und Benchmark-Rendite bei kleiner Tagesbasis
  - 7.1c-02 Rendite bei negativem Vermögen
  - 7.1c-03 Mindest-Kurswert für Orders
  - 7.1c-04 Zeitraum der Zinsbuchung beim Kontoabschluss
  - 7.1c-05 Saldoprüfung `balanceAfter` und Doku TS §7.1
  - 7.1c-06 Verkauf mit Kosten über dem Kurswert (Doku, Hinweis im Order-Ticket)
  - 7.1c-07 Doku-Fehler TS §7.4
  - 7.1c-09 Grenze der Rundung in TS §7.1
  - 7.1c-10 Betragsorder in TS §7.5
  - 7.1c-11 Langzeit-Szenario mit Schaltjahr
- **Bei nächster Modelländerung mitnehmen:** 7.1c-12 Zinsgutschrift zum Periodenende (M8).
- **Nicht umsetzen:** 7.1c-13 Steuervereinfachungen (E-11, geplant in AP 9.11).
- **PO entscheidet:** 7.1c-08 geldgewichtete Rendite. Mein Vorschlag: nicht in 7.3.

**Vorschlag für den Schnitt von AP 7.3 (Anteil aus 7.1c):**

- **7.3x „Rendite und Benchmark“ (7.1c-01, 7.1c-02), Aufwand M:**
  - **Vor Beginn zu entscheiden:**
    - die neue Konvention (empfohlen: Abflüsse am Tagesende, Benchmark mit allen Flüssen am Tagesende, `V_end < 0` als ausgelassener Tag),
    - der Umgang mit gespeicherten Spielständen: `SCHEMA_VERSION` gebündelt mit den übrigen Versionssprüngen von 7.3 (empfohlen, vor 1.0 zulässig) oder Neuberechnung aus den Tagespunkten.
  - **Inhalt:** Spec-Tabellen in TS §7.9 mit Zeile „kleine Basis“, Properties, Engine-Szenario, Glossar und Kontexthilfe.
- **7.3y „Kleine Korrekturen Wirtschaftsmodell“ (7.1c-03 bis -07, -09 bis -11), Aufwand S–M:** Mindest-Kurswert, Textparameter beim Abschluss, Saldoprüfung, Hinweis im Order-Ticket, Doku-Korrekturen und Langzeit-Szenario. Dieses Teil-AP lässt sich mit den kleinen Korrekturen aus 7.1a/7.1b zusammenlegen.

## Geprüft ohne Befund

- **Beispieltabellen TS §7.1–§7.9:** Beide Läufe haben sie unabhängig nachgerechnet, Opus mit exakter Python-Referenz, Fable von Hand. Bis auf 7.1c-07 stimmen alle Werte:
  - Rundung,
  - Buchungsbeispiele und Auszüge,
  - Gebühren-, Stufen- und Depotgebührtabellen,
  - Bankenvergleich,
  - Zinsen mit Schaltjahr und Dispo-Stufung,
  - Bank-Lauf-Termine, Kontoführung, Kontoabschluss, Dispo-Rahmen, Ereignisse, Monatswerte und Sparquote,
  - Orders (Prüfung je Tick, Kosten, Betragsorders, Reservierungen, Ändern, Ausführung, Gültigkeit),
  - Lots und FIFO,
  - Steuern (Jahr, Verlustvortrag, Erstattungen, Vorschau),
  - Sparpläne,
  - TWR- und Benchmark-Tabelle, Annualisierung, Depotübersicht, Allokation und Positionsdetail.
- **Zinseszins gegen unabhängige Tagesrechnung:**
  - Opus: 10 Jahre, 119 Gutschriften centgenau.
  - Fable: 12 und 40 Jahre, 1.126 Zinsbuchungen und 1.120 Steuerereignisse ohne Abweichung, zehn Schaltjahre.
- **Doppik:** Jede Transaktion summiert sich zu 0, das Journal ergibt die Salden, und die Summe der Spielerkonten ist gleich der negativen Summe der Gegenkonten. Steuereinbehalte liegen nie über dem Ertrag. Rundungsreste der Zinsabgrenzung verfallen dokumentiert.
- **Handel, Lots, Dividenden, Steuern in Zufallsläufen** (Fable, 6 und 8 Jahre, 1.422 Orders, 152 Ausschüttungen, 205 Steuerbuchungen): 0 Abweichungen.
- **Steuern fachlich:**
  - Verlustverrechnung vor dem Pauschbetrag, Verfall des Pauschbetrags, Vortrag nur negativer Jahresergebnisse,
  - Kosten im Gewinn, FIFO je Depot,
  - Formel 1:1 in `tax-logic.ts`.
- **Tagesreihe und Benchmark** gegen eigene Rechnung: Index, ΣCF, Vergleichsgröße und Wert des Schattenportfolios stimmen centgenau (Fable `s2.ts`, `s3.ts`; eigenes `twr.ts`). Der Fehler liegt nur in der Festlegung (7.1c-01).
- **Betragsorders und Sparplan-Stück** gegen exakte Ganzzahlrechnung (220.000 Fälle): „passt, ein Schritt mehr nicht“.
- **Ungültige und große Eingaben:**
  - `NaN`, `Infinity`, Bruchteile und 2⁵³ werden abgelehnt,
  - `lotCostShare` rechnet exakt in `BigInt`,
  - `periodReturns` liefert `null` statt `NaN`,
  - Startkapital 0 führt nicht zur Division durch 0.
- **Dispo in Gegenrichtung:** Haben- und Sollzinsen werden getrennt geführt. Eine Arbitrage von Dispo zu Tagesgeld lohnt nicht.
- **Entscheidungen** E-09, E-11, E-17, E-19 und E-21 sind umgesetzt wie in TS §16 beschrieben.
- **Realismus der Konditionen** für deutsche Filial- und Direktbanken: Dispo, Gebührenbefreiung, Depotgebühr, Orderentgelt.
- **Bestehende Tests:** Opus 47 Dateien und 1.159 Tests, Fable 65 Dateien und 1.440 Tests, alle grün. Die Specs tragen Tabellenwerte der TS als Orakel.
