# AP 7.1b – Modellreview: Marktmodell und Kalibrierung: Bericht Lauf Opus

Geprüft: Stand c1e2514, Datum 15.11.2026

Arbeitsordner mit allen Skripten und Rohdaten: `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1b-opus/`. Die Skripte rufen die Repo-Funktionen auf, bauen die Simulation des Labors nach (`createMarketContext`, `advanceMarket`, `SupportValues`) und laufen auf `calib-1` bis `calib-5`, jeweils über Epoche bis Spielstart + 100 Jahre, also 110,2 Jahre. Eine Drift-Prüfung lief zusätzlich auf 40 weiteren Seeds.

## Zusammenfassung

Die Mathematik des Marktmodells stimmt, und die Spezifikation beschreibt es genau. Nachgerechnet habe ich:

- die Brückenformel,
- die Drift-Korrekturen von Faktoren und `U_i`, also `E[e^F]` bzw. `E[e^U]` wachsen mit `m̄` bzw. `α·h + z·t`,
- die stationären Phasenanteile,
- die Beispieltabellen in §6.2, §6.4 und §6.5,
- die Annualisierung.

Über 40 Seeds hat die Langfristdrift keinen Bias. Die Kalibrierungs-Suite ist grün. Die Stylized Facts auf Indexebene sind realistisch: fette Schwänze, Volatilitäts-Cluster, negative Schiefe, höhere Korrelationen in Krisen, Equity-Premium von rund 4–5 Punkten über Tagesgeld.

Der wichtigste Befund ist eine Folge von E-22. Weil `U_i` zu seinem Zielpfad zurückkehrt und kein Unternehmen ausfällt, sind tiefe Verlierer verlässlich künftige Gewinner:

- Über 110 Jahre hat in keinem Seed auch nur eine Aktie eine Gesamtrendite unter 2,2 % p. a.
- Nach einem Drawdown von mindestens 90 % übertrifft eine Aktie den Weltindex im Mittel um 8–9 % p. a. (B-01).

Weitere Befunde mit sichtbaren Folgen:

- Einzelaktien zeigen fast kein Volatilitäts-Clustering (B-02).
- Die Kappung der Indizes gilt nur zur Epoche. Zum Spielstart liegen 46 von 80 gekappten Indizes über ihrer angezeigten Grenze, bis zum 2,2-Fachen (B-03).

Die Messvorschriften messen im Wesentlichen das Behauptete. Die Zählung der Bärenmärkte weicht aber von der üblichen Definition ab (B-04).

## Befunde

### B-01 Tiefe Verlierer erholen sich vorhersagbar, keine Aktie verliert langfristig (Rückkehr von `U_i` ohne Ausfälle)

- **Schwere:** hoch
- **Art:** Modellfehler
- **Bereich:** TS §6.4 „Langzeitverhalten“, E-22, R12; `src/app/market/domain/instrument-step.ts:111–122` (`reversionDecay · (U_close − μ_i)`), `default-market-config.ts` (`idioReversion: Math.LN2 / 10`)
- **Befund:** `U_i` kehrt mit 10 Jahren Halbwertszeit zu `μ_i(t)` zurück, und Unternehmen fallen nie aus. Eine Aktie mit großem Rückstand zum Zielpfad hat deshalb eine erwartete Mehrrendite von `θ · Abstand`. Bei −2,3 in Log (−90 %) sind das rund +16 % p. a. Log-Rendite.
  - Das ist das Gegenteil des realen Verhaltens. Bessembinder 2018 (aus dem Gedächtnis zitiert): Rund 57 % der US-Aktien von 1926 bis 2016 brachten über ihre Lebensdauer weniger als Geldmarktpapiere. Viele Werte nach einem Einbruch von 70 % und mehr erholen sich nie oder werden delistet. Notleidende Aktien rentieren real eher schlechter.
  - Im Spiel ist „Abgestürzte Aktien kaufen und halten“ eine einfache, verlässliche Strategie, die den Weltindex schlägt. Der Querschnitt ist zudem fast „unsterblich“.
  - Dazu kommt Long-Term-Reversal in allen Horizonten. Momentum gibt es nicht; real ist Momentum über 3–12 Monate eine der robustesten Anomalien.
- **Beleg:** alle Werte gemessen, Skripte im Arbeitsordner
  - `cross.ts` (Ergebnis `cross-100y.jsonl`), Gesamtrendite inklusive Dividenden, 5 Seeds:

    | Fenster   | Anteil mit negativer Rendite (Median der Fenster) | Anteil unter 2 % p. a. | Streuung im Querschnitt (Standardabweichung der Rendite p. a.) |
    | --------- | ------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
    | 10 Jahre  | 15–34 %                                           | 21–41 %                | 10 %                                                           |
    | 30 Jahre  | 1–15 % (Median 3 %)                               | 2,5–31 % (Median 6 %)  | 4,6 %                                                          |
    | 110 Jahre | **0 %** in allen Seeds                            | **0 %**                | 1,0–1,2 %                                                      |

    Die schlechteste Aktie über 110 Jahre erreicht je Seed +4,2 / +4,8 / +5,2 / +2,2 / +4,3 % Log-Rendite p. a.

  - `losers.ts` (`losers.txt`): Mehrrendite gegenüber dem Performanceindex Welt (Log p. a.), ausgewertet je Aktie und Monat, je nach Drawdown der Aktie vom eigenen Hoch:

    | Drawdown | Beobachtungen | Mehrrendite nach 1 Jahr | nach 3 Jahren | nach 5 Jahren | Anteil positiv nach 5 Jahren |
    | -------- | ------------- | ----------------------- | ------------- | ------------- | ---------------------------- |
    | alle     | 1.358.000     | −0,2 %                  | −0,2 %        | −0,1 %        | 49 %                         |
    | ≥ 50 %   | 586.572       | +2,5 %                  | +2,5 %        | +2,5 %        | 56 %                         |
    | ≥ 80 %   | 177.836       | +5,8 %                  | +5,7 %        | +5,7 %        | 62 %                         |
    | ≥ 90 %   | 68.320        | +8,7 %                  | +8,6 %        | +8,2 %        | 66 %                         |
    | ≥ 95 %   | 25.293        | +11,2 %                 | +11,3 %       | +10,7 %       | 68 %                         |

  - Reversal (`cross.ts`): Rangkorrelation zwischen vergangener und künftiger Rendite.

    | Horizont (vergangen / künftig) | Rangkorrelation | Verlierer-Quintil minus Gewinner-Quintil |
    | ------------------------------ | --------------- | ---------------------------------------- |
    | 1 / 1 Jahr                     | −0,01 bis −0,03 | +0,6 bis +3,7 % p. a.                    |
    | 5 / 5 Jahre                    | −0,11 bis −0,15 | +5,3 bis +7,2 % p. a.                    |
    | 10 / 10 Jahre                  | −0,23 bis −0,25 | +6,7 bis +7,6 % p. a.                    |

  - Hinweis: Im Mittel lagen 23 % aller Aktien-Monate mindestens 70 % unter dem eigenen Hoch. Der Median des größten Drawdowns einer Aktie liegt bei 91–95 %. Tiefe Einbrüche sind also häufig, enden aber immer in der Erholung.
- **Vorschlag:** Den unternehmensspezifischen Anteil in einen permanenten Teil (Random Walk) und einen vorübergehenden Teil (OU mit `θ`) aufteilen. Alternativ `θ` deutlich schwächen. Die Konzentration der Indizes besser über Neugewichtung (Stufe 2) und den Lebenszyklus der Instrumente begrenzen (E-40, Insolvenzen in M9), statt über eine Rückkehr jeder Einzelaktie. Bis dahin das Verhalten in TS §6.4 und R12 als bekannte Grenze dokumentieren. In die Kalibrierung zur Information aufnehmen:
  - die Mehrrendite nach einem Drawdown von mindestens 80 %, Ziel ≤ 0,
  - den Anteil der Aktien unter Geldmarktrendite über 30 Jahre,
  - die Rangkorrelation 5/5 Jahre.
- **Folgen einer Änderung:**
  - bricht den Golden Master und braucht eine neue `SIM_VERSION`; bestehende Spieler sind gesperrt,
  - neu kalibrieren: Top 5, Anteil unter 1 €, Kursuntergrenze und Volatilität der 10-Jahres-Fenster hängen an `θ`,
  - Aufwand M (Parameterweg) bis L (Aufteilung von `U` oder Insolvenzen),
  - Entscheidung des PO nötig, weil E-22 berührt ist.

### B-02 Einzelaktien zeigen kaum Volatilitäts-Clustering, die unternehmensspezifische Volatilität ist in Krisen unverändert

- **Schwere:** mittel
- **Art:** Modellfehler / Testlücke
- **Bereich:** TS §6.4 (σ_i konstant: „Eine Skalierung mit der Marktvolatilität des Tages ist vorgesehen, aber nicht umgesetzt“), TS §6.9 (Cluster-Ziel nur für den Weltindex); `instrument-step.ts:40,110–121`
- **Befund:**
  - σ_i ist konstant, Sprünge kommen aus einem homogenen Poisson-Prozess. Clustering entsteht nur über die Faktoren. Bei Mid und Small Caps tragen Diffusion und Sprünge des Unternehmens den größten Teil der Varianz, deshalb fehlt dort das Clustering fast ganz.
  - Real ist es auch bei Einzelaktien deutlich: ACF der absoluten Tagesrenditen bei Lag 1 in der Größenordnung 0,1–0,25, langsam abklingend (Cont 2001; die Größenordnung ist aus dem Gedächtnis zitiert und ungeprüft).
  - In realen Krisen steigt auch die unternehmensspezifische Volatilität etwa auf das Doppelte.
  - Das Kalibrierungsziel `clustering-lag1` misst nur den Kursindex Welt und sieht diese Lücke deshalb nicht.
- **Beleg:** `misc.ts` (`misc.txt`), 110 Jahre, Mediane der Aktien:

  | Seed    | Größe | ACF(r², 1) | ACF(\|r\|, 1) | ACF(\|r\|, 20) |
  | ------- | ----- | ---------- | ------------- | -------------- |
  | calib-1 | Small | 0,001      | 0,006         | 0,006          |
  | calib-1 | Mid   | 0,008      | 0,018         | 0,015          |
  | calib-1 | Large | 0,059      | 0,049         | 0,036          |
  | calib-3 | Small | 0,001      | 0,007         | 0,005          |
  | calib-3 | Mid   | 0,010      | 0,021         | 0,015          |
  | calib-3 | Large | 0,081      | 0,059         | 0,046          |

  Über alle Aktien liegt ACF(r², 1) im Median der Seeds bei 0,010 (`facts-100y.json`, `stocks.medAcfR2_1`). Zum Vergleich der Weltindex: 0,25 bei Lag 1, 0,18 bei Lag 20 (`world.acfR2`).

- **Vorschlag:** Die in TS §6.4 vorgesehene Skalierung umsetzen. Zum Beispiel `σ_i,t = σ_i · (s_Welt,t / s̄_Welt)^φ` mit φ ≈ 0,5, normiert auf das Varianzbudget, mit angepasstem Kompensator `v_i`. Die Sprungintensität optional ebenso skalieren. Ein Ziel oder eine Info-Zeile „Median der Aktien, ACF(|r|, 1)“ aufnehmen.
- **Folgen einer Änderung:**
  - neue `SIM_VERSION`, Golden Master bricht,
  - neu kalibrieren: Korrelationen in Krisen sinken (heute 0,68 gegen 0,27 im Aufschwung), die Korrelationsziele liegen schon an ihrer Grenze, Kurtosis der Aktien,
  - Aufwand M.

### B-03 Kappung nur zur Epoche: zum Spielstart überschreiten 46 von 80 gekappten Indizes ihre angezeigte Grenze

- **Schwere:** mittel
- **Art:** Modellfehler (sichtbare Unstimmigkeit)
- **Bereich:** TS §5.5, §6.6 „Kursindex“; `src/app/market/domain/index-layout.ts:56–58` (`cappingFactors` mit Startkursen); `market/ui/instrument-profile/instrument-profile.component.html:90–93` (zeigt `capWeight`); Abfrage `instrumentComposition` (TS §8.2, zeigt Gewichte)
- **Befund:**
  - Die Kappung wird mit den Startkursen zur Epoche berechnet, also 10,25 Jahre vor dem Spielstart, und danach nie angepasst.
  - Zum Spielstart zeigt das Indexprofil zum Beispiel „Kappung 15 %“. Die Zusammensetzung derselben Seite zeigt dagegen einen Wert mit 32 %.
  - Nach 100 Jahren erreichen Sektorindizes mit „25 %“ Einzelgewichte von 54–69 %.
  - Die Neugewichtung ist für Stufe 2 vermerkt. Dass die Grenze schon zum Spielstart verletzt ist, steht nicht in der TS.
- **Beleg:** `caps.ts` (`caps.txt`), 5 Seeds:
  - Zur Epoche halten alle gekappten Indizes ihre Grenze; der Algorithmus ist korrekt.
  - Zum Spielstart liegen 46 von 80 darüber; Verhältnis größtes Gewicht zu Grenze im Median 1,10, höchstens 2,16. Beispiele:
    - `calib-5` `idx-0005` (Leitindex, Grenze 15 %): 32,4 %,
    - `calib-5` `idx-0017` (Sektor, 25 %): 46,3 %,
    - Dividendenindex (10 %): 12 %.
  - `misc.ts` nach 100 Jahren: `calib-1` `idx-0016` (Sektor, 25 %) mit 69 %, `idx-0011` mit 46 %.
- **Vorschlag:** Entweder die Kappung zum Spielstart berechnen; Indizes wirken nicht auf Aktienkurse zurück, `D` und der Startwert zur Epoche lassen sich so weiter setzen. Oder vierteljährlich neu kappen und den Divisor anpassen (vorgezogener Teil von US-MK-16). Mindestens im Profil „Kappung bei Auflage“ statt einer gültigen Grenze anzeigen.
- **Folgen einer Änderung:**
  - Kappung zum Spielstart: ändert Index-, Performanceindex- und ETF-Kurse sowie R und Topf, damit Golden Master und `SIM_VERSION`; die Aktienkurse bleiben, die Kalibrierung ist kaum betroffen (Top 5 des Weltindex ist ungekappt), Aufwand S–M,
  - Neugewichtung: Aufwand M–L,
  - nur Anzeige: Aufwand S, keine `SIM_VERSION`.

### B-04 Die Zählung der Bärenmärkte weicht von der üblichen Definition ab, das Ziel hängt an der Messvorschrift

- **Schwere:** niedrig
- **Art:** Abweichung Doku↔Realität der Messvorschrift
- **Bereich:** TS §6.9, Zeile „Bärenmärkte“; `lab-statistics.ts` (`drawdownEpisodes(sample.worldTotalReturn, 0,2)`); `analysis/domain/drawdown-logic.ts:28–46`
- **Befund:** Das Ziel „einer alle 5–8 Jahre“ (0,125–0,2) stammt der Formulierung nach aus Statistiken über Kursindizes (S&P 500, MSCI World). Diese zählen einen Bärenmarkt meist von −20 % vom Hoch bis zu einer Erholung von +20 % vom Tief. Die Messung macht zwei Dinge anders:
  1. Sie nimmt den Performanceindex.
  2. Eine Episode endet erst mit einem neuen Hoch. Mehrere Einbrüche ohne neues Hoch zählen deshalb einmal.

  Nur mit dieser Kombination liegt der Median im Band. Der Kursindex mit derselben Episodendefinition läge darunter. Die übliche Zählung ergibt rund das Doppelte, etwa wie der S&P 500 seit 1928 (rund 26 Bärenmärkte in rund 95 Jahren, also rund 0,27; aus dem Gedächtnis), aber deutlich über der Nachkriegszeit (rund 0,15).

- **Beleg:** `facts.ts`, `bear.ts` (`facts-100y.json`, `bear.txt`), 110 Jahre:

  | Messung                                  | Median   | Spanne    | Band     |
  | ---------------------------------------- | -------- | --------- | -------- |
  | Performanceindex, Episode bis neues Hoch | 0,145/J. | –         | im Band  |
  | Kursindex, Episode bis neues Hoch        | 0,118/J. | –         | darunter |
  | übliche Definition, Kursindex            | 0,29/J.  | 0,21–0,33 | darüber  |
  | übliche Definition, Performanceindex     | 0,27/J.  | –         | darüber  |

  Die mittlere Tiefe liegt bei 36 %, vom Hoch zum Tief dauert es im Mittel 529 Markttage, die längste Erholung 12–18 Jahre. Das ist plausibel.

- **Vorschlag:** In TS §6.9 Quelle und Definition des Ziels nennen. Entweder das Ziel an die gewählte Definition anpassen (Entscheidung des PO) oder die übliche Definition auf den Kursindex messen und das Band danach ausrichten. Die jeweils andere Zählung als Info-Zeile führen.
- **Folgen einer Änderung:** nur Messung und Doku. Kein Golden Master, keine `SIM_VERSION`; das Band ist eine Entscheidung des PO. Aufwand S.

### B-05 Kursniveaus ohne Splits über Jahrzehnte unhandlich, Float32-Kerzen verlieren dann Cent-Genauigkeit

- **Schwere:** niedrig
- **Art:** Modellfehler (bekannte Grenze) / Implementierungsfehler am Rand
- **Bereich:** TS §6.4 „Aktiensplits (Stufe 2)“, TS §6.8 „Speicherung“ (`Float32Array`); `engine/data-access/worker/daily-candles.utils.ts:58`
- **Befund:** Ohne Splits steigen die Kurse über lange Spiele stark (Tabelle unten). Bei Banken ohne Bruchstücke werden einzelne Aktien damit unerschwinglich. Gespeicherte Tages- und Wochenkerzen sind `Float32` mit rund 7,2 signifikanten Stellen. Oberhalb von rund 83.000 € (Index ebenso, Basis 1.000) zeigt die OHLC-Anzeige im Tageschart deshalb andere Cent-Werte als Kurs und Quote. Bei 3,5 Mio. € beträgt die Rasterweite von `Float32` 0,25 €.
- **Beleg:** `bear.ts` (`bear.txt`), 5 Seeds:

  | Zeitpunkt   | Median-Kurs  | Höchstkurs         | Anteil über 1.000 € | Anteil über 10.000 €              |
  | ----------- | ------------ | ------------------ | ------------------- | --------------------------------- |
  | Spielstart  | 24–88 €      | –                  | –                   | –                                 |
  | + 50 Jahre  | 194–995 €    | –                  | 18–48 %             | –                                 |
  | + 100 Jahre | 412–48.109 € | 74.054–3.488.878 € | –                   | 4–80 % (in 4 von 5 Seeds 29–80 %) |

  `Math.fround(3488878.31)` ergibt 3488878,25 (eigene Rechnung: ulp = 2^21 · 2^−23 = 0,25).

- **Vorschlag:** Splits mit US-MK-16 (M9) einplanen und dort ein Ziel für die Kursspanne setzen. Bis dahin ab einer Kursschwelle `Float64` für Kerzen erwägen oder die Grenze in TS §6.8 dokumentieren.
- **Folgen einer Änderung:**
  - Splits: Lebenszyklus in M9, Aufwand L,
  - `Float64`-Kerzen: verdoppeln den Speicher (TS §9.6), brauchen eine Migration des Stores `candles`, aber keine `SIM_VERSION`; Aufwand M.

### B-06 Dividenden folgen dem Kurs eins zu eins, die Dividendenrendite ist nie antizyklisch

- **Schwere:** niedrig
- **Art:** Modellfehler (vereinfachte Annahme)
- **Bereich:** TS §6.5 „Höhe“; `dividend-logic.ts` (`dividendCents`), `instrument-step.ts:140–147`
- **Befund:** Der Betrag ist Zielrendite × letzter Schlusskurs ÷ Frequenz. Die Zielrendite ist eine glatte Funktion der Zeit.
  - Dividendeneinkommen schwankt dadurch so stark wie der Kurs: −50 % Kurs bedeutet −50 % Dividende ab der nächsten Ankündigung.
  - Die Dividendenrendite des Index steigt in Krisen nicht.
  - Real sind Dividenden geglättet (Lintner): Der S&P 500 verlor 2008/09 rund 50 % Kurs, aber rund 20 % Dividende (aus dem Gedächtnis). Die Rendite steigt in Krisen.
  - Für das Spiel (Einkommensstrategien, Sparpläne, Dividenden-Kalender) ist das sichtbar. Die TS vermerkt es nur als Stufe-2-Ausbau („Kürzungen in Krisen“).
- **Beleg:**
  - Konstruktion: `dividendCents(dividendYieldAt(…), f, priceFromLog(state.logClose))`.
  - Eigene Rechnung: Bei konstantem `y(t)` gilt `D / P_Ankündigung = y/f`, unabhängig vom Kursverlauf.
- **Vorschlag:** Mit dem Fachkonzept von M9 oder M10 einen geglätteten Dividendenpfad einführen, etwa Dividende ← Dividende + λ · (Ziel × Kurs − Dividende) mit λ ≈ 0,3 je Zahlung. Der erwartete Abschlag im Zielpfad `D_i` muss dann neu hergeleitet werden.
- **Folgen einer Änderung:** neue `SIM_VERSION`; Dividendenrendite des Weltindex, Maximum der Aktien und Langzeit-Fenster neu kalibrieren. Aufwand M.

### B-07 Regionalindizes sind ohne Ziel: 20 % Volatilität und in jedem Seed ein Einbruch von 75–86 %

- **Schwere:** niedrig
- **Art:** Testlücke / Modellhinweis
- **Bereich:** TS §6.9 (nur der Weltindex hat Volatilitäts- und Drawdown-Größen), `calibration-targets.ts`
- **Befund:** Spieler vergleichen vor allem mit den breiten Regionalindizes (Leitindex-Gefühl). Deren Volatilität liegt über 110 Jahren bei 19,8 % (Nordamerika), 20,3 % (Europa) und 20,4 % (Asien-Pazifik), täglich wie monatlich gemessen.
  - Der größte Drawdown liegt im Median bei 82 % (Nordamerika, Spanne 75–86 %), 76 % (Europa) und 75 % (Asien-Pazifik).
  - Real hat der breite US-Markt seit 1926 rund 16–19 % Volatilität (je nach Zeitraum) und genau einen Einbruch dieser Größe (1929–32, −86 %). Europa und Japan liegen bei rund 18–22 %.
  - Die Werte sind also an der oberen Grenze, aber nicht abwegig. Es fehlt aber eine Info-Zeile, damit Modelländerungen hier nicht unbemerkt driften.
- **Beleg:** `facts.ts` (`facts-100y.json`, `regions.*`); Lag-1-Autokorrelation der Regionalindizes −0,01 bis +0,01 (gut).
- **Vorschlag:** Info-Zeilen für Volatilität und größten Drawdown der breiten Regionalindizes in `CALIBRATION_TARGETS` aufnehmen. Über ein Band entscheidet der PO.
- **Folgen einer Änderung:** nur Labor und Tests. Kein Golden Master, keine `SIM_VERSION`. Aufwand S.

### B-08 Der Weltindex hat eine Lag-1-Autokorrelation von 0,17, das tägliche Volatilitätsziel misst eine geglättete Reihe

- **Schwere:** Hinweis
- **Art:** Verbesserung (Messvorschrift)
- **Bereich:** TS §6.9 „Weltindex, Volatilität“ und „Zielkonflikt im Vorlauf“; `lab-statistics.ts` (`worldReturnMeasures`)
- **Befund:**
  - Der Schluss des Weltindex mischt die Schlüsse von Asien-Pazifik (07:00), Europa und Nordamerika. Asien holt am Folgetag nach, was nach seinem Schluss passiert ist. Daraus entsteht eine Lag-1-Autokorrelation der Tagesrenditen von 0,17 (0,12–0,22). Beim Schwellenländerindex sind es 0,12.
  - Das gibt es auch bei realen Weltindizes (asynchrone Schlüsse). Es ist nicht ausnutzbar, weil ETFs mit dem indikativen NAV handeln.
  - Folge für die Kalibrierung: Das Ziel 14–18 % wird mit Tagesrenditen gemessen (Median 14,8 % über 110 Jahre, 14,2 % im Vorlauf, knapp über der Grenze). Die eigentliche Schwankung liegt bei 17–18 %.
  - Kurtosis und Cluster messen dieselbe geglättete Reihe. Die TS beschreibt den Effekt, nennt aber die Autokorrelation nicht.
- **Beleg:** `facts.ts`:

  | Größe                                   | Wert                               |
  | --------------------------------------- | ---------------------------------- |
  | Volatilität aus Tagesrenditen           | 14,8 %                             |
  | Volatilität aus Wochenrenditen          | 16,3 %                             |
  | Volatilität aus Monatsrenditen          | 17,2 %                             |
  | Volatilität aus Jahresrenditen          | 18,0 %                             |
  | Autokorrelation `acfR`, Lags 1/2/3/5/10 | 0,17 / 0,00 / −0,00 / 0,00 / −0,01 |

  Ein Varianzverhältnis Monat zu Tag von (17,2 / 14,8)² = 1,35 entspricht rund 2 · ρ_1 bei ρ_1 ≈ 0,17.

- **Vorschlag:** Die Volatilität des Weltindex zusätzlich auf Wochen- oder Monatsrenditen messen, als Info oder als eigentliches Ziel (PO). Die Autokorrelation als Info-Zeile führen.
- **Folgen einer Änderung:** nur Messung. Aufwand S.

### B-09 Gemessene Kennzahlen der TS stammen von Seeds mit überdurchschnittlicher Rendite; Angaben zum Weltfaktor sind leicht zu hoch

- **Schwere:** Hinweis
- **Art:** Abweichung Doku↔Code (Zahlenangaben)
- **Bereich:** TS §6.2 (Absatz unter der Parametertabelle: „Phasen und stochastische Volatilität … auf rund 14,5 % realisierte Volatilität“), TS §6.3 („Gemessen über 110 Jahre sind es 6,9 %“), TS §6.4 („gemessen über 110 Jahre 1,9 %“)
- **Befund:** Über 40 eigene Seeds (`drift-1` bis `drift-40`, 110 Jahre) liegen die Werte unter denen der TS:

  | Größe                              | 40 Seeds (Mittel ± Standardfehler) | Angabe der TS bzw. `calib`-Median |
  | ---------------------------------- | ---------------------------------- | --------------------------------- |
  | Log-Wachstum des Weltfaktors       | 6,10 % ± 0,21                      | 6,9 %                             |
  | Erwartung `m − ½E[s²]`             | 6,02 % (6,88 − 0,87)               | –                                 |
  | RMS-Volatilität des Weltfaktors    | 13,2 % (`√(2 · 0,0087)`)           | 14,5 %                            |
  | Performanceindex Welt, Log         | 6,47 % ± 0,24                      | –                                 |
  | Performanceindex Welt, geometrisch | 6,7 %                              | 7,3 % (`calib`-Median)            |
  | Steigung `ḡ_Welt − r_z`            | rund 1,1 %                         | 1,9 %                             |
  - Das Modell hat also keinen Bias: Messung und Erwartung stimmen auf 0,1 Punkte überein.
  - Die TS-Zahlen und die fünf Kalibrierungs-Seeds liegen aber rund 0,6–0,8 Punkte über dem Mittel der Grundgesamtheit.
  - Eigene Rechnung der stationären Phasenanteile: 40,2 / 34,9 / 17,1 / 7,9 %, mittlerer Trend 6,92 %, ½·E[s²] = 0,95 % bei lognormaler Volatilität. Das stimmt mit TS §6.3 überein.

- **Beleg:** `drift.ts` (`drift.txt`); Rechnung im Abschnitt „Geprüft“.
- **Vorschlag:** Die Angaben in TS §6.2, §6.3 und §6.4 als Werte der fünf Kalibrierungs-Seeds kennzeichnen und die Erwartung (6,0 % Log-Wachstum, rund 13 % Volatilität des Weltfaktors) daneben stellen.
- **Folgen einer Änderung:** nur Doku. Aufwand S.

### B-10 Geringe Trennschärfe der Langzeitziele im Median von fünf Seeds

- **Schwere:** Hinweis
- **Art:** Testlücke
- **Bereich:** TS §6.9 „Prüfregel“, E-34; `calibration-targets.calibration.spec.ts`
- **Befund:** Ein einzelner Seed streut über 110 Jahre bei der Rendite des Performanceindex Welt mit rund 1,5 Punkten Standardabweichung (`drift.txt`: sd 0,0154). Der Median von fünf Seeds streut deshalb um rund 0,8 Punkte.
  - Das Band 6–8 % ist 2 Punkte breit. Eine systematische Verschiebung um ±1 Punkt fällt so mit erheblicher Wahrscheinlichkeit nicht auf.
  - Umgekehrt kann eine unschädliche Änderung durch Seed-Rauschen rot werden.
  - Bei den Bärenmärkten ist die Streuung ähnlich groß: 10 bis 23 Episoden je Seed.
  - Da die Suite festen Seeds folgt, ist das deterministisch, prüft aber eher „unverändert“ als „im Ziel“.
- **Beleg:** `drift.txt`; Spannen in `facts-100y.json` (`world.trGeo` 4,7–9,6 %, `bear.trCount` 10–23).
- **Vorschlag:** Für die Langzeitziele (Rendite, Bärenmärkte) zusätzlich einen günstigen Lauf über mehr Seeds vorsehen, etwa 20–40 Seeds im Verify-Workflow. Die nötigen Größen brauchen nur `advanceMarket` und `SupportValues`, rund 5 s je Seed und 110 Jahre ohne Aktienrenditen. Oder den Standardfehler in der TS nennen.
- **Folgen einer Änderung:** nur Tests. Aufwand S–M.

## Geprüft und in Ordnung

- **Kalibrierungs-Suite** `npm run test:calibration`: 6 Dateien und 79 Tests grün, 80 s (`calibration.log`). Brücke gegen Referenz: Minutenvolatilität 0,2090/0,2090 und 0,3800/0,3804, Korrelation 0,2600/0,2604.
- **Brückenformel** (TS §6.1, `bridge-logic.ts`): Bedingte Verteilung von `X_(j+1)` bei gegebenem `X_j` und `X_b` hergeleitet, also Mittel `v_j/R_j · (X_b − X_j)` und Varianz `v_j(R_j − v_j)/R_j`. Stimmt. Der Endpunkt wird gesetzt, und mit `last < n` werden die Werte Minute für Minute gefüllt, also bitgleich mit der ganzen Kurve.
- **Drift-Korrektur der Faktoren** (`factor-step.ts`): Mit `X = F − p`, `dX = (m − m̄ − ½(s² − s̄²)γ − θX)dt + s dW` gilt Var X = s²·g(t) und damit `E[e^F] = e^{m̄t}`. Weltfaktor (θ = 0, γ = 1) mit `m − ½s²`. Stimmt; über 40 Seeds weicht das Log-Wachstum nur um +0,08 Punkte von `m − ½E[s²]` ab.
- **Drift-Korrektur von `U_i`** (`instrument-step.ts`, `idio-path-logic.ts`): Inkrement von `m_i(t)` mit −½·v·Δg und Sprungkompensator −λΔμ_J. Der Rest dritter Ordnung für Small Caps (λ = 6, σ_J = 14 %) ist eigene Rechnung: λ · (E[e^J] − 1 − (μ + ½(μ² + σ²))) ≈ −0,03 % p. a. Das passt zur TS-Angabe „< 0,05 %“.
- **Beispieltabelle §6.4** nachgerechnet: Zeilen 3, 8 und 9 (`g = 6,526209`, `m = −0,062354 / 0,081916 / −2,401856`) stimmen.
- **Beispieltabelle §6.5** nachgerechnet: Zeile 2 (`ỹ_0 = 0,0618754`, `ỹ(10) = 0,0530233`, `D(10) = 0,572452`, `y = 5,1642 %`) stimmt.
- **Beispiele §6.2** zur Aktivität der Regionsfaktoren: Nordamerika 78,79 % und Schwellenländer 41,11 % (Nenner 501,75) stimmen.
- **Phasenkette** (TS §6.3):
  - Stationäre Zeitanteile über die eingebettete Kette berechnet: 40,2 / 34,9 / 17,1 / 7,9 %.
  - 30,0 % der Wechsel führen in eine Krise, also eine Krise alle 5,07 Jahre.
  - P(Krise > 1 Jahr) = e^−2,5 = 8,2 %, also eine von zwölf.
  - Halbwertszeit des Trends ln 2/3 = 2,77 Monate.
  - Gemessen über 110 Jahre: Krisenanteil 9,2 % im Median, 8,0 % über 40 Seeds; mittlere Krisendauer 0,42 Jahre.
- **Parameter:** Tabelle §6.2 und Phasentabelle §6.3 gegen `DEFAULT_MARKET_CONFIG` verglichen; alle Werte gleich.
- **Stylized Facts Weltindex** (110 Jahre, Median der 5 Seeds; Literaturwerte aus dem Gedächtnis):

  | Eigenschaft                               | Messung                                                                                   | Einordnung                                                                       |
  | ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
  | Kurtosis Tag / Woche / Monat              | 7,5 / 7,8 / 7,6                                                                           | fette Schwänze; kaum Aggregationsnormalität wegen der Phasen, wie 1926–2020 real |
  | Schiefe Tag / Monat                       | −0,11 / −0,57                                                                             | –                                                                                |
  | ACF(r²) bei Lag 1, 20, 100, 250           | 0,25; 0,18; 0,08; 0,01                                                                    | realistisch, nur der lange Abfall ist etwas kurz                                 |
  | Leverage-Effekt corr(r_t, r²_(t+k))       | −0,05 bis −0,03                                                                           | schwach, aber vorhanden                                                          |
  | Autokorrelation der Monatsrenditen        | 0,04                                                                                      | –                                                                                |
  | Korrelation Large Caps einer Region       | Krise 0,68, Aufschwung 0,27, gesamt 0,39                                                  | Korrelation steigt in Crashs                                                     |
  | Größter Drawdown Performance- / Kursindex | 73 % / 78 %                                                                               | –                                                                                |
  | Equity-Premium                            | Performanceindex Welt 6,7 % geometrisch (40 Seeds), arithmetisch 8,8 %, Tagesgeld 1,5–3 % | rund 4–5 Punkte, realistisch                                                     |

- **Einzelaktien:**
  - Lag-1-Autokorrelation der Tagesrenditen im Median 0,000.
  - Kurtosis 7,3; ohne Dividendenabschläge 7,3. Die Abschläge verfälschen Kurtosis und Overnight-Anteil also nicht (27,0 % roh, 26,9 % bereinigt).
- **Messvorschriften** (`lab-statistics.ts`, `market-sample.ts`, `long-term-statistics.ts`, `intraday-statistics.ts`):
  - Kurtosis nicht als Exzess (Normalverteilung 3), Volatilität × √261, Jahre = Tagesrenditen ÷ 261.
  - Overnight-Anteil als Var(on)/Var(cc).
  - Dividendenrendite des Index als Zuwachs von `ln(TR/Kurs)`.
  - Top 5 mit `n_i · P_i`.
  - Rollierende Fenster um 261 Tage verschoben.
  - Zuordnung im Tagesprofil `⌊(j − 1) · 13/L⌋` passend zur Brücke (Gewicht der Minute j − 1).
  - Korrelation als gepoolter Mittelwert der Paare.
  - Alles stimmt mit TS §6.9 überein.
- **Indizes:**
  - `cappingFactors` hält die Grenze zur Epoche (`caps.txt`, Spalte „epoch max“).
  - `stepIndices`: `R ← R · I_ref/(I_ref − Punkte)` mit abnehmendem `I_ref` über die Stützpunkte, wie in TS §6.6.
  - Eröffnung des Index mit `prevLogClose` für Werte, deren Börse später öffnet.
- **ETFs:** `k ← k · (1 − TER/365)^n · (1 + σ_T ε)` erwartungstreu. Der Log-Bias von −½σ_T² ist vernachlässigbar (< 10⁻⁵ p. a.). Topf `+= k · Punkte`, Ausschüttung auf Cent abgerundet vor den Dividenden desselben Stützpunkts.
- **Spreads und Preisraster:**
  - `bidAsk` rundet ab bzw. auf, mit mindestens einem Rasterschritt und `toPrecision(15)` gegen Gleitkomma-Fehler beim Abrunden.
  - `spreadVolFactor` zwischen 1 und 3. Die Obergrenze wird an 32 % der Krisentage und an 3,3 % aller Tage erreicht.
  - Der relative Mindestspread springt an den Rastergrenzen (bei 10 € von 0,01 % auf 0,1 %); bei den Basisspannen ist das unkritisch.
- **Langzeitgrenzen:** Top 5, Anteil unter 1 € und an der Untergrenze liegen im Median deutlich in den Grenzen. Unter 1 € und an der Untergrenze stehen nach 100 Jahren bei 0 %; jemals unter 1 € waren 0–8 % der Aktien. Zum Verhalten dahinter siehe B-01.

## Nicht geprüft / Grenzen

- **Literaturwerte:** Bessembinder, Cont, S&P-Bärenmärkte und Dividenden 2008/09 sind aus dem Gedächtnis zitiert, nicht nachgeschlagen. Die Befunde stützen sich auf die eigenen Messungen; die Literatur dient nur zur Einordnung.
- **Minutenebene:** Tagesprofil, Brücke gegen Referenz und Tagesspanne habe ich nur über die grüne Suite und den Code geprüft, nicht mit eigenen Minutenläufen nachgemessen.
- **Kerzen:** Die Kerzen-Aggregation (`candle-logic.ts`, `candle-consolidation-logic.ts`) habe ich nur gelesen. Tests und Grenzfälle der Verdichtung über den Jahreswechsel habe ich nicht nachgerechnet; geprüft habe ich nur die `Float32`-Genauigkeit (B-05).
- **Indikative Werte und ETF-Kurven:** nicht im Detail. Am Wochenende indikativ, NAV aus `DayCurves.indicativeCurve`, Bitgleichheit von Eröffnung und Schluss: nur über die vorhandenen Tests.
- **Korrelationen:** zwischen den Regionalindizes und die Korrelationsmatrix je Sektor nicht ausgewertet.
- **Bewusst ausgelassen** (nicht Gegenstand dieses AP): Determinismus der Ströme und Weltgenerierung (TS §4, §5), Performance.
- **Grundlage der Messung:** Alle Messungen über Epoche bis Spielstart + 100 Jahre mit den Funktionen des Labors, aber eigenem Sammeln der Werte. Die Werte der Suite (z. B. Bärenmärkte 0,145, Performanceindex Welt 7,27 %) stimmen damit überein; die Nachbildung ist also konsistent.
