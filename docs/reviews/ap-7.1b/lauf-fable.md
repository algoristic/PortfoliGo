# AP 7.1b – Modellreview: Marktmodell und Kalibrierung: Bericht Lauf Fable 5.2

Geprüfter Stand: c1e2514 · Datum: 15.11.2026

Arbeitsordner mit Skripten und Rohdaten: `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1b-fable/` (im Folgenden `W/`).

## Zusammenfassung

Formeln, Beispieltabellen und Code des Marktmodells stimmen überein. Die Driftkorrektur −σ²/2, die Brücke, die Phasenkette und alle Tabellen in TS §6.2–§6.5 habe ich unabhängig nachgerechnet, ohne Abweichung. Die Kalibrierungs-Suite ist grün (79 Tests). Die Stylized Facts des Weltindex (fette Ränder, Volatilitäts-Cluster mit langem Gedächtnis, negative Schiefe, Bärenmärkte, Dividendenrendite) sind über 25 Seeds realistisch.

Der wichtigste Befund ist ein Modellfehler mit Spielwirkung: Die Rückkehr von `U_i` zum Zielpfad (E-22) macht die Log-Kurse stationär und erzeugt damit eine Prämie für diversifizierbares Risiko von rund ½·v_i p. a. Ein gleichgewichteter, jährlich umgeschichteter Korb aller Aktien schlägt den Weltindex in allen 25 Seeds um rund 7 Prozentpunkte p. a., ein Small-Cap-Korb um 13 Punkte. 94 % zufälliger 20-Aktien-Depots schlagen den Index über die ersten zehn Spieljahre. Die Aussage in TS §6.4, riskantere Werte rentierten „nicht mehr systematisch schlechter“, stimmt nur für Kaufen und Halten ab der Epoche.

Zweitens ist die Kalibrierung an fünf Seeds angepasst, deren Vorlauf doppelt so viel Krisenzeit hat wie typisch. Auf 20 frischen Seeds liegt die Indexvolatilität im Median bei 13,4 % und damit unter dem Band. Drittens fehlen Stylized Facts dort, wo kein Ziel misst: Einzelaktien haben praktisch kein Volatilitäts-Clustering, und die Regionen sind zu schwach korreliert.

## Befunde

### B-01 Rückkehr zum Zielpfad (E-22) erzeugt eine Prämie für diversifizierbares Risiko: Gleichgewichtung und Verlierer-Strategie schlagen den Index deutlich

- **Schwere:** hoch
- **Art:** Modellfehler
- **Bereich:** TS §6.4 (Langzeitverhalten, Kompensator), §6.2 (Rückkehr der Unterfaktoren), E-22, R12; `src/app/market/domain/instrument-step.ts:103-117`, `idio-path-logic.ts:18-32`
- **Befund:**
  - Der Kompensator `−½·v_i·g(t)` hält `E[e^{U_i(t)}]` ab der Epoche konstant. `g(t)` sättigt aber (`g → 1/(2θ)`), die laufende Korrektur `−½·v_i·e^{−2θt}` klingt also ab: nach 10 Jahren (Spielstart) sind noch 25 % übrig, nach 30 Jahren 1,6 %.
  - Im eingeschwungenen Zustand ist `U_i` stationär. Dann gilt für die mittlere einfache Rendite über einen Zeitraum h: `E[e^{U(t+h) − U(t)}] = exp(v/(2θ)·(1 − e^{−θh}))`, für ein Jahr also rund `e^{v/2}`. Jede Aktie hat damit eine erwartete arithmetische Jahresrendite von rund ½·v_i über der des Index: Large Caps rund +2 %, Mid Caps rund +6 %, Small Caps rund +12 %.
  - Der kapitalgewichtete Index bekommt diese Prämie nicht: Sein Gewicht ist proportional zu `e^{U}`, er hält also die Werte über ihrem Zielpfad über und die darunter unter.
  - Folgen für den Spieler: Jedes breit gestreute Aktiendepot mit gelegentlichem Umschichten schlägt den Welt-ETF deutlich, „Verlierer kaufen“ ist eine dominante Strategie, und die Kernaussage einer Finanzsimulation (breiter, billiger Index ist schwer zu schlagen) kehrt sich um. Die Wirkung ist schon in den ersten Spieljahren voll da.
  - TS §6.4 behauptet, Sprünge und Diffusion erzeugten „nur Risiko und Schiefe“ und riskantere Werte rentierten „nicht mehr systematisch schlechter“. Gemessen rentieren sie systematisch besser, je riskanter, desto mehr.
- **Beleg:** Skripte `W/facts3.ts` (Strategien), `W/facts2.ts` (Reversal nach Epochen), `W/facts.ts`; 25 Seeds (`calib-1…5`, `rev-b-1…20`), Epoche bis Spielstart + 100 Jahre, Standardkonfiguration, Dividenden wiederangelegt, ohne Kosten und Steuern.

  Annualisierte Log-Rendite ab Spielstart, Mittel der 25 Seeds:

  | Strategie                                               | 10 Jahre | 30 Jahre | 100 Jahre | Seeds über dem Index (100 J.) |
  | ------------------------------------------------------- | -------- | -------- | --------- | ----------------------------- |
  | Weltindex (Performanceindex)                            | 5,2 %    | 6,5 %    | 6,8 %     | –                             |
  | alle 200 Aktien gleichgewichtet, jährlich umgeschichtet | 11,9 %   | 13,7 %   | 14,0 %    | 25 / 25                       |
  | gleichgewichtet, Kaufen und Halten ab Spielstart        | 10,1 %   | 9,9 %    | 8,3 %     | 25 / 25                       |
  | nur Large Caps, gleichgewichtet, jährlich               | 7,4 %    | 8,5 %    | 8,8 %     | 25 / 25                       |
  | nur Mid Caps, gleichgewichtet, jährlich                 | 10,9 %   | 12,5 %   | 12,7 %    | 25 / 25                       |
  | nur Small Caps, gleichgewichtet, jährlich               | 17,1 %   | 19,6 %   | 20,1 %    | 25 / 25                       |
  - Die Überrenditen (Large +2,0, Mid +5,9, Small +13,3 Punkte) entsprechen der Rechnung ½·v_i (Small Caps zusätzlich rund 1,3 Punkte Größenprämie).
  - 300 zufällige 20-Aktien-Depots je Seed, Kaufen und Halten über die ersten zehn Spieljahre: 94 % schlagen den Index, Median +4,2 Punkte p. a. Eine einzelne Aktie schlägt ihn in 49 % der Fälle (real deutlich seltener).
  - Reversal: Quintil der Verlierer der letzten 10 Jahre gegen das der Gewinner, Kursrendite der folgenden 5 Jahre: +8,6 % gegen +0,5 % p. a. (Log), Abstand 8,2 Punkte im Mittel, je Seed 6,2–9,8. Schon in den Spieljahren 0–20 sind es 9,0 % gegen 0,3 % (Auswertung nach Epochen auf 16 der 25 Seeds). Reale Reversal-Effekte liegen bei wenigen Punkten und nur in den Extremen.
  - Momentum (12–1 Monate) ist leicht negativ (−2,0 Punkte p. a., t ≈ −2), real ist es klar positiv.
  - Zum Vergleich: Reale gleichgewichtete Indizes schlagen kapitalgewichtete um rund 1–2 Punkte p. a.

- **Vorschlag:**
  - Grundsatz entscheiden: Stationäre Log-Kurse und „keine Prämie für diversifizierbares Risiko“ schließen sich mathematisch aus. Schwächeres `θ` verzögert den Effekt nur (Prämie = ½·v·(1 − e^{−2θt})).
  - Zielbild: `U_i` als Irrfahrt mit dauerhaftem Kompensator (`θ = 0`), Konzentration und Kursuntergrenze über Indexpflege (Neugewichtung, Teileranpassung), Splits und den Lebenszyklus aus E-40 / AP 9.2 lösen.
  - Zwischenlösung für Stufe 1 prüfen: `U_i` in einen dauerhaften Anteil (Irrfahrt, voller Kompensator) und einen kleinen stationären Anteil teilen. Trägt der stationäre Teil rund 20 % der Varianz, liegt die Prämie der Gleichgewichtung bei rund 1–1,5 Punkten. Die Grenzen aus `LONG_TERM_LIMITS` müssen dann neu gemessen werden.
  - Zwei neue Kalibrierungsziele: Überrendite „gleichgewichtet, jährlich“ gegen den Performanceindex (Vorschlag ≤ 2 Punkte) und Abstand Verlierer- gegen Gewinner-Quintil (Vorschlag ≤ 3 Punkte).
  - TS §6.4 berichtigen (Aussage zum Kompensator gilt nur ab der Epoche).
- **Folgen einer Änderung:** bricht den Golden Master, braucht eine neue `SIM_VERSION` und sperrt bestehende Spieler; vollständige Neukalibrierung (Volatilitäten, Korrelationen, Langzeitgrenzen); R12 muss neu bewertet werden. Aufwand L.

### B-02 Kalibrierung ist an fünf Seeds mit krisenlastigem Vorlauf angepasst; die Indexvolatilität liegt außerhalb der Stichprobe unter dem Band

- **Schwere:** mittel
- **Art:** Testlücke (Methode der Kalibrierung), Abweichung Doku↔Messung
- **Bereich:** TS §6.9 (Prüfregel E-34, Messung AP 1.9c), §6.2 („rund 14,5 %“); `src/app/lab/domain/calibration-targets.calibration.spec.ts`, `src/app/lab/domain/seed-comparison.ts`
- **Befund:**
  - Alle fünf Kalibrierungs-Seeds haben im Vorlauf mindestens 10 % Krisenzeit (Mittel 13,9 %; stationär 7,9 %). 20 frische Seeds haben im Mittel 7,4 %. Ziele mit Mindestdauer bis zehn Jahre werden nur über diesen Vorlauf geprüft.
  - Das Modell ist deshalb auf typischen Seeds ruhiger als kalibriert: Die Volatilität des Weltindex im Vorlauf liegt auf den frischen Seeds im Median bei 13,4 % (Band 14–18 %), nur 8 von 20 Seeds liegen im Band. Auf den Kalibrierungs-Seeds sind es 14,2 %.
  - Der Median von fünf Seeds ist für die knappen Ziele zu ungenau: Die Streuung der Vorlauf-Volatilität je Seed ist 1,4 Punkte, der Abstand zur Bandgrenze 0,2 Punkte. Kurtosis (3,5–13,2) und Cluster (0,06–0,43) streuen je Seed noch stärker.
  - Die Messvorschrift „Log-Tagesrenditen × √261“ unterschätzt die Volatilität des Weltindex systematisch, weil seine Werte zu verschiedenen Uhrzeiten schließen (TS §6.9 nennt das selbst). Über 110 Jahre, Median von 25 Seeds: Tagesrenditen 14,5 %, Wochenrenditen 16,2 %, Monatsrenditen 16,6 %, Jahresrenditen 17,5 %. Die Autokorrelation der Tagesrenditen des Weltindex bei Lag 1 ist 0,17 (0,08–0,23). Das Band wird also gegen eine Kennzahl geprüft, die rund 15 % unter der wirtschaftlich relevanten Volatilität liegt.
  - Doku-Zahlen aus den Kalibrierungs-Seeds sind entsprechend verschoben: Weltfaktor „rund 14,5 % realisierte Volatilität“ (TS §6.2), gemessen über 150 Seeds und 110 Jahre 13,2 % auf Tagesbasis; „Rendite des Weltindex 7,3 %“ (TS §6.3, §6.9), über 25 Seeds Median 6,65 %, Mittel 6,9 %.
- **Beleg:** `W/facts.ts`, Auswertung `W/summ.py`, Rohdaten `W/facts-*.jsonl`; `W/facts2.ts factor` → `W/factor.json`.

  | Ziel (Vorlauf)        | Median `calib-1…5` | Median 20 frische Seeds (Spanne) | Band      | frische Seeds im Band |
  | --------------------- | ------------------ | -------------------------------- | --------- | --------------------- |
  | Volatilität Weltindex | 14,2 %             | 13,4 % (10,5–16,3 %)             | 14–18 %   | 8 / 20                |
  | Korrelation innerhalb | 0,57               | 0,54 (0,44–0,63)                 | 0,5–0,6   | 11 / 20               |
  | Korrelation zwischen  | 0,39               | 0,37 (0,24–0,47)                 | 0,2–0,4   | 13 / 20               |
  | Kurtosis Weltindex    | 6,5                | 6,2 (3,5–13,2)                   | ≥ 5       | 12 / 20               |
  | Cluster Lag 1         | 0,25               | 0,19 (0,06–0,43)                 | 0,10–0,30 | 13 / 20               |
  | Overnight Europa      | 34,0 %             | 31,9 % (27–38 %)                 | 15–35 %   | 17 / 20               |

  Alle übrigen Ziele mit Band liegen auch auf den frischen Seeds im Median im Band (Large und Small Caps, Dividendenrenditen, Tagesprofil, Overnight-Anteile, Bärenmärkte 0,145 je Jahr, Rendite 6,65 %).

- **Vorschlag:**
  - Die Prüfregel auf mehr Seeds stellen (z. B. 20) oder die Vorlauf-Ziele zusätzlich über den langen Lauf messen; die Kalibrierungs-Seeds nicht mehr zugleich als Mess-Seeds der Doku verwenden.
  - Volatilität des Weltindex über Wochen- oder Monatsrenditen messen (oder das Band für Tagesrenditen ausdrücklich so benennen). Das Band selbst ist Sache des Product Owners.
  - Die Doku-Zahlen in TS §6.2, §6.3 und §6.9 mit der Seed-Zahl kennzeichnen oder neu messen.
- **Folgen einer Änderung:** Nur Tests und Doku: kein Golden-Master-Bruch. Führt die breitere Messung zu einer Neukalibrierung, dann neue `SIM_VERSION`. Laufzeit der Suite steigt etwa linear mit der Seed-Zahl (rund 16 s je Seed). Aufwand S (Messung) bis M (Neukalibrierung).

### B-03 Einzelaktien haben kein Volatilitäts-Clustering, Large Caps kaum fette Ränder

- **Schwere:** mittel
- **Art:** Modellfehler (fehlender Stylized Fact), Testlücke
- **Bereich:** TS §6.4 („Skalierung mit der Marktvolatilität … nicht umgesetzt“), §6.9 (Zeile „Tagesrenditen“); `src/app/market/domain/instrument-step.ts:39`, `src/app/lab/domain/lab-statistics.ts:109-114`
- **Befund:**
  - Die idiosynkratische Volatilität `σ_i` ist konstant. Cluster entstehen nur über die Faktoren. Bei Einzelaktien ist der Effekt deshalb fast weg: Autokorrelation der quadrierten Tagesrenditen bei Lag 1 im Median der Aktien 0,009 (Small Caps 0,001, Large Caps 0,073), der Beträge 0,019. Reale Aktien liegen bei rund 0,1–0,25.
  - Die Kurtosis der Aktien kommt fast nur aus den Sprüngen: Small Caps 9,6, Large Caps 4,2 (reale Large Caps eher 6–10 und mehr). Das Ziel „Median der Aktien ≥ 5“ besteht nur, weil Mid und Small Caps die Mehrheit stellen.
  - Das Ziel für Volatilitäts-Cluster misst nur den Weltindex. Gehandelt und im Chart betrachtet werden aber Einzelaktien.
- **Beleg:** `W/facts.ts`, 25 Seeds über 110 Jahre, Block `stocks` in `W/facts-*.jsonl`: `acfSq1` 0,009 (0,006–0,019), `acfSq1Large` 0,073, `acfSq1Small` 0,001, `acfAbs1` 0,019, `kurtLarge` 4,16 (3,8–4,6), `kurtSmall` 9,6.
- **Vorschlag:**
  - Die in TS §6.4 vorgesehene Skalierung umsetzen: `σ_i` des Tages mit einem gemeinsamen Volatilitätszustand multiplizieren (z. B. gedämpft `s_Welt / s̄_Welt` oder ein eigener Zustand je Sektor), Kompensator mit der Tagesvarianz rechnen.
  - Ziele ergänzen: Cluster Lag 1 im Median der Aktien (z. B. ≥ 0,05) und Kurtosis der Large Caps.
  - Beachten: Skaliert `σ_i` mit dem Markt, steigen die Korrelationen in Krisen weniger stark (heute 0,52 in Krisen gegen 0,28 sonst).
- **Folgen einer Änderung:** bricht den Golden Master, neue `SIM_VERSION`; Neukalibrierung von Aktienvolatilität, Korrelation und Kurtosis. Aufwand M.

### B-04 Regionen sind zu schwach korreliert; Regionalindizes sind deutlich volatiler als der Weltindex

- **Schwere:** mittel
- **Art:** Modellfehler (Kalibrierung), Testlücke
- **Bereich:** TS §6.2 (Parameter je Faktorklasse, E-30), §6.9 (Zielkonflikt E-34); `src/app/market/domain/default-market-config.ts:63-64`
- **Befund:**
  - Der Regionsfaktor (10,3 % Volatilität) ist fast so stark wie der Weltfaktor (13,2 %). Das war nötig, um die Overnight-Ziele für Nordamerika und Europa zu erreichen (TS §6.9, „Zielkonflikt im Vorlauf“).
  - Ergebnis: Monatsrenditen der breiten Regionalindizes Nordamerika und Europa korrelieren mit 0,56, Nordamerika und Asien-Pazifik mit 0,53. Real liegen entwickelte Regionen seit den 1990ern bei rund 0,75–0,85.
  - Die Regionalindizes haben 19,4–20,5 % Volatilität (Tagesrenditen, 110 Jahre), der Weltindex 14,5 % (Monatsbasis 16,6 %). Real ist ein Weltindex kaum ruhiger als der US-Markt. Die Streuung über Regionen bringt im Spiel also deutlich mehr als in der Realität.
  - Schwellenländer sind nicht riskanter als entwickelte Regionen (18,8 % gegen 19,4–20,5 %); es gibt keinen Regionsparameter für die Volatilität.
  - Für die Korrelation zwischen Regionen und die Volatilität der Regionalindizes gibt es kein Kalibrierungsziel; die Korrelationsziele messen nur Paare derselben Region (E-31).
- **Beleg:** `W/facts.ts`, Block `regions`, Median von 25 Seeds über 110 Jahre: Korrelation Nordamerika/Europa am selben Tag 0,40, Monat 0,56 (0,48–0,64); Nordamerika/Asien-Pazifik Monat 0,53 (0,41–0,58). Überschlag aus den Parametern: Weltvarianz 0,0174 ÷ Varianz eines Regionalindex 0,031–0,040 = 0,44–0,56, passt zur Messung.
- **Vorschlag:** Ziel für die Korrelation der Monatsrenditen zwischen entwickelten Regionen (z. B. 0,65–0,85) und Info-Zeilen für die Volatilität der Regionalindizes aufnehmen; Regionsfaktor schwächer, Weltfaktor stärker kalibrieren. Der Konflikt mit den Overnight-Zielen ist dann neu zu entscheiden (z. B. Aktivität des Weltfaktors stärker in der US- und EU-Sitzung, höherer Overnight-Anteil für Asien-Pazifik).
- **Folgen einer Änderung:** Parameteränderung bricht den Golden Master, neue `SIM_VERSION`; Neukalibrierung von Overnight-Anteilen, Korrelationen und Indexvolatilität (diese Größen hängen über das Varianzbudget zusammen). Aufwand M.

### B-05 Langfristrisiko des Weltindex liegt am Rand der historischen Erfahrung und hat kein Ziel

- **Schwere:** niedrig
- **Art:** Verbesserung, Testlücke
- **Bereich:** TS §6.3, §6.9 (Drawdown „hoch, aber plausibel“); `src/app/lab/domain/calibration-targets.ts`
- **Befund:**
  - Der Weltfaktor ist eine freie Irrfahrt mit leicht positiver Autokorrelation der Jahresrenditen (Mittel +0,04). Lange Zeiträume sind dadurch riskanter als real, wo lange Horizonte eher Rückkehr zeigen.
  - Über 110 Jahre je Seed (Performanceindex, nominal): größter Drawdown im Median 73 %, bei 5 von 25 Seeds über 80 %; längste Zeit unter dem alten Hoch im Median 16 Jahre, bei 4 Seeds über 20, einmal 40 Jahre; 7 von 25 Seeds haben ein 30-Jahres-Fenster mit negativer Gesamtrendite (schlechtestes −4,5 % p. a.); schlechtestes Kalenderjahr im Median −40 %, im unteren Zehntel −64 %.
  - Real: Weltindex größter Drawdown rund −55 % (2007–2009), um 1929–1932 rund −70 %; kein 30-Jahres-Zeitraum mit nominalem Verlust; schlechtestes Jahr rund −40 %.
  - Gemessen wird nur die Häufigkeit der Bärenmärkte, nicht Tiefe und Dauer.
- **Beleg:** `W/facts.ts`, Block `long` (`maxDD`, `longestUnderwaterYears`, `win30ret.min`, `annMin`), Auswertung `W/summ.py` und Seed-Liste im Lauf.
- **Vorschlag:** Info-Zeilen oder Grenzen für größten Drawdown, längste Unterwasserzeit und schlechtestes 30-Jahres-Fenster im Seed-Vergleich; danach entscheiden, ob Krisen-Volatilität (29 %) oder `ξ` = 1,45 gesenkt werden.
- **Folgen einer Änderung:** Info-Zeilen ohne Modelländerung: kein Bruch. Parameteränderung: Golden Master, `SIM_VERSION`, Neukalibrierung. Aufwand S bzw. M.

### B-06 Die Phase „Krise“ ist ein Volatilitätsregime, kein Abschwung: gut die Hälfte der Krisen endet im Plus

- **Schwere:** niedrig
- **Art:** Verbesserung
- **Bereich:** TS §6.3, §6.10 (Newsticker formuliert Phasenwechsel)
- **Befund:** Mit Trendziel −5 %, einer Trend-Halbwertszeit von 2,8 Monaten und 0,4 Jahren Dauer bringt eine Krise im Mittel −1,6 % Indexrendite bei 20 % Streuung; 53 % der Krisen haben eine positive Rendite. Als Gesamtbild stimmt die Asymmetrie trotzdem (Schiefe der Monatsrenditen −0,58, der Jahresrenditen −0,73; Korrelation Rendite zu quadrierter Folgerendite −0,05). Wenn der Newsticker der Stufe 2 Phasenwechsel als „Krise“ meldet, steigt der Markt danach in jedem zweiten Fall.
- **Beleg:** `W/facts.ts`, Block `long`: `crisisRetMean` −0,016, `crisisRetSd` 0,20, `crisisPositive` 0,53; Log-Rendite p. a. je Phase 8,8 / 7,4 / 4,0 / −5,0 % (Median von 25 Seeds).
- **Vorschlag:** Die Phase intern als Volatilitätsregime dokumentieren und im Newsticker nicht als Richtungsaussage verwenden; oder einen Anfangsschock beim Eintritt in die Krise ergänzen.
- **Folgen einer Änderung:** Doku: keine. Anfangsschock: Golden Master, `SIM_VERSION`, Neukalibrierung von Rendite und Bärenmärkten. Aufwand S bzw. M.

### B-07 Brief- und Geldkurs können an den Stufengrenzen außerhalb ihres eigenen Preisrasters liegen

- **Schwere:** niedrig
- **Art:** Abweichung innerhalb der Spezifikation (Formel gegen Rasterregel)
- **Bereich:** TS §6.7 (`priceStep(mid)`); `src/app/shared/domain/price-step-logic.ts:31-36`
- **Befund:** Gerundet wird mit dem Raster des Mittelkurses. Liegt der Mittelkurs knapp unter 10 € oder 1 €, landet der Briefkurs über der Grenze auf dem feineren Raster. Der Code setzt die Formel richtig um; die Formel widerspricht aber der Rasterregel „ab 10 € 0,01 €“.
- **Beleg:** `W/quote.ts`: Mitte 9,9995 €, Spread 0,1 % → Brief 10,005 €; Mitte 9,998 €, Spread 0,25 % → Brief 10,011 €; Mitte 0,9999 €, Spread 0,25 % → Brief 1,0012 €. Umgekehrt ist der Geldkurs bei Mitte 10,004 € mit 9,99 € gröber als nötig (effektiver Spread 0,2 % statt 0,1 %).
- **Vorschlag:** Geld und Brief je auf das Raster des eigenen Werts runden, oder die Ausnahme in TS §6.7 nennen.
- **Folgen einer Änderung:** kein Golden-Master-Bruch (abgeleitete Werte); Ausführungskurse an den Grenzen ändern sich minimal, Replays alter Orders prüfen. Aufwand S.

### B-08 Dividenden werden auf Cent gerundet; bei niedrigen Kursen weicht die Zahlung stark vom Zielpfad ab

- **Schwere:** niedrig
- **Art:** Randfall
- **Bereich:** TS §6.5 (Höhe), §6.4 (Zielpfad `μ_i = m_i − D_i`); `src/app/market/domain/dividend-logic.ts:69-75`
- **Befund:** Der Betrag je Zahlung wird auf ganze Cent gerundet, das Preisraster geht aber bis 0,0001 €. Bei Quartalszahlern unter rund 0,80 € ist die Dividende 0 Cent; der Zielpfad zieht den erwarteten Abschlag trotzdem ab, die Rückkehr drückt den Kurs dann zusätzlich. Zwischen 1 € und 5 € weicht die Zahlung um bis zu rund 30 % vom Ziel ab. Heute selten (Startkurse 5–500 €, kein Seed mit Aktien unter 1 € nach 100 Jahren), nach B-01 oder mit Splits wird es häufiger.
- **Beleg:** `W/quote.ts`: 2,5 % quartalsweise bei 0,79 € → 0 Cent (genau 0,49); bei 2,50 € → 2 Cent (genau 1,56); bei 3 € → 2 Cent (genau 1,88).
- **Vorschlag:** Dividende je Aktie mit vier Nachkommastellen führen und erst die Gutschrift der Position auf Cent runden.
- **Folgen einer Änderung:** bricht den Golden Master (Abschläge ändern `U_i`), neue `SIM_VERSION`; berührt Buchung und Steuer (TS §7.4, §7.7). Aufwand M.

### B-09 Höchstkurse wachsen ohne Splits in die Millionen; Konzentration wird nur nach 50 und 100 Jahren geprüft

- **Schwere:** Hinweis
- **Art:** Verbesserung
- **Bereich:** TS §6.4 (Splits ab Stufe 2), §6.9 (`LONG_TERM_LIMITS`), R12
- **Befund:** Der teuerste Wert kostet nach 100 Jahren im Median 493.000 € je Aktie, im oberen Zehntel 3,8 Mio. €. Der Anteil der fünf größten Werte liegt an den geprüften Stichtagen im Median klar unter 40 %, bei 4 von 25 Seeds aber an mindestens einem Stichtag darüber (höchster Wert 56 % nach 25 Jahren, ein Stichtag ohne Grenze).
- **Beleg:** `W/facts.ts`, `long.maxPrice`, `long.top5`.
- **Vorschlag:** Info-Zeile „Höchstkurs“ mit Grenze, sobald Splits kommen; Stichtag 25 Jahre in die Prüfung aufnehmen.
- **Folgen einer Änderung:** nur Tests. Aufwand S.

### B-10 Für die Autokorrelation der Renditen gibt es kein Ziel

- **Schwere:** Hinweis
- **Art:** Testlücke
- **Bereich:** TS §6.9; `src/app/lab/domain/lab-statistics.ts`
- **Befund:** „Kaum Autokorrelation der Renditen“ ist nicht als Ziel erfasst. Gemessen ist sie in Ordnung, wo sie handelbar wäre: Aktien 0,000, Regionalindex Nordamerika 0,002. Der Weltindex (0,17) und der Schwellenländer-Index (0,12) sind durch die verschiedenen Schlusszeiten träge; das ist real ähnlich und nicht handelbar, weil ETFs mit indikativen Werten rechnen. Der träge Weltindex ist aber der Vergleichsmaßstab der Performance (TS §7.9).
- **Beleg:** `W/facts.ts`: `long.acf1`, `regions.*.acf1`, `stocks.acf1`; Nordamerika (t) → Asien-Pazifik (t + 1) 0,46, → Europa (t + 1) 0,17.
- **Vorschlag:** Info-Zeilen für die Autokorrelation bei Lag 1 (Aktien im Median, Regionalindex) mit Grenze |ρ| ≤ 0,05.
- **Folgen einer Änderung:** nur Tests. Aufwand S.

## Geprüft und in Ordnung

- **Beispieltabellen TS §6.4:** alle 9 Zeilen (`v`, `h`, `g`, `m`) und die drei Dividendenabschläge unabhängig nachgerechnet (`W/tables.mjs`), alle Stellen stimmen.
- **Beispieltabelle Lebenszyklus TS §6.5:** alle 7 Zeilen (`ỹ_0`, `ỹ_∞`, `ỹ(d)`, `D(d)`, `y(d)`) nachgerechnet, stimmen.
- **Aktivität der Regionsfaktoren TS §6.2:** alle 5 Zeilen von Hand nachgerechnet (78,79 / 84,58 / 76,92 / 41,11 / 46,04 %, Summe 501,75), stimmen.
- **Phasenkette TS §6.3:** stationäre Verteilung der Sprungkette selbst berechnet: Zeitanteile 40,2 / 34,9 / 17,1 / 7,9 %, 30,0 % der Wechsel führen in eine Krise, 0,197 Krisen je Jahr, P(Krise > 1 Jahr) = 8,1 %. Gemessen über 25 Seeds: 40,1 / 34,7 / 16,8 / 8,4 %, 0,21 Krisen je Jahr.
- **Driftkorrektur −σ²/2 des Weltfaktors:** Mittel von `exp(ΔF − m·Δ_T) − 1` über 4,3 Mio. Tage (150 Seeds): 2,6·10⁻⁶ ± 3,9·10⁻⁶, ohne Korrektur 3,6·10⁻⁵. Die Korrektur ist richtig. Log-Drift 6,11 % ± 0,12 gegen Rechnung `E[m] − ½·E[s²]` = 6,93 % − 0,87 % = 6,06 %.
- **Stochastische Volatilität:** `E[s²] = s̄²·exp(ξ²/κ_s)` nachgerechnet (Welt Faktor 1,30); Phasenmischung ergibt 13,8 %, gemessen 13,2 % (Tagesbasis) bzw. 14,0 % (Jahresbasis).
- **Tagesschritt der Faktoren und Instrumente:** Code Zeile für Zeile gegen TS §6.2 und §6.4 gelesen (exakte OU-Diskretisierung, Reihenfolge der Ziehungen, Kompensator der Sprünge bis zur zweiten Ordnung, Rest dritter Ordnung −0,036 % p. a. für Small Caps nachgerechnet).
- **Brownsche Brücke:** Formel in TS §6.1 ist die bedingte Verteilung (Mittel `v_j/R_j`, Varianz `v_j·(R_j − v_j)/R_j`), `bridge-logic.ts` setzt sie um; `bridge-equivalence.calibration.spec.ts` grün (Minutenvolatilität 20,90 / 20,90 % und 38,00 / 38,04 %).
- **Varianzbudget eines Large Caps:** aus den Parametern überschlagen: 27 % Volatilität, Korrelation innerhalb 0,53, zwischen 0,38; passt zur Messung (28,6 %, 0,54–0,57, 0,37–0,39).
- **Tagesprofil:** Kennzahl aus den Gewichten überschlagen (1,60 bei 70 % idiosynkratischem Anteil), gemessen 1,56–1,59.
- **Performanceindex:** `R ← R·I_ref/(I_ref − Dividendenpunkte)` entspricht der Wiederanlage zum Ex-Kurs; Abweichung von der üblichen Formel nur zweiter Ordnung.
- **ETFs:** TER als `(1 − TER/365)^n`, Tracking als Martingal auf `k`, Topf und Ausschüttung gelesen; Formeln stimmig.
- **Dividendenrendite:** Weltindex 2,18 % (2,0–2,3 %) über 110 Jahre, 30-Jahres-Fenster 2,16 %; höchste Aktie im Vorlauf 6,5 %.
- **Stylized Facts des Weltindex (25 Seeds, 110 Jahre):** Kurtosis der Tagesrenditen 7,4, Cluster Lag 1 0,26, Lag 20 0,15, Lag 60 0,10 (langes Gedächtnis), Schiefe täglich −0,11, monatlich −0,58, schlechtester Tag −8,8 %, 31 % negative Jahre, Bärenmärkte 0,145 je Jahr; Korrelation der Aktien mit dem Index in Krisen 0,52 gegen 0,28.
- **Equity-Premium:** Index 6,7–6,9 % gegen Tagesgeld 1,5–3 % (TS §5.7), plausibel.
- **Langzeitgrenzen:** unter 1 € und an der Untergrenze 0 % in allen 25 Seeds, Top 5 nach 50 / 100 Jahren im Median 27 / 29 %.
- **Kalibrierungs-Suite:** `npm run test:calibration` am Stand ausgeführt, 6 Dateien, 79 Tests grün (`W/calibration.log`).
- **Messvorschriften:** Code von `lab-statistics.ts`, `market-sample.ts`, `long-term-statistics.ts`, `intraday-statistics.ts`, `drawdown-logic.ts` gegen TS §6.9 gelesen; sie messen, was die Tabelle beschreibt (Einschränkung zur Volatilität siehe B-02).
- **Spread:** Faktor Volatilität an 49 % der Tage 1, an 3,4 % der Tage an der Obergrenze 3; passt zu TS §6.7.

## Nicht geprüft / Grenzen

- Kerzen, Verdichtung, `PriceSource`, indikative Werte und die Bitgleichheit der Kurven habe ich nur gelesen (`candle-logic.ts`) und nicht nachgemessen; die vorhandenen Eigenschaftstests habe ich nicht einzeln ausgeführt.
- ETFs: keine eigene Messung von Tracking-Differenz und Gleichwertigkeit ausschüttend/thesaurierend, nur Formelprüfung.
- Intraday-Verhalten jenseits des Tagesprofils (Minutenrenditen, Sprünge innerhalb des Tages) nicht nachgemessen.
- Alle Strategie-Messungen in B-01 sind ohne Spreads, Gebühren und Steuern; bei jährlichem Umschichten kosten sie grob 0,2–1 Punkt p. a. und ändern das Ergebnis nicht.
- Vergleichswerte realer Märkte stammen aus dem Gedächtnis (Größenordnungen), nicht aus Datenquellen.
- Eine geänderte Konfiguration (z. B. die Zwischenlösung aus B-01) habe ich nicht simuliert; die Vorschläge sind hergeleitet, nicht gemessen.
- Annahme: `rev-b-1…20` und `fac-1…150` sind frische Seeds ohne Bezug zur Kalibrierung.
