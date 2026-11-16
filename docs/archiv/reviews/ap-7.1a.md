# AP 7.1a – Modellreview: Determinismus und Welt: Gegenüberstellung und gemeinsame Befundliste

> Geprüfter Stand: `c1e2514` · Läufe: Opus 5.5 (`effort: high`), Fable 5.2 (`effort: medium`) · Gegenüberstellung: 15.11.2026
> Rohberichte: [Lauf Opus](./ap-7.1a/lauf-opus.md) · [Lauf Fable](./ap-7.1a/lauf-fable.md)

## Ergebnis

Das Determinismus-Fundament ist korrekt. Beide Läufe haben `detExp`/`detLog`, MurmurHash3, `sfc32`, die Stromableitung und die Verteilungen unabhängig voneinander nachgemessen und nichts gefunden; die Stichproben habe ich bestätigt. Es gibt **keinen grundlegenden Modellfehler** im Sinne der Schwelle: kein falsches Ergebnis, keinen Determinismusbruch, kein ausnutzbares Verhalten. Der wichtigste Befund ist der Namensgenerator. Er erzeugt Namen realer börsennotierter Unternehmen und Wörter wie „Isis“ und „Koran“; jeder dieser Kerne steht in rund 27 % aller Welten. Das ist kein Modellfehler, sondern ein Rechts- und Rufrisiko (R8, E-26). Ich habe eine Korrektur gefunden, die Kurse und Modellparameter aller Seeds unverändert lässt; formal ändert sie trotzdem die Welt-Prüfsumme, deshalb entscheidet der PO. Alle übrigen Befunde sind niedrig oder Hinweise: sechs lassen sich ohne Modelländerung beheben (Tests, Lint, Worker-Code, Doku), vier gehören zur nächsten Modelländerung.

## Gegenüberstellung

| Thema                                                     | Lauf Opus              | Lauf Fable           | Verhältnis                            | Ergebnis der Abwägung                                                                       |
| --------------------------------------------------------- | ---------------------- | -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Reale Firmennamen und heikle Wörter aus den Kernen        | A-01, mittel           | A-01, mittel         | übereinstimmend (Häufigkeit strittig) | bestätigt; „Isis“ in 27 % der Welten, nicht 51 % (Opus); ohne Kursänderung lösbar → 7.1a-01 |
| Golden Master über einen Seed sieht seltene Pfade nicht   | A-02, mittel           | –                    | nur Opus                              | bestätigt; `golden-1` hat keinen der Randfälle → 7.1a-02                                    |
| Sektorgrößen binomial, Sektor kann leer sein              | A-04, niedrig          | A-02, mittel         | Widerspruch in der Schwere            | Befund bestätigt, niedrig: selten, ohne Fehlerfolge, nicht ausnutzbar → 7.1a-03             |
| Eigenschaftstest „22 Indizes für jeden Seed“              | A-04 (Nebensatz)       | A-02 (Nebensatz)     | übereinstimmend                       | eigener Befund: Test kann zufällig scheitern → 7.1a-04                                      |
| `Math.log` aus `analysis/domain` im Worker                | A-05 (Teil 2), niedrig | A-03, niedrig        | übereinstimmend                       | bestätigt → 7.1a-05                                                                         |
| Lücken der ESLint-Regel                                   | A-05 (Teil 1), niedrig | A-04, niedrig        | übereinstimmend                       | bestätigt per Probe → 7.1a-06                                                               |
| `detExp` in V8 nicht von `Math.exp` unterscheidbar        | A-07, Hinweis          | A-05, niedrig        | übereinstimmend                       | bestätigt, niedrig; Fables Vorschlag (Falle) ist der stärkere → 7.1a-07                     |
| Seed-Normalisierung hängt von Unicode-Version ab          | A-08, Hinweis          | A-06, niedrig        | übereinstimmend                       | bestätigt, niedrig; Fable ergänzt die Neuableitung beim Laden → 7.1a-08                     |
| Punktmasse der Dividendenrendite bei 6,5 %                | A-09 (Teil), Hinweis   | A-07, niedrig        | übereinstimmend                       | bestätigt, 7,6 % der Zahler → 7.1a-09                                                       |
| Nichtzahler mit `startDay` 0                              | A-03, niedrig          | –                    | nur Opus                              | bestätigt, 0,34 % der Nichtzahler → 7.1a-10                                                 |
| Spielerzustand nicht browserübergreifend geprüft          | –                      | A-08, niedrig        | nur Fable                             | bestätigt → 7.1a-11                                                                         |
| Größenverteilung: „viele kleine“ trifft nicht zu          | A-09 (Teil), Hinweis   | A-09, Hinweis        | übereinstimmend                       | bestätigt → 7.1a-12                                                                         |
| Poisson-Inversion im Grenzfall                            | A-06, Hinweis          | A-10 (Teil), Hinweis | übereinstimmend                       | bestätigt; Detail „λ = 30 → 429“ (Fable) stimmt nicht genau → 7.1a-13                       |
| TS §4.2 „Dutzende“ Kollisionen; `uniform`, `sqrt`, `JSON` | A-09 (Teil), Hinweis   | A-10 (Teil), Hinweis | übereinstimmend bzw. nur Fable        | Doku-Präzisierungen → 7.1a-14                                                               |

## Nachgeprüft

Alle Skripte und Ausgaben liegen in `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1a-synthese/` (im Folgenden `S/`).

**Namen: Häufigkeit (Widerspruch Opus 51 % gegen Fable 26 %).** `S/m1.ts` erzeugt 2.000 Welten (`syn-1` … `syn-2000`) und prüft je Welt, ob ein Kern in einem Unternehmens-, Bank-, Emittenten- oder Indexnamen vorkommt. Eine Welt verbraucht im Mittel 217 der 831 freien Kerne, also steht jeder Kern in rund 26 % der Welten. Gemessen: „Isis“ 27,0 %, „Koran“ 25,8 %, „Orix“ 26,8 %, „Valora“ 27,3 %; alle 30 geprüften Kerne zwischen 23,8 und 27,9 %. 1.999 von 2.000 Welten enthalten mindestens einen der 25 realen Namen (im Mittel 6,5), 79 % mindestens eines der Wörter Isis, Koran, Coran, Elon, Xanex. Alle 30 Kerne sind erzeugbar und nicht gesperrt. Folgerung: Fable hat recht. Opus' „102 von 200 Welten“ zählt Namen statt Welten, auch ETF-Namen, die den Kern eines Emittenten wiederholen. Am Befund ändert das nichts.

**Namen: Lösbarkeit ohne Modelländerung.** Ich habe zwei Korrekturen in einer Kopie von `name-logic.ts` gebaut (`S/name-logic-patched.ts`, per esbuild-Plugin statt des Originals eingebunden, `S/build.mjs`, `S/v.ts`) und mit dem Stand verglichen: Golden Master von `golden-1` und 300 Welten.

| Variante                                                                                                                     | Golden Master `golden-1`          | 300 Welten                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1: 30 Kerne in die Blockliste (verwerfen, neu ziehen)                                                                       | alle sechs Prüfsummen ändern sich | 0 von 300 Welten gleich, auch ohne Namen und Ticker                                                                                                            |
| V2: feste Ersatztabelle, Prüfung von Dublette und Blockliste auf dem gezogenen Namen, Ersatz erst danach, keine Ziehung mehr | nur `world` ändert sich           | 300 von 300 Welten ohne Namen und Ticker bitgleich: Parameter, IDs, ISINs, Kurse gleich; 2.123 Unternehmen umbenannt, 37 Ticker unveränderter Namen verschoben |

Eine erste Fassung von V2 prüfte die Blockliste auf dem Ersatznamen. Dann verschob sich in einer von 300 Welten (`syn-155`) der Bankstrom: „Norisbank“ ist gesperrt, der Ersatzname nicht, also entfiel eine Neuziehung. Die Prüfung muss deshalb auf dem gezogenen Namen laufen. Ein Restrisiko bleibt: Findet ein Ersatzname keinen freien Ticker-Kandidaten, zieht `nextTicker` aus dem Strom (`identifier-logic.ts:107–118`). Das kam in 400.000 Unternehmen nie vor. Eine reine Anzeige-Lösung (Umbenennen in Projektionen oder UI) habe ich verworfen: Die echten Namen blieben in Welt, Labor, Suche und Tickern.

Folgerung: V2 ändert nur Namen und Ticker. Kalibrierung und Kurse bleiben unberührt, gespeicherte Spieler blieben rechnerisch gültig. Weil sich die Prüfsumme `world` ändert, verlangt TS §15 trotzdem eine neue `SIM_VERSION`.

**Sektorgrößen (Widerspruch in der Schwere).** In `S/m1.ts` über 2.000 Welten: kleinster Sektor 1 Wert in 3 Welten, 2 in 13, 3 in 36 (zusammen 2,6 %), 4 in 91. Keine Welt mit leerem Sektor; erwartet 0,2 bei rund 1,2·10⁻⁴ je Welt. Das passt zu Binomial(200; 4/90) für Immobilien, `P(0)` = 1,1·10⁻⁴, und zu den Messungen der Läufe: Opus 3 in 18.489, Fable 3 in 30.000. Ein leerer Sektor führt zu keinem Fehler: `index-generator.ts:56` überspringt ihn, `etf-generator.ts:75` überspringt den ETF, und Fable hat `computeGoldenChecksums` für `empty-13280` fehlerfrei laufen lassen. Folgerung: selten, ohne Fehlerfolge, nicht ausnutzbar. Ein Spieler sieht höchstens einen Immobilien- oder Versorgerindex mit 2–3 gleich gewichteten Werten. Das ist niedrig, nicht mittel.

**Golden Master über einen Seed (nur Opus, mittel).** `golden-1` hat keinen Nichtzahler mit `startDay` 0, keine Ticker-Ersatzziehung und als kleinsten Sektor Versorger mit 9 Werten. Über 2.000 Welten gibt es 355 solche Nichtzahler in 330 Welten (16,5 %) und keine Ersatzziehung. Eine Korrektur wie `max(1, …)` in `drawStartDay` ließe den Golden Master also unverändert, obwohl sie jede sechste Welt ändert. Folgerung: bestätigt. Eine Welt kostet rund 4,5 ms (2.000 Welten in 9 s), 200 Seeds also rund 1 s.

**Eigenschaftstest „22 Indizes“.** `world-generator.spec.ts:248–259` prüft mit `forAnyWorld` (8 Läufe, `NUM_RUNS`, Zeile 27), dass es für jeden Seed 11 Sektorindizes gibt. Lokal zieht fast-check jedes Mal neue Seeds, in CI je Commit (`src/testing/fast-check-setup.ts`). Folgerung: Der Test scheitert mit rund 8 · 1,2·10⁻⁴ ≈ 0,1 % je Lauf zufällig, obwohl der Code korrekt arbeitet.

**Nichtzahler mit `startDay` 0 (nur Opus).** Rechnung: Mit der Epoche 01.04.2030 ist `months` = 3 + ⌊−25 · 12 · ln(1 − U)⌋ (`dividend-schedule-generator.ts:49–50`). Ist der zweite Summand 0, mit Wahrscheinlichkeit 1 − e^(−1/300) = 0,333 %, fällt der Beginn auf den 01.04.2030, also Tag 0. Gemessen 355 von 103.704 Nichtzahlern (0,342 %). `market-context.ts:207–208` setzt dann `dividendStartYears` = 0, und `startDrag` nutzt `lifecycle.initialYield` (Zeile 210–215): Das Unternehmen schüttet ab dem ersten Ex-Tag aus, obwohl die Welt Rendite 0 führt. Folgerung: bestätigt. Geld entsteht dabei nicht falsch, weil der Kursabschlag (`dividendDrag`) dazu passt.

**Spielerzustand (nur Fable).** `golden-master.ts:30–37` und `:121–128`: Die sechs Prüfsummen sind Welt, Kurse, Minuten, Indizes, ETFs und Marktzustand. `e2e/determinism.e2e.ts` ist der einzige Systemtest mit Prüfsummen. Folgerung: bestätigt.

**Seed-Normalisierung.** Node 22.22 (Unicode 17): `'Ꟛ'.toLowerCase()` ergibt U+A7DB, ebenso U+A7CB → U+0264, U+1C89 → U+1C8A, U+10D50 → U+10D70 (Paare aus Unicode 16). Die Engine leitet den Schlüssel beim Laden neu aus dem Seed ab (`engine-host.ts:319–321`). Das Profil speichert `seedKey` (`player-logic.ts:129`), aber nichts liest es. Das Formular „Spieler anlegen“ beschränkt die Zeichen nicht (`new-player-schema.ts`). Folgerung: Fables Ergänzung stimmt.

**ESLint-Lücken.** Probe per `eslint --stdin --stdin-filename src/app/market/domain/zz-synthese-probe.ts` (`S/probe.ts`, nichts im Repo angelegt): Gemeldet wird nur `Math.exp`. `y **= 2`, `Math.asinh`, `const m = Math; m.exp(x)` und `Date.parse` bleiben ohne Meldung. `market/domain/instrument-figures-logic.ts:1` importiert `logReturns` aus `analysis/domain/statistics-logic.ts`, das in Zeile 38 `Math.log` nutzt; `engine/domain/instrument-figures.ts:109–112` ruft es im Worker auf. Folgerung: bestätigt.

**`detExp`/`detLog` gegen V8 und Poisson.** `S/dm.ts`: 2 Mio. `exp`- und 2 Mio. `log`-Stichproben, alle bitgleich mit `Math.exp`/`Math.log`. Poisson mit dem größten möglichen `u` = 1 − 2⁻⁵³: Bei λ = 3/252 bleibt die Summe bei genau 1 − 2⁻⁵³ stehen und die Schleife liefert k = 94, bei λ = 0,02 k = 99. Bei λ = 1 und λ = 30 erreicht die Summe 1, dort enden die Schleifen bei 18 bzw. 83. Die 429 aus Fables Bericht gelten also nicht für λ = 30 selbst, sondern für andere λ ≤ 30 (Opus). Am Hinweis ändert das nichts.

**Dividendenrendite.** In `S/m1.ts` haben 22.497 von 296.296 Zahlern (7,6 %) genau 0,065, also 11,2 je Welt. Beide Läufe sehen dasselbe: Opus 5,5 % aller Unternehmen, Fable 7,6 % der Zahler.

## Gemeinsame Befundliste

### 7.1a-01 Namensgenerator erzeugt reale Firmennamen und heikle Wörter

- **Schwere:** mittel · **Art:** Daten des Namensgenerators, Rechts- und Rufrisiko (R8)
- **Quelle:** Opus A-01, Fable A-01
- **Befund:** Die 42 × 20 Silben (`names/name-parts.ts`) ergeben 840 Kerne, die Blockliste (`names/name-blocklist.ts`, rund 370 Großnamen) sperrt davon neun. Frei erzeugbar sind unter anderem Orix, Orora, Orion, Valora, Elia, Marex, Calix, Helix, Helia, Talen, Torex, Navan, Arion, Noris, Astex, Cyren, Selex, Lumia und Lumix, außerdem „Isis“ (`Is` + `is`), „Koran“ (`Kor` + `an`), „Coran“ und „Elon“. TS §5.4 verspricht: „Eine Blockliste verhindert reale Marken und Unternehmensnamen“. Der Test `world-generator.spec.ts:128` nimmt die Blockliste selbst als Orakel und kann fehlende Einträge deshalb nicht finden.
- **Beleg:**
  - Jeder dieser Kerne steht in rund 27 % der Welten, 1.999 von 2.000 Welten enthalten mindestens einen realen Namen (`S/m1.ts`).
  - In `golden-1` stehen „Orix Shipping Holdings Ltd“, „Orora Micro Inc.“, „Orion Cosmetics Inc.“, „Calix K.K.“, „Arion plc“, „Lumia Hotels K.K.“ und „Cyren Inc.“.
  - Die Liste realer Namen beruht auf der Kenntnis beider Läufe, nicht auf einem Registerabgleich. Sie ist eine Untergrenze.
- **Vorschlag:**
  - Die 831 freien Kerne einmal vollständig gegen Verzeichnisse börsennotierter Unternehmen, bekannte Marken und eine Liste heikler Wörter prüfen. Danach die zulässigen Kerne als Snapshot-Test einfrieren, damit eine neue Silbe eine Durchsicht erzwingt.
  - Umsetzung nach Variante V2 (siehe „Nachgeprüft“): Eine feste Ersatztabelle bildet jeden Treffer auf einen Kern ab, den der Generator nicht ziehen kann. Dublette und Blockliste werden auf dem gezogenen Namen geprüft, ersetzt wird erst danach, ohne weitere Ziehung.
  - Ticker neu gefundener Treffer mitprüfen.
- **Folgen:**
  - V2: Nur Namen und Ticker ändern sich, Kurse, Modellparameter und Kalibrierung nicht. Die Prüfsumme `world` bricht, nach TS §15 also neue `SIM_VERSION`. Aufwand M (die Durchsicht ist der Hauptteil).
  - V1 (Blockliste mit Neuziehung): Alle Welten und alle sechs Prüfsummen ändern sich, dazu ein Kontrolllauf der Kalibrierung. Aufwand S–M.
- **Empfehlung:** **PO entscheidet.** Kein Modellfehler im Sinne der Schwelle, aber ein Rechts- und Rufrisiko einer öffentlich erreichbaren App (E-26), das der PO trägt. Meine Empfehlung: in AP 7.3 mit Variante V2 korrigieren und `SIM_VERSION` 2 setzen. Vor 1.0 kostet der Versionssprung nur die gesperrten Spielstände der Tester, und bis M8 vergehen noch der ganze UI-Overhaul und damit Wochen. Wer mit `SIM_VERSION` 2 ohnehin alle Welten ändern will, nimmt V1 und dazu 7.1a-03, -09, -10 und -13 mit.

### 7.1a-02 Golden Master über einen Seed bemerkt Weltänderungen auf seltenen Pfaden nicht

- **Schwere:** mittel · **Art:** Testlücke
- **Quelle:** Opus A-02
- **Befund:** Die Regel „Golden Master bricht → neue `SIM_VERSION`“ (TS §4.6, §15) stützt sich auf den einzigen Seed `golden-1` (`golden-master.ts:28`). Dort fehlen Nichtzahler mit `startDay` 0, Ticker-Ersatzziehungen und kleine Sektoren. Eine Korrektur dieser Pfade änderte die Welt vieler Seeds, ohne dass eine Prüfsumme anschlägt. Bestehende Spieler liefen dann still mit einer anderen Welt weiter (§5.1: Die Welt wird bei jedem Laden neu erzeugt). Genau solche Korrekturen stehen mit 7.1a-03 und -10 an.
- **Beleg:** `golden-1` ohne einen dieser Fälle; über 2.000 Welten 355 Nichtzahler mit `startDay` 0 in 16,5 % der Welten (`S/m1.ts`).
- **Vorschlag:** Eine siebte Prüfsumme `worlds` über die `worldChecksum` von z. B. 200 Seeds (rund 1 s), im Selbsttest des Workers weniger Seeds. Optional eine Prüfsumme über Ziehungen der Verteilungen aus festen Strömen.
- **Folgen:** nur Test und Selbsttest, mit dem heutigen Stand eingefroren; kein Golden-Master-Bruch. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung**, als erster Teil vor jeder Modellkorrektur, damit deren Wirkung messbar wird.

### 7.1a-03 Sektorgrößen schwanken stark, ein Sektor kann leer sein

- **Schwere:** niedrig · **Art:** Modell (Realismus)
- **Quelle:** Opus A-04 (niedrig), Fable A-02 (mittel)
- **Befund:** Länder werden nach dem Größtrestverfahren fest zugeteilt, Branchen dagegen je Unternehmen unabhängig gezogen (`company-generator.ts:129`). Kleine Sektoren haben deshalb in 2,6 % der Welten nur 1–3 Werte; die Kappung von 25 % ist dann unerfüllbar, und der Index gewichtet gleich. In rund 1,2·10⁻⁴ der Welten ist ein Sektor leer; die Welt hat dann 21 statt 22 Indizes (TS §5.2, §5.5), und die Index-IDs danach verschieben sich.
- **Beleg:** siehe „Nachgeprüft“; `index-generator.ts:56` überspringt leere Indizes, der Markt verkraftet es.
- **Vorschlag:** Sektor- oder Branchenanzahlen wie die Länder per Größtrestverfahren zuteilen und mischen, oder je Sektor mindestens 5 Werte garantieren.
- **Folgen:** Alle Welten ändern sich: Golden Master, neue `SIM_VERSION`, Kalibrierung neu laufen lassen (Sektorfaktoren, Korrelationen, Risikoklassen). Aufwand S–M.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen.** Echte Verbesserung, aber kein falsches Ergebnis und nicht ausnutzbar; allein rechtfertigt sie keinen Versionssprung.

### 7.1a-04 Eigenschaftstest „22 Indizes“ scheitert gelegentlich zufällig

- **Schwere:** niedrig · **Art:** Testlücke, Abweichung Doku↔Code
- **Quelle:** Opus A-04, Fable A-02 (je als Nebensatz)
- **Befund:** `world-generator.spec.ts:248–259` verlangt für beliebige Seeds 11 Sektorindizes, TS §5.2 nennt fest 22 Indizes. Wegen 7.1a-03 scheitert der Test mit rund 0,1 % je Lauf, lokal wie in CI, ohne Fehler im Code.
- **Beleg:** 8 Läufe je Test (`NUM_RUNS`), neue fast-check-Seeds je Lauf bzw. Commit (`src/testing/fast-check-setup.ts`); Wahrscheinlichkeit siehe „Nachgeprüft“.
- **Vorschlag:** Den Test auf das tatsächliche Verhalten umstellen: je nicht leerem Sektor ein Index. Dazu eine Beispieltabelle mit einem bekannten Seed mit leerem Sektor (`probe-15893` aus Lauf Opus oder `empty-13280` aus Lauf Fable). TS §5.2 und §5.5 um den Sonderfall ergänzen. Mit 7.1a-03 entfällt die Ausnahme wieder.
- **Folgen:** nur Test und Doku. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.**

### 7.1a-05 `Math.log` gelangt über `analysis/domain` in den Engine-Worker

- **Schwere:** niedrig · **Art:** Abweichung Doku↔Code
- **Quelle:** Opus A-05, Fable A-03
- **Befund:** `market/domain/instrument-figures-logic.ts:1` importiert `logReturns`, `annualizedVolatility` und `beta` aus `analysis/domain/statistics-logic.ts`, das nicht unter die Determinismus-Regel fällt und in Zeile 38 `Math.log` nutzt (`Math.pow` in Zeile 53 und 105). Der Worker rechnet damit Volatilität und Beta der Instrumentseite (`engine/domain/instrument-figures.ts:109–112`). Betroffen sind nur Anzeigewerte, nicht der Zustand; der Code widerspricht aber TS §4.4.
- **Beleg:** Import und Aufrufkette gelesen; Fable hat den Worker gebündelt, und `statistics-logic.ts` ist dort die einzige Quelle nicht exakter `Math`-Funktionen.
- **Vorschlag:** `logReturns` auf `detLog` umstellen und `analysis/domain` in die Regel aufnehmen (die übrigen `Math.pow` auf `detExp`/`detLog` oder Ausnahme nur für das Labor).
- **Folgen:** kein Golden Master, keine `SIM_VERSION`; Anzeigewerte ändern sich höchstens im letzten Bit. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.**

### 7.1a-06 Lücken in der ESLint-Regel für Simulationscode

- **Schwere:** niedrig · **Art:** Verbesserung
- **Quelle:** Opus A-05, Fable A-04
- **Befund:** `eslint.config.js:127–187` erkennt die direkten Schreibweisen. Ohne Meldung bleiben `x **= y`, `Math.asinh`/`acosh`/`atanh`, Aliase (`const m = Math`, `globalThis.Math`), `globalThis.crypto`, `Date()` ohne `new`, `Date.parse` sowie `localeCompare`, `toLocale*` und `Intl`. Ordner, die der Worker einbindet, fallen teils nicht unter die Regel: `analysis/domain` (7.1a-05), `notifications/domain`, `players/domain`, `shared/util`, `persistence/util` und `engine/data-access/worker`. Heute verletzt außer 7.1a-05 kein Code die Regel; `localeCompare` dient nur Sortierungen von Abfragen (`screener-logic.ts:12`, `bank-comparison-logic.ts:103`, `position-overview-logic.ts:91`).
- **Beleg:** Probe per `eslint --stdin` in beiden Läufen und in `S/probe.ts`: Nur `Math.exp` wird gemeldet.
- **Vorschlag:** Selektoren für `**=`, die drei `Math`-Funktionen, `Date`-Aufrufe und `crypto` ergänzen. Die Regel auf alle Ordner ausdehnen, die der Worker einbindet, oder Importe aus ungeprüften Ordnern in Simulationscode verbieten. Für `localeCompare`/`Intl` eine Regel mit begründeten Ausnahmen.
- **Folgen:** keine für Golden Master und Spielstände. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.** Weil V8 `detExp` und `Math.exp` nicht unterscheiden kann (7.1a-07), ist die Regel der eigentliche Schutz.

### 7.1a-07 Tests können `detExp`/`detLog` in V8 nicht von `Math.exp`/`Math.log` unterscheiden

- **Schwere:** niedrig · **Art:** Testlücke
- **Quelle:** Opus A-07 (Hinweis), Fable A-05 (niedrig)
- **Befund:** V8 rechnet `Math.exp`/`Math.log` mit derselben fdlibm-Routine; die Ergebnisse sind bitgleich. Ersetzt jemand in Simulationscode `detExp` durch `Math.exp`, bleiben Logik-Tests, Golden Master und der Selbsttest in Chromium grün. Der Kommentar `det-math.spec.ts:81` nennt `Math.exp` ein „unabhängiges Orakel“; das ist er nicht. Ein unabhängiges, hochgenaues Orakel fehlt. Die Genauigkeit selbst stimmt: Beide Läufe haben gegen Python `decimal` mit 60 Stellen höchstens 0,85 ulp gemessen.
- **Beleg:** `S/dm.ts`: 4 Mio. Stichproben ohne Abweichung; Opus 310.000, Fable 13 Mio.
- **Vorschlag:** Während `computeGoldenChecksums` im Test und im Selbsttest die nicht exakten `Math`-Funktionen durch werfende Funktionen ersetzen; das findet jeden Aufruf auf den geprüften Pfaden in jeder Engine. Dazu eine eingefrorene Tabelle mit einigen hundert Eingaben und erwarteten Bitmustern, deren Fehler unter 1 ulp mit hoher Stellenzahl belegt ist. Den Kommentar korrigieren.
- **Folgen:** nur Tests. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.**

### 7.1a-08 Seed-Normalisierung hängt von der Unicode-Version des Browsers ab

- **Schwere:** niedrig · **Art:** Determinismus im Randfall
- **Quelle:** Opus A-08 (Hinweis), Fable A-06 (niedrig)
- **Befund:** `normalizeSeed` (`seed.ts:7–9`) nutzt `trim()` und `toLowerCase()`, die den Unicode-Tabellen der Engine folgen. Ein Seed mit neu kodierten Groß- und Kleinbuchstaben ergibt in Browsern mit Unicode 15 (Mindestbrowser NF-08) einen anderen Schlüssel als mit Unicode 16 oder 17. Weil die Engine den Schlüssel beim Laden neu ableitet (`engine-host.ts:319–321`) und das gespeicherte `seedKey` nicht liest, bekäme so ein Spielstand nach einem Browser-Update eine andere Welt. Das Formular beschränkt die Zeichen nicht. Seeds aus ASCII, Umlauten und üblichen Schriften sind nicht betroffen.
- **Beleg:** siehe „Nachgeprüft“ (Node 22.22, Unicode 17); in einem alten Browser nicht gemessen.
- **Vorschlag:** Beim Laden das gespeicherte `seedKey` des Profils verwenden. Für neue Spieler den Zeichensatz des Seeds festlegen (z. B. Buchstaben, Ziffern, Bindestrich, Umlaute) oder die Grenze in TS §4.1 und NF-05 dokumentieren.
- **Folgen:** Für alle heutigen Seeds ändert sich nichts, kein Golden-Master-Bruch. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.**

### 7.1a-09 Dividendenrenditen häufen sich an der Obergrenze von 6,5 %

- **Schwere:** niedrig · **Art:** Modell (Realismus)
- **Quelle:** Opus A-09 (Teil), Fable A-07
- **Befund:** `company-generator.ts:151–162` kappt `Gleichverteilung × Stilfaktor` hart bei `maxDividendYield` 0,065. 7,6 % der Zahler, rund 11 je Welt, haben genau 6,50 %. Im Screener stehen sie gleichauf, im Dividendenindex stellen sie gut ein Drittel, und ihre Reihenfolge entscheidet die ID.
- **Beleg:** `S/m1.ts`, 2.000 Welten; beide Läufe gleich.
- **Vorschlag:** Neu ziehen oder weich begrenzen statt hart kappen, oder den Stilfaktor auf die Spanne anwenden.
- **Folgen:** Golden Master, neue `SIM_VERSION`; Kalibrierungsziel „Dividendenrendite des Weltindex 2–3 %“ prüfen. Aufwand S.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen.**

### 7.1a-10 Nichtzahler mit `startDay` 0 zahlen ab der Epoche

- **Schwere:** niedrig · **Art:** Abweichung Doku↔Code
- **Quelle:** Opus A-03
- **Befund:** TS §5.4 sagt, Nichtzahler beginnen „am Ersten eines späteren Monats“. Mit 0,33 % ist `startDay` aber 0 (`dividend-schedule-generator.ts:49–50`). Der Markt lässt das Unternehmen dann ab dem ersten Ex-Tag mit `initialYield` ausschütten (`market-context.ts:207–215`), die Welt führt es mit Rendite 0 und nicht im Dividendenindex. Der Test `world-generator.spec.ts:239` erlaubt `startDay >= 0` und widerspricht damit der TS.
- **Beleg:** Rechnung und Messung siehe „Nachgeprüft“ (0,342 % gemessen, 0,333 % erwartet).
- **Vorschlag:** `months = 1 + ⌊…⌋` (Kalibrierungstest: Mittel + 1/24 Jahr) oder `max(1, …)`; Test für Nichtzahler auf `startDay > 0` schärfen.
- **Folgen:** neue `SIM_VERSION`. Mit `max(1, …)` bliebe der heutige Golden Master gleich; das zeigt 7.1a-02. Aufwand S.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen.** Kein falsches Geld, nur ein früherer Beginn in seltenen Fällen.

### 7.1a-11 Browserübergreifende Prüfung deckt den Spielerzustand nicht ab

- **Schwere:** niedrig · **Art:** Testlücke
- **Quelle:** Fable A-08
- **Befund:** TS §4.4 verlangt, dass auch der Spielerzustand in jeder Engine gleich gerechnet wird. Golden Master und Selbsttest umfassen nur Welt und Markt, kein Engine-Szenario mit Orders, Zinsen, Steuern und Performance.
- **Beleg:** `golden-master.ts:30–37`, `:121–128`; `e2e/determinism.e2e.ts` ist der einzige Systemtest mit Prüfsummen.
- **Vorschlag:** Eine Prüfsumme über den Spielerzustand nach einem festen Kommandoskript (einige Monate mit Orders, Sparplan, Zinsabschluss, Steuer) in Selbsttest und Systemtest.
- **Folgen:** nur Tests; diese Prüfsumme bricht künftig bei jeder Änderung des Wirtschaftsmodells (gewollt, Regel in TS §15 ergänzen). Aufwand M.
- **Empfehlung:** **7.3 ohne Modelländerung**, abgestimmt mit den Ergebnissen von AP 7.1c.

### 7.1a-12 Größenverteilung: Mid Caps dominieren, Obergrenze ohne Wirkung

- **Schwere:** Hinweis · **Art:** Abweichung Doku↔Code
- **Quelle:** Opus A-09 (Teil), Fable A-09
- **Befund:** Die Lognormalverteilung (Median 4 Mrd. €, σ = 1) ergibt 18 % Large, 58 % Mid und 24 % Small Caps; „viele kleine“ (TS §5.4) trifft nicht zu. Die Obergrenze von 1,5 Bio. € liegt bei 5,9 σ und wird praktisch nie erreicht. Die Konzentration ist realistisch (Top 10 rund 25 %).
- **Beleg:** beide Läufe übereinstimmend (Opus 200, Fable 500 Welten) und gleich der Theorie Φ(−0,693) = 24,4 %, 1 − Φ(0,916) = 18,0 %.
- **Vorschlag:** TS §5.4 an die Verteilung anpassen; `max` als reine Sicherung kennzeichnen. Ob mehr Small oder Mega Caps gewollt sind, gehört zur Kalibrierung (AP 7.1b).
- **Folgen:** Doku ohne Folgen. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung** (Doku); eine Änderung der Verteilung wäre eine PO-Frage in AP 7.1b.

### 7.1a-13 Poisson-Inversion liefert im Grenzfall bis zu rund 430 Sprünge

- **Schwere:** Hinweis · **Art:** Implementierungsfehler im Randfall
- **Quelle:** Opus A-06, Fable A-10
- **Befund:** In `distributions.ts:66–72` bleibt die gerundete Summe für viele λ unter oder genau bei 1 − 2⁻⁵³. Fällt `u` dorthin, läuft die Schleife, bis `p` auf 0 fällt, z. B. k = 94 bei λ = 3/252. Wahrscheinlichkeit 2⁻⁵³ je Ziehung; praktisch nie.
- **Beleg:** `S/dm.ts`, `poislim.ts` von Opus.
- **Vorschlag:** Schleife beenden, sobald `cumulative` nicht mehr wächst.
- **Folgen:** formal eine Modelländerung, praktisch kein Seed betroffen. Aufwand S.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen.**

### 7.1a-14 Kleinere Präzisierungen in TS §4.2 und §4.4

- **Schwere:** Hinweis · **Art:** Doku
- **Quelle:** Opus A-09 (Teil), Fable A-10
- **Befund:**
  - TS §4.2: Bei 32 Bit gäbe es je Spieljahrzehnt nicht „Dutzende“, sondern Hunderte identische Ströme. Die Läufe rechnen mit 2,4 bzw. 2,7 Mio. Strömen und kommen auf 670 bzw. 850 Paare.
  - `uniform` trifft bei winziger Spanne relativ zu `min` den Wert `max`; der Kommentar sagt das, kein Aufrufer ist betroffen.
  - ECMA-262 lässt `Math.sqrt` und die letzte Ziffer von `Number::toString` (und damit `worldChecksum`) formal offen. Alle Engines rechnen gleich, der Selbsttest deckt es ab. Den Standardtext habe ich dazu nicht nachgelesen.
- **Vorschlag:** „Hunderte“ schreiben, die übrigen Punkte in TS §4.4 als bekannte Annahmen vermerken.
- **Folgen:** keine. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.**

## Verworfen

Kein Befund ist ganz verworfen. Korrigiert habe ich:

- **Opus A-01, „Isis in 102 von 200 Welten“:** Das Skript zählt Namen, auch ETF-Namen, nicht Welten. Richtig sind rund 27 % der Welten (Fable: 26 %).
- **Fable A-02, Schwere „mittel“:** herabgestuft auf niedrig (7.1a-03). Der Fall ist selten, hat keine Fehlerfolge und ist nicht ausnutzbar.
- **Fable A-10, „bei λ = 30 k = 429“:** Bei λ = 30 erreicht die Summe 1, die Schleife endet bei k = 83. Werte um 429 gelten für andere λ ≤ 30 (Opus). Am Hinweis ändert das nichts.
- **Folgenabschätzung beider Läufe zu A-01:** Beide nehmen an, jede Korrektur verschiebe den Strom und damit die ganze Welt. Das gilt nur für eine erweiterte Blockliste mit Neuziehung (V1). Eine Ersatztabelle nach der Annahme (V2) lässt Kurse und Parameter aller geprüften Seeds unverändert.

## Empfehlung an den Product Owner

**7.3 Modell:** keiner. Es gibt keinen grundlegenden Modellfehler.

**PO entscheidet:**

- 7.1a-01 Namensgenerator erzeugt reale Firmennamen und heikle Wörter. Empfehlung: in AP 7.3 nach Variante V2 korrigieren, mit `SIM_VERSION` 2. Kurse und Kalibrierung bleiben gleich, nur Namen und Ticker ändern sich.

**7.3 ohne Modelländerung:**

- 7.1a-02 Golden Master über viele Seeds
- 7.1a-04 Eigenschaftstest „22 Indizes“ und TS §5.2
- 7.1a-05 `Math.log` aus `analysis/domain` im Worker
- 7.1a-06 Lücken der ESLint-Regel
- 7.1a-07 Falle für nicht exakte `Math`-Funktionen, unabhängiges Orakel für `detExp`/`detLog`
- 7.1a-08 Gespeichertes `seedKey` beim Laden, Zeichensatz des Seeds
- 7.1a-11 Prüfsumme über den Spielerzustand
- 7.1a-12 Doku der Größenverteilung
- 7.1a-14 Präzisierungen TS §4.2, §4.4

**Bei nächster Modelländerung mitnehmen:**

- 7.1a-03 Sektorbesetzung per Größtrestverfahren
- 7.1a-09 Punktmasse der Dividendenrendite
- 7.1a-10 Nichtzahler mit `startDay` 0
- 7.1a-13 Abbruch der Poisson-Inversion

**Nicht umsetzen:** keiner.

**Vorschlag für den Schnitt von AP 7.3** (zusammen mit den Ergebnissen von 7.1b und 7.1c):

- **7.3a Determinismus-Absicherung** (ohne Modelländerung, zuerst): 7.1a-02, -07, -06, -05, -04. Danach zeigt der Golden Master jede spätere Weltänderung zuverlässig an.
- **7.3b Seed und Spielerzustand** (ohne Modelländerung): 7.1a-08, -11, dazu die Doku 7.1a-12 und -14.
- **7.3c Namen** (falls der PO zustimmt): 7.1a-01 mit Durchsicht der Kerne, Ersatztabelle, Snapshot-Test und `SIM_VERSION` 2. Entscheidet der PO sich für V1, gehören 7.1a-03, -09, -10 und -13 in dasselbe AP, mit Kalibrierungslauf; sonst gehen sie in die erste Welt- oder Marktänderung von M8.

## Geprüft ohne Befund

- **`detExp`/`detLog`:** Zeile für Zeile gleich zu fdlibm 5.3 (`e_exp.c`, `e_log.c`); gegen `decimal` mit 60 Stellen höchstens 0,85 ulp (exp) und 0,82 ulp (log); Randwerte (NaN, ±∞, ±0, subnormal, Über- und Unterlauf) korrekt; nur IEEE-exakte Operationen.
- **MurmurHash3 x86_128:** gegen die Referenz gelesen, SMHasher-Verifikationswert in den Tests, inkrementelles Hashen per Property-Test.
- **`sfc32`:** bitgleich zu einer unabhängigen BigInt-Implementierung (100.000 Ausgaben, mit Zählerüberlauf); Mindestperiode 2³² je Strom.
- **Stromableitung:** `StreamFamily` bitgleich zu `createStream`; Schlüssel präfixfrei, Seed-Schlüssel mit fester Länge.
- **Stromqualität:** Bitfrequenz, Byte- und Paar-χ², Lag-Korrelationen, Kreuzkorrelationen zwischen Tagen, Instrumenten, Seeds und Brückenströmen sowie 32-Bit-Kollisionen über 1–17 Mio. Werte unauffällig.
- **Verteilungen:** Normal (Marsaglia polar) in Momenten und Schwänzen bis 5 σ; Poisson, Lognormal, `uniformInt` ohne Modulo-Verzerrung, `weightedIndex`, Fisher–Yates mit allen 24 Permutationen.
- **`Checksum`, `worldChecksum`:** plattformunabhängig (Little-Endian über `DataView`, NaN kanonisch, −0 ≠ 0); `worldChecksum` gleich für andere Schreibweisen desselben Seeds.
- **Regeln für Simulationscode (TS §4.5):** stabile Gleichstandsschlüssel in allen Sortierungen der Welt, feste Iterations- und Summationsreihenfolge; im geregelten Code kein `Math.random`, `**` oder nicht exaktes `Math` außer 7.1a-05.
- **Mengen (TS §5.2):** immer 200 Aktien, 30 ETFs, 5 Emittenten, 6–8 Banken; 22 Indizes außer 7.1a-03; Länder exakt nach Größtrest (68/12/18/12/15/7/8/18/9/9/12/12), Branchenanteile nach Gewicht.
- **Unternehmen (TS §5.4):** Startkurs 5–500 €, Streubesitz 50–100 %, Größenklasse passend zur Kapitalisierung, Sparplan nur Large Caps, Gründungsjahre im Rahmen; Modellvolatilität je Größenklasse und Risikoklassen-Quintile wie in der TS.
- **Dividendenstart (E-33):** exponentiell mit Mittel 25 Jahre (gemessen 24,8, Median 17,4), außer 7.1a-10.
- **Indizes (TS §5.5):** Leitindizes 40/30/20/12 nach Streubesitz-Kapitalisierung, Dividendenindex mit den 30 höchsten Renditen, Kappungen 15/25/10 %, Small-Cap-Index vollständig.
- **ETFs (TS §5.6):** TER 0,05–0,65 % auf dem Raster, Startkurs 15–150 €, verschiedene Emittenten je Index, Dividenden-ETFs ausschüttend.
- **Banken (TS §5.7):** alle Konditionen in den Spannen und auf dem Raster; erste Bank ist eine Filialbank (E-14).
- **Kennungen:** ISIN-Prüfziffer an echten ISINs bestätigt, Präfix `QP`, keine Dubletten bei Namen, Tickern und ISINs; Ticker 2–5 Zeichen; Ticker-Ersatzziehung kam in 400.000 Unternehmen nie vor.
- **Seed-Vorschläge:** 100 + 100 Wörter ohne Überschneidung, Zahl 100–999 ohne Verzerrung.
- **Skalierung (TS §5.8):** Tabelle stimmt mit dem Code (840 bzw. 831 Kerne).
- **Golden-Master-Disziplin, NF-05, TS §15:** `GOLDEN_CHECKSUMS` zuletzt vor den ersten persistierten Spielern geändert, `SIM_VERSION` 1 regelkonform; Selbsttest und `e2e/determinism.e2e.ts` vergleichen alle sechs Prüfsummen in Chromium, Firefox und WebKit (Code gelesen). Die vorhandenen Tests von `simulation`, `world` und Golden Master laufen grün (Lauf Fable).

**Grenzen beider Läufe und dieser Gegenüberstellung:** keine Messung in Firefox, WebKit oder auf iOS (der iOS-Selbsttest ist laut AP 6.6 offen); kein PractRand oder TestU01; kein Registerabgleich der Namen und kein Abgleich der Ticker mit realen Kürzeln; `npm run test:calibration` nicht ausgeführt, weil kein Befund eine Modelländerung voraussetzt, die jetzt zu messen wäre.
