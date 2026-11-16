# AP 7.1a – Modellreview: Determinismus und Welt: Bericht Lauf Fable 5.2

Geprüfter Stand: c1e2514 · Datum: 15.11.2026

Arbeitsordner mit allen Skripten und Ausgaben: `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1a-fable/` (unten kurz `W/`).

## Zusammenfassung

Die Determinismus-Mathematik ist in Ordnung: Hash, `sfc32`, Stromableitung, Verteilungen sowie `detExp`/`detLog` sind korrekt umgesetzt und halten die Zusagen der Spezifikation (gemessener Maximalfehler 0,82 ulp, keine Auffälligkeit in Momenten, Schwänzen und Korrelationen). Es gibt keinen kritischen oder hohen Befund.

Die zwei wichtigsten Befunde betreffen die Weltgenerierung:

- **Namen (A-01):** Die 840 Namenskerne enthalten mindestens 34 reale Unternehmens- und Markennamen und zwei heikle Wörter („Isis“, „Koran“), die die Blockliste nicht abfängt. Jede der 400 geprüften Welten enthält solche Namen.
- **Sektorindizes (A-02):** Branchen werden unabhängig gezogen. In rund 2,5 % der Welten hat ein Sektorindex nur 1–3 Werte, in rund 1 von 10.000 Welten fehlt ein Sektor ganz (21 statt 22 Indizes).

Die übrigen Befunde sind niedrig: Lücken der ESLint-Regel (eine davon wirkt real: `Math.log` in den Kennzahlen des Workers), eine Testlücke (Node und Chromium können `detExp` nicht von `Math.exp` unterscheiden), die Seed-Normalisierung hängt von der Unicode-Version des Browsers ab, und die Dividendenrendite häuft sich an der Kappungsgrenze.

## Befunde

### A-01 Namenskerne ergeben reale Firmennamen und heikle Wörter

- **Schwere:** mittel
- **Art:** Modellfehler (Daten des Namensgenerators)
- **Bereich:** TS §5.4 (Namen), TS §17 R8; `src/app/world/domain/names/name-parts.ts` (`CORE_STARTS`, `CORE_ENDINGS`), `src/app/world/domain/names/name-blocklist.ts`
- **Befund:** Die 42 × 20 Silben ergeben Kerne, die echte börsennotierte Unternehmen, Marken oder heikle Wörter sind. Die Blockliste sperrt von den 840 Kernen nur neun (Corum, Elis, Fenix, Haleon, Lumen, Lument, Valeon, Aston, Lorex).
  - Reale Namen, nicht gesperrt (Auswahl): Orix (ORIX Corp., Finanzkonzern), Orora (Orora Ltd, ASX), Orion, Valora, Elia (Elia Group), Marex (Marex Group plc), Calix (Calix Inc.), Helix, Helia (Helia Group), Talen (Talen Energy), Torex (Torex Gold), Navan (Navan Inc.), Arion (Arion Bank), Noris (Norisbank ist gesperrt, „Noris Direkt“ nicht), Astex, Cyren, Cyrix, Selex, Lumia und Lumix (Marken), Zelis, Vendex, Helion, Meren.
  - Heikel: „Isis“ (`Is` + `is`), „Koran“ (`Kor` + `an`), dazu „Coran“, „Xanex“, „Elon“.
  - Weil jede Welt rund 217 der 840 Kerne verbraucht, erscheint jeder einzelne Kern in rund 26 % der Welten.
  - Der Test „uses fictional names and identifiers only“ nimmt die Blockliste selbst als Orakel und kann fehlende Einträge nicht finden.
- **Beleg:** `W/names.ts`, 400 Welten (`names-1` … `names-400`):
  - 400 von 400 Welten enthalten mindestens einen Namen mit einem der 34 Kerne meiner Liste realer Namen, im Mittel 9,2 je Welt.
  - „Isis“ in 104, „Koran“ in 105, „Orix“ in 145, „Orora“ in 141 der 400 Welten.
  - Erzeugte Namen: `Orora Ltd.` (die reale Firma heißt „Orora Limited“), `Navan plc`, `Helix plc`, `Marex Corp.`, `Arion Assurance Inc.`, `Isis Petroleum Inc.`, `Isis 20` (Leitindex), `Koran Markets K.K.`, `Koran Genetics Inc.`.
  - Meine Liste entstand durch Durchsicht aller 840 Kerne (`W/world-out.txt`, Zeile `ALLCORES`); sie ist sicher nicht vollständig.
- **Vorschlag:** Die 840 Kerne einmal vollständig gegen Firmen- und Markenregister und eine Liste heikler Wörter prüfen. Treffer in die Blockliste aufnehmen oder Silben ersetzen (z. B. `Is`, `Kor`, `Or` als Anfang prüfen). Einen Test ergänzen, der die Liste der zulässigen Kerne einfriert, damit neue Silben eine Durchsicht erzwingen.
- **Folgen einer Änderung:** Jeder zusätzliche Blocklisteneintrag verschiebt die Ziehungen im Strom `world/companies` (Namen werden per Verwerfen gezogen) und ändert damit die ganze Welt: Golden Master bricht, neue `SIM_VERSION`. Kalibrierung der Welt (Risikoklassen-Quintile) prüfen. Aufwand S–M (die Durchsicht ist der Hauptteil).

### A-02 Sektorindizes mit 0–3 Werten, Zahl der Indizes nicht fest

- **Schwere:** mittel
- **Art:** Modellfehler
- **Bereich:** TS §5.2, §5.5; `src/app/world/domain/company-generator.ts:128` (`weightedIndex` je Unternehmen), `src/app/world/domain/index-generator.ts:58` (`add` überspringt leere Indizes)
- **Befund:** Länder werden nach festen Gewichten zugeteilt, Branchen aber je Unternehmen unabhängig gezogen. Kleine Sektoren (Immobilien: Gewicht 4 von 90, erwartet 8,9 Unternehmen; Versorger: 5 von 90) fallen deshalb in manchen Welten fast oder ganz aus.
  - Ein Sektorindex mit 1–3 Werten ist kein Index. Die Kappung von 25 % ist dann nicht erfüllbar; der Markt weicht auf gleiche Gewichte aus (TS §6.6), also 33 %, 50 % oder 100 % je Wert.
  - Hat ein Sektor kein Unternehmen, entfällt sein Index. Die Welt hat dann 21 statt der in TS §5.2 und §5.5 zugesagten 22 Indizes. Beträfe es Technologie, Gesundheit, Energie oder Finanzen, entfiele auch der ETF (`etf-generator.ts:80`, `continue`); das ist nochmals deutlich seltener.
  - Die Tests prüfen „22 Indizes“ nur an festen Seeds.
- **Beleg:** `W/names.ts` (zweiter Teil), 30.000 Seeds `empty-1` … `empty-30000`, kleinster Sektor je Welt: 0 Werte in 3 Welten, 1 in 32, 2 in 136, 3 in 569 – zusammen 740 (2,5 %).
  - Gegenrechnung Immobilien, Binomial(200; 4/90): P(X = 0) = 1,1 · 10⁻⁴, P(X ≤ 2) ≈ 0,6 %; passt zur Messung.
  - Seed `review-1`: „Zeloris World Real Estate“ mit n = 2.
  - Seed `empty-13280`: 21 Indizes, 30 ETFs. `computeGoldenChecksums` läuft für diesen Seed ohne Fehler durch, der Markt verkraftet es also.
- **Vorschlag:** Branchen wie die Länder nach der Methode der größten Reste zuteilen und danach mischen, oder je Sektor eine Mindestzahl garantieren (z. B. 5, damit 25 % Kappung erfüllbar ist). Das macht die Sektorgrößen auch zwischen Welten vergleichbarer.
- **Folgen einer Änderung:** andere Welt je Seed, Golden Master bricht, neue `SIM_VERSION`. Kalibrierung neu laufen lassen (`npm run test:calibration`; Risikoklassen-Quintile und Indexziele können sich leicht verschieben). Aufwand S–M.

### A-03 `Math.log` gelangt über einen Import aus `analysis/domain` in den Engine-Worker

- **Schwere:** niedrig
- **Art:** Abweichung Doku↔Code
- **Bereich:** TS §4.4; `src/app/market/domain/instrument-figures-logic.ts:1`, `src/app/analysis/domain/statistics-logic.ts:38` (`Math.log`), `:53` und `:105` (`Math.pow`), `src/app/engine/domain/instrument-figures.ts:109`
- **Befund:** `market/domain` unterliegt der Determinismus-Regel, importiert aber `annualizedVolatility`, `beta` und `logReturns` aus `analysis/domain`, das nicht unter die Regel fällt. Volatilität und Beta der Instrumentseite rechnet der Worker deshalb mit `Math.log`.
  - Betroffen sind nur angezeigte Kennzahlen, nicht der Markt- oder Spielerzustand. Ein Unterschied im letzten Bit ist nach der Formatierung praktisch unsichtbar.
  - Es widerspricht aber TS §4.4 („Simulationscode nutzt nur IEEE-754-exakte Operationen“), und die ESLint-Regel bemerkt es nicht, weil sie nur die Datei selbst prüft.
- **Beleg:** Worker mit esbuild gebündelt und alle 184 Quelldateien durchsucht (`W/worker-meta.json`, `W/worker-inputs.txt`): `Math.log` und `Math.pow` kommen im Worker nur in `statistics-logic.ts` vor; `logReturns` wird über `windowVolatility` und `windowBeta` tatsächlich aufgerufen, die beiden `Math.pow`-Funktionen von dort nicht.
- **Vorschlag:** `logReturns` auf `detLog` umstellen oder `analysis/domain` in die ESLint-Regel aufnehmen (das Labor nutzt die Statistik ebenfalls im Worker).
- **Folgen einer Änderung:** kein Golden Master, keine `SIM_VERSION`, keine Spielstände betroffen. Aufwand S.

### A-04 ESLint-Regel für Simulationscode hat Lücken

- **Schwere:** niedrig
- **Art:** Verbesserung
- **Bereich:** TS §4.4, §4.5; `eslint.config.js:127–187`
- **Befund:** Die Regel fängt die direkten Schreibweisen ab, mehrere gleichwertige aber nicht:
  - den Zuweisungsoperator `x **= y` (der Selektor trifft nur `BinaryExpression`);
  - `Math.asinh`, `Math.acosh`, `Math.atanh` (fehlen in der Liste; ebenfalls implementierungsabhängig);
  - Aliase und Umwege: `const m = Math; m.pow(…)`, `globalThis.Math.exp(…)`, `globalThis.crypto`, `self.performance.now()`;
  - `Date.parse(…)` und `Date()` ohne `new`;
  - gebietsabhängige Funktionen: `localeCompare`, `Intl.*`, `toLocale*`. Sie stehen heute schon in geprüften Ordnern (`market/domain/screener-logic.ts:12`, `banking/domain/bank-comparison-logic.ts:103`, `portfolio/domain/position-overview-logic.ts:91`), dort nur für Sortierungen von Abfragen;
  - Importe aus Ordnern außerhalb der Regel (A-03). Der Worker bindet außerdem `notifications/domain`, `players/domain`, `analysis/domain`, `shared/util` und `persistence/util` ein, die nicht unter die Regel fallen.
- **Beleg:** Prüfdatei per `eslint --stdin --stdin-filename src/app/simulation/util/review-probe.ts` (nichts im Repo angelegt): von 18 Konstrukten meldet ESLint 5 (`const { exp } = Math`, `Math['log']`, `Math.exp`, `**`, `Math.random`); die oben genannten bleiben ohne Meldung. Im heutigen Code kommt außer A-03 keines der gefährlichen Konstrukte vor (Suche über alle Worker-Dateien).
- **Vorschlag:** `AssignmentExpression[operator="**="]`, die drei fehlenden `Math`-Funktionen und `Date.parse` ergänzen. Die Regel auf alle Ordner ausdehnen, die der Worker einbindet (oder Importe aus ungeprüften Ordnern in Simulationscode verbieten). Für `localeCompare`/`Intl` eine Regel mit begründeten Ausnahmen für reine Abfragen.
- **Folgen einer Änderung:** keine für Golden Master, `SIM_VERSION` und Spielstände. Aufwand S.

### A-05 Node und Chromium können `detExp`/`detLog` nicht von `Math.exp`/`Math.log` unterscheiden

- **Schwere:** niedrig
- **Art:** Testlücke
- **Bereich:** TS §4.4, §4.6, §14.1; `src/app/simulation/util/det-math.spec.ts`, `src/app/market/domain/golden-master.spec.ts`, `e2e/determinism.e2e.ts`
- **Befund:** V8 rechnet `Math.exp` und `Math.log` selbst mit der fdlibm-Routine. `detExp` und `detLog` sind dort bitgleich zu `Math.exp` und `Math.log`.
  - Ersetzt jemand in Simulationscode `detExp` durch `Math.exp`, bleiben alle Logik-Tests samt Golden Master grün, ebenso der Selbsttest in Chromium. Nach meinem Kenntnisstand nutzt auch SpiderMonkey fdlibm (nicht nachgemessen); dann fiele der Fehler nur in WebKit auf – und WebKit unter Linux nutzt eine andere libm als Safari auf iOS.
  - Die ESLint-Regel ist damit der eigentliche Schutz; ihre Lücken (A-04) wiegen entsprechend.
  - Der Kommentar in `det-math.spec.ts:83` nennt `Math.exp` ein „unabhängiges Orakel“. Es ist dieselbe Routine; der Test „≤ 1 ulp gegen `Math.exp`“ prüft in Node die Portierung, nicht die Genauigkeit.
- **Beleg:** `W/detmath.ts`: 13 Mio. Stichproben über alle Bereiche (weit, nahe 0, nahe 1, subnormal), 0 Abweichungen zwischen `detExp`/`detLog` und `Math.exp`/`Math.log` in Node 22.
- **Vorschlag:**
  - In `golden-master.spec.ts` und im Selbsttest des Workers die nicht exakten `Math`-Funktionen während `computeGoldenChecksums` durch Funktionen ersetzen, die einen Fehler werfen. Das findet jeden Aufruf auf den geprüften Pfaden, in jeder Engine.
  - Für die Genauigkeit einige Dutzend Referenzwerte aus einer Rechnung mit hoher Stellenzahl als Tabelle einfrieren (echtes unabhängiges Orakel).
- **Folgen einer Änderung:** nur Tests. Aufwand S.

### A-06 Seed-Normalisierung hängt von der Unicode-Version des Browsers ab

- **Schwere:** niedrig
- **Art:** Modellfehler (Randfall)
- **Bereich:** TS §4.1, NF-05; `src/app/simulation/util/seed.ts:8`, `src/app/engine/data-access/worker/engine-host.ts:320`
- **Befund:** `toLowerCase()` und `trim()` folgen den Unicode-Tabellen der jeweiligen Engine. Neue Unicode-Versionen fügen Groß-/Kleinpaare hinzu. Derselbe Seed-Text kann deshalb in zwei Browsern (oder im selben Browser nach einem Update) verschiedene Seed-Schlüssel und damit verschiedene Welten ergeben.
  - Die Engine leitet den Schlüssel beim Laden erneut aus dem gespeicherten Seed ab (`generateStandardWorld`), obwohl der Spieler `seedKey` schon gespeichert hat. Ein Spielstand mit so einem Zeichen bekäme nach einem Browser-Update eine andere Welt.
  - Betroffen sind nur exotische Zeichen; Seeds aus `a–z`, Ziffern, Umlauten und üblichen Schriften sind stabil. NFC selbst ist für vergebene Zeichen stabil.
  - Der Golden Master (`golden-1`, reines ASCII) deckt die Normalisierung browserübergreifend nicht ab.
- **Beleg:** Node 22.22 (Unicode 17): `'Ꟛ'.toLowerCase()` ergibt U+A7DB; ebenso U+A7CB → U+0264, U+1C89 → U+1C8A, U+10D50 → U+10D70. Diese Paare kamen mit Unicode 16 (2024). Die Mindestbrowser aus NF-08 (Chrome 119, Firefox 128, Safari 17.0) haben Unicode 15 bzw. 15.1 und lassen die Zeichen unverändert. In einem alten Browser nachgemessen habe ich das nicht.
- **Vorschlag:** Beim Laden den gespeicherten `seedKey` verwenden statt neu abzuleiten. Zusätzlich die Normalisierung von der Engine unabhängig machen: zulässige Zeichen des Seeds festlegen (und andere ablehnen) oder nur eine feste eigene Tabelle für die Kleinschreibung nutzen.
- **Folgen einer Änderung:** Für Seeds aus üblichen Zeichen ändert sich nichts (kein Golden-Master-Bruch, keine `SIM_VERSION`). Eine Zeichenbeschränkung braucht eine Regel für vorhandene Spieler mit anderen Zeichen. Aufwand S.

### A-07 Dividendenrenditen häufen sich an der Kappungsgrenze von 6,5 %

- **Schwere:** niedrig
- **Art:** Modellfehler (Realismus)
- **Bereich:** TS §5.4, §5.5; `src/app/world/domain/company-generator.ts:151–158`
- **Befund:** Die Rendite ist `min(6,5 %; Gleichverteilung der Branche × Stilfaktor)`. Bei Value-Werten (Faktor 1,25) in Branchen mit Spannen bis 6–6,5 % schneidet das Minimum einen großen Teil ab. Es entsteht eine Punktmasse bei genau 6,50 %.
  - Im Screener stehen dann rund elf Aktien je Welt mit identischer Höchstrendite.
  - Der Dividendenindex (Top 30) besteht zu gut einem Drittel aus diesen Werten; die Reihenfolge unter ihnen entscheidet allein die `id`.
- **Beleg:** `W/world.ts`, 500 Welten (100.000 Unternehmen): 7,6 % aller Zahler haben genau 0,065; bei im Median 74 % Zahlern sind das rund 11 je Welt. In der Stichprobe `review-1` haben 2 der ersten 12 Unternehmen genau 6,5 %. Schwelle des Dividendenindex im Median 5,17 %.
- **Vorschlag:** Statt hart zu kappen neu ziehen oder weich begrenzen (z. B. Überschuss über 5,5 % halbieren), oder den Stilfaktor auf die Spanne statt auf den Wert anwenden.
- **Folgen einer Änderung:** andere Welt, Golden Master bricht, neue `SIM_VERSION`; Kalibrierungsziel „Dividendenrendite des Weltindex 2–3 %“ prüfen. Aufwand S.

### A-08 Browserübergreifende Prüfung deckt nur den Markt ab, nicht den Spielerzustand

- **Schwere:** niedrig
- **Art:** Testlücke
- **Bereich:** TS §4.4 (letzter Satz), §4.6, NF-05; `src/app/market/domain/golden-master.ts`, `e2e/determinism.e2e.ts`
- **Befund:** TS §4.4 verlangt, dass auch der Spielerzustand überall gleich gerechnet wird. Die sechs Golden-Master-Prüfsummen und der Selbsttest umfassen Welt, Kurse, Indizes, ETFs und den Marktzustand, aber kein Engine-Szenario (Zinsen, Orders, Steuern, Performance). `determinism.e2e.ts` ist der einzige Systemtest mit Prüfsummen.
  - Das Risiko ist klein, weil Geld in ganzen Cent geführt wird und der Code dieselben exakten Operationen nutzt. Belegt ist die Gleichheit über Engines aber nur für den Markt.
- **Beleg:** Durchsicht von `golden-master.ts` und `e2e/` (Suche nach `checksum`).
- **Vorschlag:** Eine siebte Prüfsumme über den Spielerzustand nach einem festen Kommandoskript (einige Monate mit Orders, Sparplan, Zinsabschluss, Steuer) in den Selbsttest aufnehmen.
- **Folgen einer Änderung:** nur Tests und Selbsttest; diese Prüfsumme bräche künftig bei jeder Änderung am Wirtschaftsmodell (gewollt). Aufwand M.

### A-09 Größenverteilung: wenige Small Caps, Obergrenze ohne Wirkung

- **Schwere:** Hinweis
- **Art:** Abweichung Doku↔Code
- **Bereich:** TS §5.4 („wenige sehr große, viele kleine Unternehmen“), §5.5; `default-world-config.ts:29–30`
- **Befund:** Mit Median 4 Mrd. € und σ = 1,0 sind 18 % Large, 57 % Mid und 24 % Small Caps; „viele kleine“ trifft nicht zu. Die Obergrenze von 1,5 Billionen € wird nie erreicht. Die Leitindizes bestehen deshalb im Median nur zu 35 % aus Large Caps (Nordamerika: 40 Werte bei im Median 14 Large Caps). Die Konzentration selbst ist plausibel.
- **Beleg:** `W/world.ts`, 500 Welten: Anteile 18,1 / 57,4 / 24,5 % (Theorie 18,0 / 57,6 / 24,4 %). Größtes Unternehmen je Welt im Median 59 Mrd. €, Maximum über 100.000 Unternehmen 256 Mrd. €. Top 10 halten im Median 24,9 % der Gesamtkapitalisierung, der größte Wert 4,5 %.
- **Vorschlag:** Text in TS §5.4 an die Verteilung anpassen oder (PO-Entscheidung) Median und Schwellen verschieben; `max` auf einen erreichbaren Wert setzen oder als reine Sicherung kennzeichnen.
- **Folgen einer Änderung:** Textänderung ohne Folgen; Parameteränderung bräche den Golden Master (`SIM_VERSION`, Kalibrierung). Aufwand S.

### A-10 Theoretische Restpunkte der Zufalls- und Rechenbausteine

- **Schwere:** Hinweis
- **Art:** Verbesserung
- **Bereich:** TS §4.3, §4.4, §4.6; `distributions.ts:66–80`, `distributions.ts:11`, `world-checksum.ts`
- **Befund und Beleg:**
  - **Poisson:** Die aufsummierte Verteilungsfunktion bleibt durch Rundung knapp unter 1 (bis zu 10 Rasterpunkte von 2⁵³, bei λ ≈ 23,8). Fällt `u` darüber, läuft die Schleife, bis `p` auf 0 unterläuft, und liefert bei λ = 30 den Wert k = 429. Wahrscheinlichkeit rund 10⁻¹⁵ je Ziehung, praktisch bedeutungslos, aber deterministisch reproduzierbar (`W/streams.ts`).
  - **`uniform`:** Der Kommentar stimmt: Bei winziger Spanne relativ zu `min` wird `max` getroffen (`uniform(1e16, 1e16 + 2)` in 50 % der Fälle). Kein Aufrufer ist davon betroffen.
  - **`Math.sqrt`:** ECMA-262 führt `Math.sqrt` formal als implementierungsabhängig. Alle Engines nutzen die korrekt gerundete IEEE-Operation; TS §4.4 nennt sie „exakt“. Der Selbsttest in drei Engines deckt das ab.
  - **`worldChecksum`:** Sie hasht `JSON.stringify(world)`. Die letzte Ziffer der kürzesten Dezimaldarstellung ist in ECMA-262 formal nicht eindeutig festgelegt; alle heutigen Engines liefern die nächstliegende. Schlimmstenfalls gäbe es einen falschen Alarm, keinen echten Unterschied der Welt.
  - **TS §4.2:** „Dutzende identische Ströme“ bei 32 Bit ist untertrieben. Bei rund 2,4 Mio. Strömen je Spieljahrzehnt wären es etwa n² / 2³³ ≈ 670 Paare; an der Aussage ändert das nichts.
- **Vorschlag:** In `poisson` die Schleife bei einem festen `k`-Maximum beenden (ändert Ergebnisse nur in den 10⁻¹⁵-Fällen, deshalb ohne praktischen Golden-Master-Bruch, formal aber eine Modelländerung). Die übrigen Punkte höchstens in TS §4.4 vermerken.
- **Folgen einer Änderung:** praktisch keine. Aufwand S.

## Geprüft und in Ordnung

- **MurmurHash3 x86_128** (`hash128.ts`): Zeile für Zeile gegen die Referenz (Blockmischung, Tail, Finalisierung) gelesen. Die Tests enthalten die SMHasher-Verifikation `0xB3ECE62A` und Referenzvektoren. Das inkrementelle Hashen ist per Property-Test gegen den Einmal-Hash gesichert.
- **`sfc32`** (`random-stream.ts`): gegen eine eigene BigInt-Implementierung über 100.000 Ausgaben bitgleich, einschließlich Zählerüberlauf. Mindestperiode 2³² je Strom durch den Zähler; genutzt werden wenige Dutzend Ausgaben je Strom.
- **Stromableitung:** `StreamFamily` ist bitgleich zu `createStream` (Tage 0 bis 2⁴⁰, mit und ohne `/bridge`). Der Seed-Schlüssel hat feste Länge, deshalb sind Schlüssel eindeutig getrennt.
- **Unabhängigkeit der Ströme:** erste Normalzahl aus 2 Mio. Tagesströmen eines Instruments: Mittel 6 · 10⁻⁵, Varianz 1,0001, Schiefe 0,0002, Exzess 0,002. Autokorrelation Lag 1–5 höchstens 0,0008 (Rauschgrenze 0,0007), Quadrate −0,0003. Kreuzkorrelation Nachbarinstrument 0,0004, Tages- gegen Brückenstrom 0,0009. Hamming-Abstand der ersten Ausgabe benachbarter Tage 15,994 (ideal 16), größte Bit-Schiefe 5,5 · 10⁻⁴. 32-Bit-Kollisionen 440 (erwartet 466).
- **Normalverteilung (Marsaglia-Polar):** 20 Mio. Werte eines Stroms: Varianz 1,0005, Kurtosis 3,0014; Schwänze |z| > 3 / 4 / 5: 54.273 / 1.304 / 16 (erwartet 53.996 / 1.267 / 11,5). Erreichbarer Höchstwert rund 12 σ.
- **Übrige Verteilungen:** `uniformInt` χ² 2,7 (df 5), 15,0 (df 9), 983 (df 999), ohne Modulo-Verzerrung, Bereich bis 2³² geprüft. Poisson λ = 0,004 / 0,5 / 3 / 30: Mittelwerte und χ² unauffällig. Mischen: alle 24 Permutationen, χ² 29,6 (df 23). Gewichtete Auswahl und Lognormal-Mittel stimmen. `nextFloat53` erreicht 1 nie.
- **`detExp`/`detLog`:** Code gegen `e_exp.c` und `e_log.c` (fdlibm 5.3) gelesen, Konstanten und Klammerung stimmen. Gegen exakte Referenz (Python `decimal`, 60 Stellen, `W/detmath_ref.py`): 100.000 Werte `exp`, 120.000 Werte `log`, größter Fehler 0,82 bzw. 0,79 ulp, kein Wert über 1 ulp. Die Zusage „≤ 1 ulp“ hält. Randfälle (NaN, ±∞, ±0, subnormal, Überlauf bei 709,7827…, Unterlauf bei −745,133…, `log` von negativen Zahlen) stimmen.
- **Nicht exakte Operationen im Simulationscode:** In allen 184 Quelldateien des Engine-Workers kommen außer A-03 nur `abs`, `ceil`, `floor`, `imul`, `max`, `min`, `round`, `sqrt`, `trunc` und die Konstante `LN2` vor; kein `**`, kein `Math.random`. `Date.now` steht nur im Worker-Einstieg (Uhr des Hosts), `new Date` nur im Export (Zeitstempel).
- **Reihenfolgen:** Weltgenerator und Toolkit iterieren nur über Arrays und Objektliterale mit fester Reihenfolge; Sortierungen haben einen eindeutigen Schlüssel (`id`, Index). In Markt und Engine nur überflogen: keine auffällige Stelle.
- **Welt, Mengen (500 Welten, `W/world.ts`):** immer 200 Aktien, 22 Indizes, 5 Emittenten, 30 ETFs, 6–8 Banken (24 / 47 / 29 %). Länder exakt US 68, CA 12, DE 18, FR 12, GB 15, CH 7, NL 8, JP 18, AU 9, HK 9, IN 12, BR 12 (40 / 30 / 18 / 12 %). Branchenanteile nach Gewicht: χ² 27,2 (df 30).
- **Unternehmen:** ln(Marktkapitalisierung) Mittel 22,110 (Ziel 22,110), σ 1,001. Startkurse 5–500 €, Median 50,08. Streubesitz 50–100 %. Größenklasse passt zur Kapitalisierung. Sparplan nur Large Caps. Gründungsjahre 1850–2016, vor der Epoche 2020.
- **Risikoklassen:** 20,8 / 19,7 / 22,3 / 17,6 / 19,6 % (TS: 21 / 19 / 22 / 18 / 20 %). Volle Modellvolatilität Large 20,9 / 25,6 / 30,0 %, Mid 28,2 / 35,4 / 44,4 %, Small 39,5 / 51,0 / 66,1 % (5 % / Median / 95 %), wie in TS §5.4.
- **Dividenden:** Frequenz je Region, Rhythmus im zulässigen Bereich und gleichverteilt. Beginn der Nichtzahler: Mittel 24,8 Jahre, Median 17,4, 32,8 % in zehn Jahren (Exponential mit 25 Jahren: 25 / 17,3 / 33,0 %).
- **Kennungen:** eigene, unabhängige ISIN-Prüfung (an sechs echten ISINs getestet): alle Kennungen gültig, Präfix `QP`, keine Dubletten. Ticker 2–5 Buchstaben, eindeutig über Aktien, Indizes und ETFs; kein einziger Zufallsersatz. Namen eindeutig; kein erzeugter Name trifft die Blockliste.
- **Indizes:** Leitindizes mit 40 / 30 / 20 / 12 Werten und den größten Werten nach Streubesitz, Dividendenindex mit den 30 höchsten Renditen, Small-Cap-Index vollständig, Bestandteile sortiert.
- **ETFs:** TER 0,05–0,65 %, Startkurs 15–150 €, je Index verschiedene Emittenten, Dividenden-ETFs ausschüttend, Börse `exc-de`. Produktsumme 30.
- **Banken:** alle Konditionen in den Spannen der Tabelle TS §5.7 und auf dem Raster; Zusammensetzung 2 / 2 / 1–2 / 1–2.
- **Determinismus der Welt:** gleiche Prüfsumme für andere Schreibweise des Seeds, 500 verschiedene Prüfsummen für 500 Seeds.
- **Vorhandene Tests:** `simulation`, `world` und `golden-master.spec.ts` laufen grün (13 Dateien, 119 Tests); der Golden Master wird auf dieser Maschine reproduziert.
- **NF-05, TS §15:** Der Selbsttest läuft laut `playwright.config.ts` in Chromium, Firefox, WebKit und zwei Mobilprofilen. Die Regel „Golden Master bricht → `SIM_VERSION`“ ist stimmig.

## Nicht geprüft / Grenzen

- Keine Messung in Firefox, WebKit oder auf iOS (Playwright-Läufe waren ausgeschlossen). Die Aussagen zu anderen Engines in A-05 und A-06 beruhen auf Kenntnis der Engines und der Unicode-Versionen, nicht auf Messung.
- Keine PractRand- oder TestU01-Läufe für `sfc32`; ich stütze mich auf die veröffentlichte Qualität des Generators und die eigenen Momenten- und Korrelationstests.
- Die Liste realer Namen in A-01 stammt aus meiner Durchsicht der 840 Kerne ohne Registerabgleich; sie ist eine Untergrenze. Ticker habe ich nicht gegen reale Börsenkürzel oder anstößige Kürzel abgeglichen.
- Realismus der Bankkonditionen nur auf Plausibilität betrachtet, nicht gegen Marktdaten.
- Reihenfolge- und Summationsrisiken in `market/domain` und `engine/domain` nur per Suche überflogen (Gegenstand von AP 7.1b und 7.1c).
- Die große Welt (TS §5.8) nur als Checkliste gelesen; keine Welt mit mehr als 200 Aktien erzeugt.
- `npm run test:calibration` nicht ausgeführt.
