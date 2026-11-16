# AP 7.1a – Modellreview: Determinismus und Welt: Bericht Lauf Opus 5.5

Geprüfter Stand: c1e2514 · Datum: 15.11.2026

Arbeitsordner mit allen Skripten und Ausgaben: `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1a-opus/` (im Folgenden `W/`).

## Zusammenfassung

Die Determinismus-Mathematik ist solide. `detExp`/`detLog` sind korrekte fdlibm-Portierungen: Ich habe sie Zeile für Zeile mit `e_exp.c`/`e_log.c` verglichen. Gegen eine hochgenaue Referenz (Python `decimal`, 60 Stellen) liegt der Fehler bei höchstens 0,85 ulp. Mit V8s `Math.exp`/`Math.log` stimmen sie auf allen 310.000 Stichproben bitgleich überein. Die Ströme (`sfc32` mit Startzustand aus MurmurHash3) und die Verteilungen bestehen alle nachgemessenen Momente, Schwänze und Korrelationstests.

Der wichtigste fachliche Befund liegt bei der Welt. Der Namensgenerator erzeugt regelmäßig Namen realer börsennotierter Unternehmen und Marken: In der Golden-Welt `golden-1` stehen Orix, Valora, Calix, Orion, Arion und Lumia. „Isis“ kommt in jeder zweiten Welt vor. Die Blockliste verspricht laut TS §5.4 und R8 etwas anderes.

Dazu kommen kleinere Randfälle in der Welt:

- Nichtzahler mit `startDay` 0 zahlen ab der Epoche.
- Sektoren können sehr klein oder ganz leer sein.

Außerdem gibt es eine Testlücke: Der Golden Master über einen einzigen Seed bemerkt Weltänderungen auf seltenen Pfaden nicht, und genau solche Korrekturen stehen in AP 7.3 an. Die ESLint-Durchsetzung hat kleinere Lücken. Aktuell verletzt kein Simulationscode die Regeln.

## Befunde

### A-01 Namensgenerator erzeugt reale Firmen- und Markennamen

- **Schwere:** mittel
- **Art:** Modellfehler
- **Bereich:** TS §5.4 („Eine Blockliste verhindert reale Marken und Unternehmensnamen“), TS §17 R8; `src/app/world/domain/names/name-parts.ts`, `src/app/world/domain/names/name-blocklist.ts`, `src/app/world/domain/name-logic.ts:62`
- **Befund:** Die 42 × 20 Silben ergeben 840 Kerne; 9 davon blockiert die Liste (z. B. `lumen`, `fenix`, `lorex`, `valeo`, `corum`, `elis`, `aston`). Unter den übrigen 831 sind viele Namen realer börsennotierter Unternehmen oder bekannter Marken:
  - Unternehmen: Orix (ORIX Corp., Japan), Valora (Valora Holding, Schweiz), Calix (NYSE), Helix (Helix Energy), Talen (Talen Energy), Marex (Marex Group), Elia (Elia Group), Elan, Orion (Orion Oyj), Arion (Arion Bank), Torex (Torex Gold), Selex.
  - Marken: Lumix (Panasonic), Lumia (Nokia/Microsoft), Cyrix (früherer CPU-Hersteller).
  - Heikel ist außerdem „Isis“. Isis Pharmaceuticals hat sich 2015 deshalb in Ionis umbenannt.

  Die Blockliste deckt nur rund 370 Großnamen ab. Die Kerne selbst wurden offenbar nur stichprobenartig geprüft, denn `lumen`, `fenix`, `lorex` und `valeo` stehen schon in der Liste.

- **Beleg:**
  - `W/cores.ts`: alle 831 freien Kerne.
  - `W/names.ts`: 200 Welten, strenge Liste mit 15 Namen. Treffer je Welt: Median 4, Maximum 21.
  - `W/worlds.ts`: breitere Liste mit 29 Namen; in allen 200 Welten mindestens ein Treffer. „Isis“ in 102 von 200 Welten.
  - Beispiele aus `golden-1`: „Orix Shipping Holdings Ltd“ (HK), „Valora Invest“ (Onlinebroker), „Calix K.K.“, „Orion Cosmetics Inc.“, „Arion plc“, „Lumia Hotels K.K.“.
  - Weitere Seeds: „Lumix Software Inc.“, „Cyrix Health AG“, „Helix Systems K.K.“, „Elia Health K.K.“, „Isis K.K.“ (Finanzen).
- **Vorschlag:**
  - Alle 840 Kerne systematisch gegen Listen börsennotierter Unternehmen und bekannter Marken prüfen. Treffer in die Blockliste aufnehmen oder einzelne Endungen austauschen.
  - Heikle Wörter (Isis …) aufnehmen.
  - Das Ergebnis als Test festhalten: eine Liste der zulässigen Kerne als Snapshot, damit eine neue Silbe nicht ungeprüft hinzukommt.
  - Für N2 (§5.8) lohnt sich gleich ein Generator mit mehr Silben und eine automatisierte Prüfung.
- **Folgen einer Änderung:** Die Namen werden im selben Strom `world/companies` vor den Modellparametern gezogen, und jede zusätzliche Ablehnung verbraucht Zufallszahlen. Bei allen Seeds mit einem neu blockierten Kern verschieben sich deshalb alle folgenden Unternehmen: Ticker, ISINs, Parameter und Kurse. Das betrifft praktisch alle Seeds, auch `golden-1`. Der Golden Master bricht, also neue `SIM_VERSION`. Die Kalibrierung ist statistisch nicht betroffen, ein Kontrolllauf genügt. Gespeicherte Spieler sind veraltet. Aufwand S–M.

### A-02 Golden Master über einen Seed bemerkt Weltänderungen auf seltenen Pfaden nicht

- **Schwere:** mittel
- **Art:** Testlücke
- **Bereich:** TS §4.6, §15 („Ändert sich ein Golden Master, steigt `SIM_VERSION`“); `src/app/market/domain/golden-master.ts`, `src/app/market/domain/golden-master.spec.ts`
- **Befund:** Die Regel für `SIM_VERSION` stützt sich auf die Prüfsummen eines einzigen Seeds. Viele Pfade der Weltgenerierung kommen in `golden-1` gar nicht vor:
  - Die Ticker-Ersatzziehung lief in 40.000 Unternehmen aus 200 Welten nie.
  - Den Nichtzahler mit `startDay` 0 aus A-03 gibt es in 16 % der Welten, aber nicht in `golden-1`.
  - Leere oder winzige Sektoren aus A-04 kommen dort ebenfalls nicht vor.

  Eine Korrektur oder Refaktorierung dieser Pfade ändert also die Welt vieler Seeds, ohne dass eine Prüfsumme anschlägt. Die Regel aus §15 verlangt dann keinen Versionssprung. Bestehende Spieler laufen danach still mit einer anderen Welt weiter, denn die Welt wird bei jedem Laden neu erzeugt (§5.1). Genau das verhindert die Sperre vor 1.0 eigentlich. Gerade die Korrekturen aus AP 7.3 (z. B. A-03) wären davon betroffen.

- **Beleg:**
  - `W/g1.ts`: `golden-1` hat keinen Nichtzahler mit `startDay` 0, der Immobiliensektor hat 10 Werte.
  - `W/worlds.ts`: 37 solche Nichtzahler in 32 von 200 Welten; `fallbackTickers: 0` bei 40.000 Tickern.
  - Eine Korrektur wie `months = max(1, …)` in `drawStartDay` ließe `GOLDEN_CHECKSUMS.world` unverändert.
- **Vorschlag:**
  - Eine siebte Prüfsumme `worlds` über die `worldChecksum` vieler Seeds, z. B. 200 Seeds. Eine Welt kostet rund 6 ms (Perf-Test), zusammen also gut 1 s; im Selbsttest reichen weniger.
  - Optional eine Prüfsumme über die Ziehungen der Verteilungen für feste Ströme, damit Änderungen an seltenen Zweigen in `distributions.ts` auffallen (siehe A-06).
- **Folgen einer Änderung:** Nur Test und Selbsttest. Die neue Prüfsumme wird mit dem aktuellen Stand eingefroren; keine neue `SIM_VERSION`. Aufwand S.

### A-03 Nichtzahler mit `startDay` 0 zahlen ab der Epoche

- **Schwere:** niedrig
- **Art:** Abweichung Doku↔Code
- **Bereich:** TS §5.4 („Unternehmen ohne Dividende zur Epoche beginnen am Ersten eines **späteren** Monats“, „Zahler haben 0“); `src/app/world/domain/dividend-schedule-generator.ts:46–57`, `src/app/market/domain/market-context.ts:207`
- **Befund:** `months = floor(Exp(Mittel 300 Monate))` ist mit der Wahrscheinlichkeit `1 − e^{−1/300}` = 0,33 % gleich 0. Dann ist `startDay` = 0, also derselbe Wert, den Zahler tragen.
  - Der Markt setzt dann `dividendStartYears` = 0 und lässt das Unternehmen ab der Epoche mit `lifecycle.initialYield` ausschütten.
  - Die Welt führt es dagegen mit Rendite 0. Es fehlt deshalb im Dividendenindex, und es ist kein „späterer“ Zahler.
  - Der Test `world-generator.spec.ts:239` erlaubt `startDay >= 0` ausdrücklich. Doku und Test widersprechen sich also.
- **Beleg:**
  - Gezählt: 37 von 10.504 Nichtzahlern (0,35 %, erwartet 0,33 %), in 32 von 200 Welten (`W/worlds.ts`).
  - Rechnung: Gesucht ist `P(−25 · ln(1−U) · 12 < 1)`, also `P(U < 1 − e^{−1/300})`. Das ergibt 0,00333.
- **Vorschlag:** `months = 1 + floor(…)`. Das verschiebt das Mittel um einen Monat; der Test der Kalibrierung braucht `mean + 1/24` statt `mean − 1/24`. Alternativ `max(1, …)`. Den Test auf `startDay > 0` für Nichtzahler schärfen.
- **Folgen einer Änderung:** Mit `1 + floor` ändern sich alle Nichtzahler aller Seeds, auch in `golden-1`, also neue `SIM_VERSION`. Mit `max(1, …)` bleibt `golden-1` unverändert (siehe A-02), die Version muss trotzdem steigen. Kalibrierung: Dividendenziele kaum betroffen. Aufwand S.

### A-04 Sektorbesetzung schwankt stark, Sektoren können leer sein

- **Schwere:** niedrig
- **Art:** Modellfehler
- **Bereich:** TS §5.2 (22 Indizes), §5.5 (Kappung der Sektorindizes 25 %); `src/app/world/domain/company-generator.ts:136` (`weightedIndex` je Unternehmen), `src/app/world/domain/index-generator.ts:58` (leere Indizes werden übersprungen)
- **Befund:** Regionen und Länder werden per Größtrestverfahren fest zugeteilt, Branchen dagegen unabhängig je Unternehmen gezogen. Die Sektorgrößen sind deshalb binomial verteilt:
  - Immobilien hat im Mittel 8,9 Werte, mit 5 %-Quantil 4 und Minimum 3; Versorger, Rohstoffe und Basiskonsum haben ein Minimum von 4.
  - Bei höchstens 4 Werten ist die 25 %-Kappung unerfüllbar. `cappingFactors` gewichtet dann gleich, ein Sektorindex mit 3 gleichgewichteten Werten.
  - Mit `P(n=0) = (1 − 0,0444)^200 = 1,1·10⁻⁴` ist der Immobiliensektor leer. Dann hat die Welt 21 statt 22 Indizes, und die Index-IDs danach verschieben sich.
  - Die Eigenschaft im Test `world-generator.spec.ts:255` (`ofKind('sector') === 11` „für beliebige Seeds“) ist damit nicht allgemeingültig; sie fällt mit 8 Läufen nur nicht auf.
- **Beleg:**
  - `W/sectors.ts`, 200 Welten: Immobilien mit Mittel 8,6, Minimum 3 und 5 %-Quantil 4. 21 von 2.200 Sektorindizes haben `n · 0,25 ≤ 1`, also Gleichgewichtung.
  - `W/sectp.ts`: Binomialrechnung für Immobilien, `P(n ≤ 3)` = 2,1 % und `P(n = 0)` = 1,1·10⁻⁴.
  - `W/emptysector.ts`, `W/emptysector.out`: Unter den Seeds `probe-0` bis `probe-18488` haben 3 nur 21 Indizes, also 10 Sektorindizes (erwartet etwa 2): `probe-15893`, `probe-17814` und `probe-18488`.
- **Vorschlag:** Sektoranzahlen wie die Länder per Größtrestverfahren festlegen, z. B. aus den Branchengewichten. Danach die Branche innerhalb des Sektors ziehen, oder auch Branchen per Größtrest zuteilen und mischen. Alternativ eine Mindestgröße je Sektor. Dann gilt „22 Indizes“ für jeden Seed.
- **Folgen einer Änderung:** Die Unternehmen aller Seeds ändern sich: Golden Master, neue `SIM_VERSION`, Kalibrierung neu laufen lassen (Sektorfaktoren, Korrelationen). Aufwand S–M.

### A-05 Lücken in der ESLint-Durchsetzung der Determinismusregeln

- **Schwere:** niedrig
- **Art:** Verbesserung
- **Bereich:** TS §4.4, §4.5; `eslint.config.js:128–186`
- **Befund:**
  1. **Nicht erkannte Konstrukte:** Mit `--stdin` und dem virtuellen Dateinamen `src/app/market/domain/zz-review-probe.ts` geprüft. Die Regel meldet `Math.exp`, `Math['log']` und `const { exp } = Math`. Nicht gemeldet werden:
     - `y **= 2` (der Selektor prüft nur `BinaryExpression`),
     - `Math.asinh`, `Math.acosh`, `Math.atanh` (fehlen in der Liste und sind laut ECMAScript ebenfalls implementierungsabhängig),
     - `Date()` ohne `new` und `Date.parse`,
     - `globalThis.crypto` und `self.crypto`,
     - `const m = Math; m.exp(x)`,
     - `localeCompare`, `toLocaleString` und `Intl` (ICU-abhängig).
  2. **Code im Worker ohne die Regel:**
     - `analysis/domain/statistics-logic.ts` nutzt `Math.log` und `Math.pow`. `engine/domain/instrument-figures.ts:109` rechnet damit im Worker Volatilität und Beta (über `market/domain/instrument-figures-logic.ts`). Das sind reine Anzeigewerte, ohne Wirkung auf den Zustand; im letzten Bit können sie sich aber zwischen Browsern unterscheiden.
     - Ohne die Regel sind auch `notifications/domain` (von `engine/domain/notification-system.ts` importiert), `persistence/util` und `engine/data-access/worker/*` (Kerzen-Konsolidierung, `engine-host.ts` mit 2.528 Zeilen). Dort gibt es heute keine Verstöße (per grep geprüft).
- **Beleg:**
  - ESLint-Lauf, Ergebnis nur drei Meldungen (Zeilen 5, 7, 14 der Probe).
  - grep über `src/app` ohne Specs: In den Ordnern unter der Regel gibt es keine Verstöße. `localeCompare` gibt es in `banking/domain/bank-comparison-logic.ts:103` und `portfolio/domain/position-overview-logic.ts:91`, nur für Anzeige-Sortierungen.
- **Vorschlag:**
  - Selektor `AssignmentExpression[operator="**="]` ergänzen, ebenso `asinh`, `acosh` und `atanh`, `CallExpression[callee.name="Date"]`, `MemberExpression[property.name="crypto"]`, sowie `localeCompare`, `toLocale*` und `Intl` mindestens für `simulation`, `world` und `market`.
  - Die Regel auf `analysis/domain`, `notifications/domain` und `engine/data-access/worker` ausdehnen, die Lab-Statistik ausgenommen. Alternativ die Kennzahlen mit `detLog` rechnen.
- **Folgen einer Änderung:** keine Änderung an Welt oder Kursen, kein Golden-Master-Bruch. Wer `statistics-logic` auf `detLog` umstellt, ändert nur Anzeigewerte im letzten Bit. Aufwand S.

### A-06 Poisson-Inversion liefert im Grenzfall bis zu ~430 Sprünge

- **Schwere:** Hinweis
- **Art:** Implementierungsfehler (Randfall)
- **Bereich:** TS §4.3; `src/app/simulation/util/distributions.ts:58–72`, genutzt in `market/domain/instrument-step.ts:42`
- **Befund:**
  - Die gerundete Summe `cumulative` erreicht für viele λ nicht den größten möglichen Wert von `u` (1 − 2⁻⁵³). Liegt `u` darüber, läuft die Schleife, bis `p` auf 0 unterläuft.
  - Für λ zwischen 0,0119 und 0,02 (typische Sprungraten je Tag) liefert die Funktion dann k = 94–99, für λ ≤ 30 bis zu 429.
  - Ein Tag mit rund 95 Sprüngen wäre ein Kurssturz. Die Wahrscheinlichkeit liegt aber bei 2⁻⁵³ ≈ 1,1·10⁻¹⁶ je Ziehung. Bei rund 6 Mio. Instrument-Tagen je Echtzeitstunde (1 w/s) ist das praktisch nie.
- **Beleg:** `W/poislim.ts` und `W/poislim2.ts`: Für 13.667 von 30.000 λ-Werten in (0; 30] liegt das CDF-Maximum unter 1 − 2⁻⁵³, z. B. bei λ = 3/252 mit k = 94.
- **Vorschlag:** Die Schleife abbrechen, sobald `cumulative` nicht mehr wächst, und dann das k bis dahin zurückgeben, oder k sinnvoll begrenzen.
- **Folgen einer Änderung:** Ändert nur Ziehungen mit `u` ≥ CDF-Maximum; praktisch kein Seed ist betroffen und der Golden Master bleibt gleich. Formal ist es trotzdem eine Modelländerung. Ob dafür `SIM_VERSION` steigt, entscheidet der PO; nötig ist es praktisch nicht. Aufwand S.

### A-07 Tests von `detExp`/`detLog` haben ein schwaches Orakel

- **Schwere:** Hinweis
- **Art:** Testlücke
- **Bereich:** TS §4.4 („≤ 1 ulp, bitidentisch“); `src/app/simulation/util/det-math.spec.ts`
- **Befund:**
  - Die Tests verlangen nur höchstens 1 ulp Abstand zu V8s `Math.exp`/`Math.log`. V8 rechnet aber mit derselben fdlibm-Routine, und die Ergebnisse sind bitgleich.
  - Ein Portierungsfehler, der in Teilbereichen 1 ulp abweicht, z. B. eine falsch geklammerte Reduktion, bliebe deshalb unentdeckt. Er würde trotzdem jeden Kurs verschieben; der Golden Master fände das nur, wenn der Bereich in den Golden-Daten vorkommt.
  - Ein unabhängiges hochgenaues Orakel fehlt.
- **Beleg:** `W/detmath.ts` und `W/ulp.py`:
  - 160.010 Exp- und 150.000 Log-Stichproben, alle bitgleich mit V8.
  - Gegen `decimal` mit 60 Stellen: höchstens 0,854 ulp (exp, x = 332,40) und 0,819 ulp (log, x = 1,272).
  - Nicht korrekt gerundet sind 9,0 % der Exp- und 2,7 % der Log-Ergebnisse. Das ist bei fdlibm zu erwarten.
- **Vorschlag:** Eine eingefrorene Tabelle von etwa 1.000 Eingaben mit den erwarteten Bitmustern; mit `decimal` oder mpmath ist dabei zu prüfen, dass jedes unter 1 ulp liegt. Alternativ in Node bitgleich gegen V8 testen, mit dem Kommentar, dass V8 fdlibm nutzt.
- **Folgen einer Änderung:** nur Tests. Aufwand S.

### A-08 Seed-Normalisierung hängt von der Unicode-Version der Engine ab

- **Schwere:** Hinweis
- **Art:** Verbesserung
- **Bereich:** TS §4.1, NF-05; `src/app/simulation/util/seed.ts:7`
- **Befund:** `trim()`, `toLowerCase()` und `normalize('NFC')` richten sich nach den Unicode-Tabellen der jeweiligen Engine.
  - NFC ist durch die Stabilitätsregeln von Unicode abgesichert.
  - Die Kleinschreibung neu kodierter Großbuchstaben und die Menge der Leerzeichen für `trim` sind es nicht. Ein Beispiel ist U+180E, das in Unicode 6.3 aus dem Leerraum gestrichen wurde.
  - Ein Seed mit solchen Zeichen ergäbe auf einem älteren Browser einen anderen Seed-Schlüssel und damit eine andere Welt.
  - In der Praxis ist das kaum relevant, weil Vorschläge nur `a–z`, `-` und Ziffern enthalten.
- **Beleg:** ECMAScript legt die Fallunterscheidung über „the Unicode Default Case Conversion“ der jeweils implementierten Unicode-Version fest. Nicht nachgemessen, keine zweite Engine verfügbar.
- **Vorschlag:** Den erlaubten Zeichensatz in der UI auf ASCII und deutsche Umlaute begrenzen, oder in TS §4.1 dokumentieren, dass NF-05 nur für solche Seeds gilt.
- **Folgen einer Änderung:** Eine reine Begrenzung bei der Eingabe ändert keine bestehenden Seeds. Aufwand S.

### A-09 Realismus der Weltverteilung: einige Doku-Aussagen ungenau

- **Schwere:** Hinweis
- **Art:** Abweichung Doku↔Code / Verbesserung
- **Bereich:** TS §5.4 („schiefe Verteilung … wenige sehr große, viele kleine Unternehmen“), §4.2; `default-world-config.ts`
- **Befund:** Gemessen über 200 Welten (`W/worlds.ts`):
  - **Größenklassen:** Large 18 % (Mittel 35,9), Mid 58 % (115,6), Small 24 % (48,5). Das passt zur Lognormalverteilung (Median 4 Mrd., σ = 1): `P(> 10 Mrd.)` = 1 − Φ(0,916) = 18,0 %, `P(< 2 Mrd.)` = Φ(−0,693) = 24,4 %. „Viele kleine“ trifft aber nicht zu, es dominieren Mid Caps.
  - **Absolute Größen:** Das größte Unternehmen hat im Mittel 71 Mrd. € (5–95 %: 35–129 Mrd.), die Welt zusammen 1,3 Bio. €.
  - **Konzentration:** Die relative Konzentration ist realistisch: Die Top 10 halten 25,6 % (MSCI World real rund 25 %), das größte Gewicht im Weltindex ist 5,4 %.
  - **Dividendenrenditen:** Rund 11 Unternehmen je Welt (5,5 %) liegen genau an der Obergrenze von 6,5 % (`maxDividendYield`), eine Punktmasse. Der Dividendenindex wählt unter ihnen nur dann nach ID, wenn mehr als 30 Werte an der Grenze liegen; das kam nicht vor.
  - **TS §4.2:** Die Aussage, bei 32 Bit gäbe es „Dutzende identische Ströme“ je Jahrzehnt, untertreibt. Rund 1,5 Mio. Instrument-Ströme und 1,3 Mio. Faktor-Ströme je Jahrzehnt ergeben 2,7 Mio. Ströme, und `N²/2³³` ≈ 850 Kollisionen.
- **Vorschlag:**
  - Die Formulierung in TS §5.4 an die gemessene Verteilung anpassen. Ob Mega Caps oder mehr Small Caps gewollt sind, entscheidet der PO; das ginge z. B. mit einer Pareto-Mischung für das obere Ende, ist aber Kalibrierungsthema für AP 7.1b.
  - Optional die Rendite oberhalb der Obergrenze neu ziehen statt sie zu kappen.
  - In TS §4.2 „Hunderte“ schreiben.
- **Folgen einer Änderung:** Doku allein: keine. Eine geänderte Verteilung bräche den Golden Master und bräuchte eine neue `SIM_VERSION` und Kalibrierung. Aufwand S (Doku) bzw. M.

## Geprüft und in Ordnung

- **`detExp`/`detLog` gegen fdlibm 5.3:** Zeile für Zeile verglichen mit `e_exp.c` (Konstanten P1–P5, `o_threshold`, `u_threshold`, `ln2HI`/`ln2LO` samt Vorzeichenzweig, Reduktion mit `ln2HI[0]`, `twom1000`-Pfad) und `e_log.c` (Lg1–Lg7, Subnormal-Skalierung 2⁵⁴, `0x95f64`-Normalisierung, Klammerung der Rückgabeausdrücke). Alles identisch. Nur IEEE-exakte Operationen, und JS erlaubt keine FMA-Kontraktion; damit sind die Ergebnisse per Konstruktion bitidentisch über alle Engines.
- **Genauigkeit:** Gegen `decimal` mit 60 Stellen höchstens 0,85 ulp (exp) und 0,82 ulp (log), auch über den ganzen Wertebereich, nahe 1, subnormal und an den Reduktionsgrenzen ±0,5·ln 2 und ±1,5·ln 2 (`W/detmath.ts`, `W/ulp.py`). Die Randwerte (NaN, ±∞, ±0, Über- und Unterlauf, subnormale Ergebnisse) prüfen die vorhandenen Tests korrekt.
- **sfc32:** `nextUint32` entspricht PractRand sfc32 (Shifts 9/3, Rotation 21, Zähler). Der Zähler garantiert eine Mindestperiode von 2³² je Strom, im Mittel etwa 2¹²⁷. Die Tagesströme ziehen nur wenige Werte, die Periode ist also unkritisch. `nextFloat53` kombiniert 27 und 26 Bit korrekt.
- **Stromqualität und Unabhängigkeit** (`W/streams.ts`, `W/lags.ts`), jeweils mit Bitfrequenz, Byte-χ², Paar-χ² über 65.536 Zellen, Lag-Korrelationen 1–16 und 32-Bit-Kollisionen gegen die Geburtstagserwartung; alle |z| < 3:
  - erste Ausgaben aufeinanderfolgender Tagesströme (4,2 Mio.), auch mit `/bridge`,
  - erste Ausgaben über Instrument-IDs und über Seeds (je 1 Mio.),
  - 4 Ausgaben je Tagesstrom und ein langer Strom (16,8 Mio.).

  Die Kollisionen trafen die Erwartung, z. B. 2.056 gegen 2.048 erwartet. Ein Ausreißer z = 3,49 im ersten Lauf ließ sich mit 8,4 Mio. Werten und drei Seeds nicht reproduzieren (alle |z| ≤ 2,62). Die Korrelation von Normalziehungen zwischen 200 Instrumenten über 2.500 Tage hat eine Streuung von 0,0201 gegen 0,0200 erwartet.

- **Schlüssel und Kollisionen:** Die Stromschlüssel (`market/instrument/<id>/<tag>[/bridge]`, `market/factor/<id>/<tag>/bridge/<j>`, `…/init`, `market/etfs/<tag>`, `world/*`, `lab/reference/*`, `life/living-costs/*`) sind durch `/` präfixfrei; zwei Ströme können also nur durch eine 128-Bit-Hash-Kollision zusammenfallen. `StreamFamily` erzeugt Ziffern exakt wie `String(n)`, die vorhandenen Tests prüfen die Bitgleichheit.
- **MurmurHash3 x86_128:** Implementierung gegen die Referenz gelesen (Blockmischung, Tail, `fmix32`, Kreuzaddition). Die Specs prüfen den SMHasher-Verifikationswert und beliebige Zerstückelung. Längenfeld und Little-Endian-Kodierung stimmen.
- **Verteilungen** (`W/dists.ts`, `W/pois.ts`):
  - Normal (Marsaglia polar, 50 Mio. Werte): Mittel 9·10⁻⁵, Varianz 1,00013, Schiefe 4·10⁻⁴, Exzess −5·10⁻⁴. Schwänze bei |z| > 1 bis 5 mit z-Werten 0,35 / 0,17 / 0,15 / 0,50 / −0,12; z. B. 3.195 Werte über 4 gegen 3.167 erwartet. Der Spare-Wert wird korrekt gemerkt.
  - Poisson für λ = 0,002 / 0,02 / 1 / 5 / 30: Mittel, Varianz und P(0) im Rahmen; λ = 1 mit vier weiteren Strömen |z| ≤ 1,4.
  - Lognormal: E = exp(μ + σ²/2) bis auf 0,1 % bei 5 Mio. Werten.
  - `uniformInt` ohne Modulo-Verzerrung (Ablehnung korrekt, Bereich bis 2³²), `weightedIndex` mit fester Summationsreihenfolge, Fisher–Yates korrekt.
- **`Checksum` und `worldChecksum`:**
  - `Checksum` ist Little-Endian über `DataView` und damit unabhängig von der Plattform. NaN wird kanonisch gehasht, −0 und 0 bleiben verschieden.
  - `worldChecksum` hasht `JSON.stringify`; die Zahlenformatierung ist laut ECMAScript eindeutig, die Reihenfolge der Eigenschaften folgt der Einfügung.
  - Kein Code liest Typed-Array-Puffer plattformabhängig (grep `.buffer`).
- **Regeln für Simulationscode (TS §4.5, Welt):**
  - Alle Sortierungen der Welt haben einen stabilen Gleichstandsschlüssel (`allocateByLargestRemainder` nach Index, `largest` und `highestYield` nach ID); `.sort()` auf IDs ist ein Stringvergleich.
  - `Object.entries(loadings)` hat eine feste Einfügereihenfolge, alle Summen laufen in Array-Reihenfolge.
  - `Map` und `Set` iterieren laut Spezifikation in Einfügereihenfolge. In `src/app/{simulation,world,market,clock,engine,banking,trading,portfolio,taxes,dashboard,shared}/domain|util` gibt es kein `Math.pow`/`sin`/`exp`/`log` und kein `**` (grep).
- **Golden-Master-Disziplin:** `GOLDEN_CHECKSUMS` wurden zuletzt in AP 1.9c geändert (`ae7a8c3`, 12.11. 19:18). Persistierte Spieler gibt es seit AP 2.3 (`23c82ab`, 12.11. 22:04). `SIM_VERSION` = 1 ist damit regelkonform.
- **Mengen (TS §5.2), 200 Seeds:** immer 200 Aktien, 22 Indizes (siehe A-04 zur Ausnahme), 30 ETFs und 5 Emittenten. 6–8 Banken, im Mittel 7,03. Die Länderzuteilung ergibt mit Größtrest exakt 68/12/18/12/15/7/8/18/9/9/12/12; das habe ich von Hand nachgerechnet, die Regionsgewichte summieren je auf 1.
- **Unternehmen (TS §5.4):**
  - Startkurs 5–500 €, Streubesitz 50–100 %, Large Caps sparplanfähig (im Mittel 35,9 je Welt).
  - Kein Unterschied zwischen Größenklasse und angezeigter Marktkapitalisierung (0 Fälle in 20 Welten).
  - Volle Modellvolatilität über `idio-1` bis `idio-20` nachgemessen (`W/vols.ts`): Large Median 25,7 % (21,0–30,0), Mid 35,6 % (28,3–44,4), Small 51,3 % (39,7–65,6). Die Quintile 28,8 / 34,0 / 38,5 / 45,9 % passen zu den Grenzen 29/34/39/46 %.
  - Risikoklassen über 200 andere Welten: 20,6 / 19,9 / 22,4 / 17,7 / 19,5 %. Die Werte in TS §5.4 stimmen.
- **Indizes (TS §5.5):**
  - Leitindizes mit 40/30/20/12 nach Streubesitz-Kapitalisierung.
  - Dividendenindex mit den 30 höchsten Renditen; die niedrigste Rendite darin liegt im Median bei 5,14 %.
  - Kappungen 15/25/10 %, Small-Cap-Index enthält alle Small Caps.
- **ETFs (TS §5.6):** Die Summe der Produkte ist 30; TER zwischen 0,05 und 0,65 % auf einem Raster von 0,01 %-Punkten. Verschiedene Emittenten je Index, einzelne ETFs genau bei den genannten fünf Indizes. Startkurs 15–150 €; die Dividenden-ETFs schütten immer aus.
- **Banken (TS §5.7):** Alle Spannen der Konfiguration mit der Tabelle abgeglichen (Filial-, Direkt-, Onlinebank, Neobroker, Sollzinsen, Börsenentgelte), ebenso die Raster (10 Cent, 0,05 / 0,01 / 0,5 %-Punkte). Die erste Bank ist immer eine Filialbank (Hausbank, E-14).
- **Kennungen:**
  - Die ISIN-Prüfziffer stimmt bei 11 echten ISINs (US0378331005, DE0007164600, IE00B4L5Y983, DE000BASF111, CH0038863350, JP3633400001, GB0002634946, AU0000XVGZA3 …; `W/isin.ts`).
  - Über 200 Welten: alle ISINs gültig mit `QP`, keine doppelten Namen, Ticker oder ISINs, kein blockierter Name.
  - Ticker sind 2–5 Zeichen lang (2: 819, 3: 13.748, 4: 35.829, 5: 4).
- **Dividendenstart (E-33):** Die Exponentialverteilung mit Mittel 25 Jahre (4 % je Jahr) ist korrekt umgesetzt, bis auf A-03.
- **Seed-Vorschläge:** 100 + 100 eindeutige Wörter aus `a–z` ohne Überschneidung, Zahl 100–999 ohne Verzerrung durch Ablehnung. Das ergibt 9 Mio. Kombinationen, und Seed-Schlüssel kollidieren bei 128 Bit praktisch nicht.
- **Skalierung (TS §5.8):** Die Tabelle stimmt mit dem Code überein: 840 Kerne bzw. 831 freie, `formatId` mit 4 Stellen, 36⁹ Kennungen. Ab etwa 800 Unternehmen würde `NameRegistry` an `MAX_ATTEMPTS` scheitern; die Tabelle nennt das als nötige Erweiterung.
- **NF-05 und TS §15:** Selbsttest und Systemtest `e2e/determinism.e2e.ts` vergleichen alle sechs Prüfsummen im echten Worker von Chromium, Firefox und WebKit (Code gelesen, nicht ausgeführt). Die Versionsregeln vor 1.0 (Sperre bei abweichender `simVersion`) sind konsistent beschrieben.

## Nicht geprüft / Grenzen

- **Statistische Tests:** Kein PractRand oder TestU01 verfügbar, ebenso kein numpy, scipy oder mpmath. Die Stromtests sind eine eigene, kleinere Batterie (Frequenzen, χ², Lags, Kollisionen) mit 1–17 Mio. Werten. Feinere Abhängigkeiten zwischen Strömen (z. B. lineare Komplexität, Tests über 2⁴⁰ Byte) habe ich nicht gemessen.
- **Andere Engines:** Systemtests und Selbsttest in Firefox und WebKit habe ich nicht ausgeführt (laut Rahmen nicht erlaubt). Die Bitgleichheit über Engines folgt aus der Konstruktion (nur exakte Operationen) und aus den CI-Läufen laut Änderungsprotokoll. Der iOS-Selbsttest ist laut Änderungsprotokoll (AP 6.6) noch offen; damit ist NF-05 auf echten iOS-Geräten noch nicht belegt.
- **Namensprüfung:** Die Liste realer Namen in A-01 beruht auf meinem Wissen, nicht auf einem Abgleich mit Börsenverzeichnissen; sie ist sicher unvollständig. Ticker-Kollisionen mit realen Tickern habe ich nicht geprüft.
- **Abgrenzung:** Die Determinismus-Relationen aus TS §4.6 (Granularität, Snapshot, Beobachtungsunabhängigkeit, Bedarf gegen Vorabberechnung, Stützpunkte) gehören zu Marktmodell und Engine. Ich habe nur gesehen, dass es Tests dafür gibt, sie aber nicht nachgeprüft; ebenso die Wirkung der Weltparameter auf Kurse und Kalibrierung (AP 7.1b).
- **Leerer Sektor:** Die Folgen in der UI (21 Indizes) habe ich nicht im Browser geprüft, z. B. mit Seed `probe-15893`.
