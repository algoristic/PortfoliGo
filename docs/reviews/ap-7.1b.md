# AP 7.1b – Modellreview: Marktmodell und Kalibrierung: Gegenüberstellung und gemeinsame Befundliste

> Geprüfter Stand: `c1e2514` · Läufe: Opus 5.5 (`effort: high`), Fable 5.2 (`effort: medium`) · Gegenüberstellung: 15.11.2026
> Rohberichte: [Lauf Opus](./ap-7.1b/lauf-opus.md) · [Lauf Fable](./ap-7.1b/lauf-fable.md)

## Ergebnis

Formeln, Beispieltabellen und Code des Marktmodells stimmen überein. Beide Läufe haben das unabhängig nachgerechnet, und die Kalibrierungs-Suite ist auch in dieser Gegenüberstellung grün (79 Tests). Es gibt **einen grundlegenden Modellfehler**: Die Rückkehr von `U_i` zum Zielpfad (E-22) macht das Spiel ausnutzbar. Ein Spieler, der jedes Jahr die 20 am tiefsten gefallenen Aktien kauft, schlägt den Welt-ETF nach Spreads, Gebühren und Steuern um rund 12 Punkte p. a. (Log), in allen 60 frischen Seeds. Ein Parameter allein behebt das nicht. Jede Rückkehr erzeugt diese Prämie, und ohne Rückkehr kommt R12 zurück (Kurse unter 1 €, Konzentration). Empfohlen wird deshalb eine Modelländerung in AP 7.3 mit neuer `SIM_VERSION`. Der PO wählt dazu einen Weg (E-22 neu entscheiden). Alle übrigen Befunde sind nicht grundlegend. Sie gehen in die Neukalibrierung von 7.3 ein oder werden als Doku- und Testarbeiten ohne Modelländerung erledigt.

## Gegenüberstellung

| Thema                                                                                         | Lauf Opus                                 | Lauf Fable                             | Verhältnis                                            | Ergebnis der Abwägung                                                            |
| --------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Rückkehr von `U_i`: Verlierer erholen sich, Gleichgewichtung schlägt den Index                | B-01, hoch                                | B-01, hoch                             | übereinstimmend                                       | bestätigt und mit Kosten nachgemessen; grundlegend → 7.1b-01                     |
| Kein Volatilitäts-Clustering bei Einzelaktien                                                 | B-02, mittel                              | B-03, mittel                           | übereinstimmend                                       | bestätigt, nicht grundlegend → 7.1b-02                                           |
| Kalibrierung auf fünf krisenlastigen Seeds, Weltvolatilität auf frischen Seeds unter dem Band | B-10, Hinweis (Trennschärfe)              | B-02, mittel                           | übereinstimmend in der Sache, verschieden gewichtet   | bestätigt, auf 60 Seeds sogar deutlicher; Kurtosis ebenfalls betroffen → 7.1b-03 |
| Kappung nur zur Epoche, Profil zeigt verletzte Grenze                                         | B-03, mittel                              | –                                      | nur Opus                                              | auf 6 frischen Seeds bestätigt → 7.1b-04                                         |
| Regionen schwach korreliert, Regionalindizes volatil                                          | B-07, niedrig (Info-Zeilen)               | B-04, mittel (Modell)                  | übereinstimmend in der Messung, verschieden gewichtet | bestätigt; niedrig, weil nicht ausnutzbar → 7.1b-05                              |
| Zählung der Bärenmärkte                                                                       | B-04, niedrig                             | –                                      | nur Opus                                              | übernommen → 7.1b-06                                                             |
| Messvorschrift Weltindex: Lag-1-Autokorrelation 0,17, Tagesvolatilität geglättet              | B-08, Hinweis                             | B-02 (Teil), B-10, Hinweis             | übereinstimmend                                       | übernommen → 7.1b-07                                                             |
| Langfristrisiko des Weltindex ohne Ziel                                                       | –                                         | B-05, niedrig                          | nur Fable                                             | übernommen → 7.1b-07                                                             |
| Höchstkurse ohne Splits, Stichtag 25 Jahre                                                    | B-05 (Teil)                               | B-09, Hinweis                          | übereinstimmend                                       | übernommen → 7.1b-07 und 7.1b-11                                                 |
| Geld- und Briefkurs an den Rastergrenzen                                                      | –                                         | B-07, niedrig                          | nur Fable                                             | nachgerechnet, stimmt → 7.1b-08                                                  |
| Dividenden auf ganze Cent                                                                     | –                                         | B-08, niedrig                          | nur Fable                                             | nachgerechnet, stimmt → 7.1b-09                                                  |
| Dividenden nicht geglättet                                                                    | B-06, niedrig                             | –                                      | nur Opus                                              | übernommen → 7.1b-10                                                             |
| Float32-Kerzen bei hohen Kursen                                                               | B-05, niedrig                             | –                                      | nur Opus                                              | bestätigt, Schwelle berichtigt (131.072 € statt 83.000 €) → 7.1b-11              |
| Phase „Krise“ ist ein Volatilitätsregime                                                      | –                                         | B-06, niedrig                          | nur Fable                                             | übernommen → 7.1b-12                                                             |
| TS-Kennzahlen stammen von den Kalibrierungs-Seeds                                             | B-09, Hinweis                             | B-02 (Teil)                            | übereinstimmend                                       | bestätigt (20 frische Seeds) → 7.1b-13                                           |
| Korrelation in Krisen                                                                         | 0,68 gegen 0,27 (Large Caps einer Region) | 0,52 gegen 0,28 (Aktien mit dem Index) | kein Widerspruch                                      | verschiedene Größen, beide zeigen den Anstieg                                    |

## Nachgeprüft

Alle Skripte und Rohdaten liegen in `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/work/7.1b-synthese/`. Die Seeds `syn-1` bis `syn-312` sind frisch, sie gehören weder zur Kalibrierung noch zu den Seeds der Läufe.

### Rückkehr von `U_i`: Größe des ausnutzbaren Vorteils (7.1b-01)

- **Rechnung:** Ist `U_i − m_i` stationär mit Varianz `v_i/(2θ)`, gilt für die mittlere einfache Rendite über h Jahre `E[e^(ΔU)] = exp(v_i/(2θ) · (1 − e^(−θh)))` und zum Zeitpunkt t `≈ exp(½ · v_i · (1 − e^(−2θt)) · h)`. Der kapitalgewichtete Index bekommt diese Prämie nicht, weil `E[e^U]` konstant bleibt. Fables Herleitung stimmt. Zum Spielstart (t ≈ 10 Jahre) wirken schon 75 % der Prämie, also rund 2 Punkte p. a. für Large Caps und 12 Punkte für Small Caps.
- **Messung** (`losers.ts`, `losers-summary.txt`): 60 frische Seeds, Start zum Spielstart, jährlich umgeschichtet. Die Rangfolge nutzt nur, was der Spieler sieht: Rendite der letzten 1 bzw. 3 Jahre, Abstand zum bisherigen Höchstkurs. Kosten:
  - Marktspread mit Volatilitätsfaktor,
  - Online-Broker mit 7 € je Order (5 € Orderentgelt und 2 € Börsenentgelt),
  - 25 % Abgeltungsteuer mit 1.000 € Sparerpauschbetrag und Verlustvortrag,
  - Vergleich gegen einen Welt-ETF (Performanceindex, TER 0,2 %, Steuer erst beim Verkauf am Ende).

  Mehrrendite (Log p. a.) gegen den ETF, 20 Aktien, 10.000 € Startkapital, nach allen Kosten und Steuern:

  | Strategie                                                  | 1 Jahr  | 5 Jahre | 10 Jahre | 20 Jahre | Seeds über dem ETF (10 Jahre) |
  | ---------------------------------------------------------- | ------- | ------- | -------- | -------- | ----------------------------- |
  | 20 Aktien mit dem größten Abstand zum Höchstkurs, jährlich | +11,7 % | +12,3 % | +12,2 %  | +12,0 %  | 60 / 60                       |
  | dieselben 20 zum Spielstart kaufen und halten              | +12,8 % | +11,6 % | +10,3 %  | +7,4 %   | 60 / 60                       |
  | 20 Verlierer der letzten 3 Jahre, jährlich                 | +5,4 %  | +7,8 %  | +7,8 %   | +8,0 %   | 59 / 60                       |
  | 20 Verlierer des letzten Jahres, jährlich                  | +2,3 %  | +4,9 %  | +5,8 %   | +6,3 %   | 56 / 60                       |
  | 20 Gewinner des letzten Jahres, jährlich                   | −0,9 %  | +2,3 %  | +3,2 %   | +4,1 %   | 50 / 60                       |
  | 20 zufällige Aktien, jährlich neu gezogen                  | −1,1 %  | +2,0 %  | +3,4 %   | +3,8 %   | 52 / 60                       |
  - Der Weltindex wuchs auf denselben Seeds um 6,3 % p. a. (Log, 10 und 20 Jahre). Nach zehn Jahren hat die Strategie „Höchstkurs-Abstand“ also rund das 3,4-Fache des ETF-Depots.
  - Mit 10 statt 20 Aktien ist der Vorsprung größer (+14,0 Punkte über 10 Jahre). Bei 50.000 € Startkapital ändert sich wenig. Die Kosten kosten 3–4 Punkte p. a. (brutto +15,9 Punkte).
  - Selbst Gewinner und Zufallsdepots schlagen den ETF. Das ist die Prämie der Gleichgewichtung, die auch ohne Auswahl wirkt.

- **Querschnitt** (`cross.ts`, 8 frische Seeds, Epoche bis Spielstart + 100 Jahre): In keinem Seed hat eine Aktie eine negative Gesamtrendite. Die schlechteste Aktie bringt je Seed +1,7 bis +5,0 % p. a. Das bestätigt Opus (0 % negativ, schlechteste +2,2 % p. a.).
- **Probe zur Rückkehrstärke** (`probe.ts`, `probe-summary.txt`; 12 frische Seeds, nur `idioReversion` bzw. `levelReversion` geändert, keine Kalibrierung, ohne Kosten). Gemessen wurde die Mehrrendite über die ersten 10 Spieljahre gegen den Performanceindex und die R12-Größen. Spalten: Mehrrendite der Strategie „20 tiefste Abstände zum Hoch“, Mehrrendite der Gleichgewichtung, dann unter 1 €, an der Untergrenze und Top 5 jeweils nach 30 und nach 100 Jahren.

  | Halbwertszeit `θ`        | Mehrrendite Strategie | Mehrrendite Gleichgewichtung | unter 1 € (30 / 100 J.) | an der Untergrenze (30 / 100 J.) | Top 5 (30 / 100 J.) |
  | ------------------------ | --------------------- | ---------------------------- | ----------------------- | -------------------------------- | ------------------- |
  | 10 Jahre (heute)         | +19,6 %               | +6,3 %                       | 0,3 % / 0 %             | 0 % / 0 %                        | 22 % / 30 %         |
  | 30 Jahre                 | +11,6 %               | +4,2 %                       | 5 % / 0,3 %             | 0 % / 0 %                        | 32 % / 37 %         |
  | keine Rückkehr (`θ = 0`) | +3,2 %                | +1,4 %                       | 19 % / 32 %             | 2 % / 12 %                       | 52 % / 68 %         |
  | `θ = 0` und `θ_k = 0`    | +1,6 %                | +0,5 %                       | 25 % / 44 %             | 3 % / 16 %                       | 58 % / 80 %         |

- **Hintergrund von E-22:** E-22 wurde am 12.11.2026 gegen R12 entschieden. Vor AP 1.9a notierten nach 100 Jahren 29 % der Aktien unter 1 € und 9 % an der Untergrenze. Dort ließ sich ausnutzen, dass ein Kurs an der Untergrenze nur steigen kann, deshalb gibt es die Kaufsperre. Der Zielkonflikt war also: Querschnitt zusammenhalten gegen Irrfahrt der Kurse. Dass die Rückkehr eine handelbare Prämie erzeugt, steht nirgends in TS, Änderungsprotokoll oder Plan. TS §6.4 behauptet sogar das Gegenteil („riskantere Werte rentieren also nicht mehr systematisch schlechter“). Den gleichen Fehler hat AP 1.9b bei Dividenden ohne Abschlag im Zielpfad erkannt und deshalb verworfen („ausnutzbare Mehrrendite“, Änderungsprotokoll). Für `U_i` wurde er nicht geprüft.
- **Folgerung:**
  - Ein Spieler mit einfachem, sichtbarem Vorgehen verdoppelt bis verdreifacht die Rendite des Index, nach allen Kosten und in jedem Seed.
  - Das trifft die Ziele der PS: „Strategien verproben“ in einem „Markt, der sich wie ein echter verhält“, Benchmark gegen den Weltindex.
  - Die Schwelle „ausnutzbar“ ist klar überschritten. Ein schwächeres `θ` halbiert den Effekt nur. Erst ohne Rückkehr liegt er im realen Bereich, dann aber gelten die R12-Grenzen nicht mehr.
  - Auch die Rückkehr der Unterfaktoren trägt bei (rund 1,5 Punkte bei `θ = 0`).

### Kalibrierung außerhalb der fünf Seeds (7.1b-03)

- **Messung** (`prehistory.ts`, `pre-summary.txt`): Die Statistik des Labors über den Vorlauf ab Epoche (`LabSimulation.runPrehistory`, `statistics('epoch')`), wie in der Suite, auf 60 frischen Seeds. Dazu eine Stichprobe: der Anteil zufälliger 5er-Sätze aus diesen Seeds, deren Median im Band läge.

  | Ziel (Vorlauf)                  | Median `calib-1…5` | Median 60 frische Seeds (10.–90. Perzentil) | frische Seeds im Band | 5er-Sätze im Band |
  | ------------------------------- | ------------------ | ------------------------------------------- | --------------------- | ----------------- |
  | Volatilität Weltindex (14–18 %) | 14,2 %             | 12,9 % (11,3–16,2 %)                        | 18 / 60               | 18 %              |
  | Kurtosis Weltindex (≥ 5)        | 6,5                | 4,9 (4,0–10,5)                              | 28 / 60               | 45 %              |
  | Korrelation innerhalb (0,5–0,6) | 0,57               | 0,52 (0,46–0,61)                            | 34 / 60               | 80 %              |
  | Korrelation zwischen (0,2–0,4)  | 0,39               | 0,36 (0,29–0,46)                            | 47 / 60               | 93 %              |
  | Cluster Lag 1 (0,10–0,30)       | 0,25               | 0,20 (0,12–0,36)                            | 43 / 60               | 96 %              |
  | übrige Ziele mit Band           | –                  | im Band                                     | ≥ 48 / 60             | ≥ 95 %            |

- **Krisenanteil im Vorlauf:** `calib-1…5` 10,1 / 25,3 / 11,6 / 10,7 / 11,9 %, frische Seeds im Median 5,4 % (Mittel 7,2 %, stationär 7,9 %). Über die Seeds korreliert er mit der Weltvolatilität mit 0,88. Fables Erklärung stimmt.
- **Langer Lauf** (`long.ts`, 20 frische Seeds, 110 Jahre): Weltvolatilität 14,25 % (13,4–18,8 %), Rendite 6,6 %, Kurtosis 6,7, Bärenmärkte 0,13 je Jahr. Über lange Zeit liegt das Modell also am unteren Rand der Bänder, nicht darunter.
- **Folgerung:** Der Befund steht, und auf 60 Seeds ist er deutlicher als bei Fable (20 Seeds, Kurtosis 6,2). Ein typischer Seed ist im Vorlauf ruhiger, als das Band verlangt. Ein Modellfehler ist das nicht: 10-Jahres-Fenster realer Weltindizes streuen ähnlich (rund 11–20 %). Das Problem ist die Prüfregel. Sie prüft einen günstigen Seed-Satz, nicht das Modell. Stellt man sie heute auf mehr Seeds, wird die Suite rot, und es braucht eine Neukalibrierung mit neuer `SIM_VERSION`. Diese kommt mit 7.1b-01 ohnehin.

### Kappung nur zur Epoche (7.1b-04)

- **Messung:** Opus' Skript `caps.ts` auf 6 frischen Seeds: Zum Spielstart liegen 51 von 96 gekappten Indizes über ihrer Grenze. Größtes Gewicht zu Grenze im Median 1,03, höchstens 2,66 (Sektorindex, Grenze 25 %, Gewicht 48 %).
- **Code:** `index-layout.ts:50–51` kappt mit `startPrice`. Das Profil zeigt `capWeight` als „Höchstgewicht je Wert“ (`instrument-profile.component.html:88–94`).
- **Folgerung:** Bestätigt. Die Anzeige widerspricht der Zusammensetzung derselben Seite. Ausnutzbar ist das nicht; die Kappung gilt in Stufe 1 nur zur Auflage, und die Neugewichtung ist für Stufe 2 geplant.

### Regionen (7.1b-05)

- **Messung:** Fables `facts.mjs` auf 6 frischen Seeds: Korrelation der Monatsrenditen Nordamerika/Europa 0,51–0,59, Nordamerika/Asien-Pazifik 0,42–0,58; Volatilität der Regionalindizes 18–23 %.
- **Folgerung:** Bestätigt. Die Werte liegen unter modernen Korrelationen (rund 0,75–0,85), aber im Bereich der 1970er bis 1990er Jahre. Ein Spieler gewinnt durch Streuung über Regionen etwas mehr Ruhe als real, aber keine Rendite. Deshalb niedrig statt mittel. Am selben Tag korreliert Nordamerika (t) mit Asien-Pazifik (t + 1) mit 0,4–0,5. Ausnutzbar ist das nicht: Aktien in Asien-Pazifik eröffnen mit dem nachgeholten Schock, und ETFs handeln zum indikativen Wert.

### Float32-Kerzen (7.1b-11)

- **Rechnung:** Gespeichert wird `Float32`. Für Werte in [2^17, 2^18) ist der Abstand zweier darstellbarer Werte 2^−6 ≈ 0,0156, der Rundungsfehler also bis 0,0078 > 0,005. Ab 131.072 € kann die angezeigte Cent-Stelle abweichen, darunter nicht (Fehler ≤ 0,0039). Opus nennt „rund 83.000 €“, das ist zu niedrig. Der Befund bleibt.

### Kleinere Nachrechnungen

- **Geld und Brief an den Rastergrenzen (Fable B-07):** Fables `quote.mjs` neu ausgeführt: Mitte 9,998 € bei 0,25 % ergibt Brief 10,011 €, Mitte 0,9999 € ergibt Brief 1,0012 €. Das stimmt mit `price-step-logic.ts:31–36` überein (Raster der Mitte).
- **Dividenden auf Cent (Fable B-08):** 2,5 % quartalsweise bei 0,79 € ergibt 0 Cent (genau 0,49 Cent). Stimmt.
- **Konstante idiosynkratische Volatilität (beide):** `instrument-step.ts:39` nimmt `layout.idioVol[i]` ohne Tagesfaktor. ACF(r², 1) im Median der Aktien auf 8 frischen Seeds 0,004–0,014, passend zu 0,009 (Fable) und 0,010 (Opus).
- **Kalibrierungs-Suite:** `npm run test:calibration` einmal ausgeführt, 6 Dateien, 79 Tests grün, 82 s (`calibration.log`).

## Gemeinsame Befundliste

### 7.1b-01 Rückkehr von `U_i` zum Zielpfad macht Verlierer- und Gleichgewichtungsstrategien zu sicheren Gewinnern

- **Schwere:** hoch, **Art:** Modellfehler (ausnutzbar)
- **Quelle:** Opus B-01, Fable B-01
- **Befund:**
  - `U_i` kehrt mit 10 Jahren Halbwertszeit zu einem bekannten, deterministischen Zielpfad zurück, und kein Unternehmen fällt aus. Damit ist der Abstand zum eigenen Höchstkurs oder die Rendite der letzten Jahre ein verlässliches Signal.
  - Jede Aktie hat im eingeschwungenen Zustand eine erwartete einfache Mehrrendite von rund ½·`v_i` p. a. über dem Index (Large Caps rund 2, Small Caps rund 12 Punkte). Der kapitalgewichtete Index bekommt sie nicht.
  - Über 110 Jahre verliert keine Aktie; in den Messungen rentiert auch die schlechteste mit +1,7 % p. a. oder mehr.
  - Momentum fehlt; das Reversal ist mehrfach so stark wie real.
  - TS §6.4 behauptet, riskantere Werte rentierten „nicht mehr systematisch schlechter“; tatsächlich rentieren sie systematisch besser.
- **Beleg:**
  - `instrument-step.ts:103–117` (`reversionDecay · (U_close − target)`), `default-market-config.ts:68` (`idioReversion: Math.LN2 / 10`), TS §6.4 „Langzeitverhalten“, E-22.
  - Messung oben: Die 20 Aktien mit dem größten Abstand zum Höchstkurs, jährlich getauscht, liegen nach Kosten und Steuern +12,2 Punkte p. a. über dem Welt-ETF, in 60 von 60 Seeds. Die Gleichgewichtung eines Zufallsdepots liegt +3,4 Punkte darüber.
- **Vorschlag:** E-22 neu entscheiden. Ein Parameter allein reicht nicht (Probe: Halbwertszeit 30 Jahre halbiert den Effekt nur). Zwei Wege:
  - **(a) Stufe 1, Aufwand M:**
    - `U_i` in einen dauerhaften Anteil teilen (Irrfahrt mit vollem Kompensator) und einen kleinen vorübergehenden Anteil (heutige Rückkehr, z. B. 20 % der Varianz). Fables Überschlag: Prämie dann rund 1–1,5 Punkte.
    - Die Rückkehr der Unterfaktoren (`θ_k`) prüfen; sie trägt rund 1,5 Punkte bei.
    - Die Grenzen von `LONG_TERM_LIMITS` (Top 5, unter 1 €, Untergrenze) neu messen. Ohne Lebenszyklus steigen sie deutlich, nach der Probe mit `θ = 0` auf 52 % / 19 % / 2 % nach 30 Jahren. Der PO entscheidet sie neu oder begrenzt sie auf 30 Jahre.
  - **(b) Stufe 1 und M9, Aufwand L:** wie (a) mit fast vollständig dauerhaftem Anteil. Dazu Neugewichtung der Indizes (vorgezogen aus US-MK-16) und Insolvenzen an der Untergrenze (Lebenszyklus E-40, AP 9.2a/b) vorziehen. Das ist der reale Mechanismus gegen Konzentration und Pennystocks.
  - In beiden Fällen:
    - neue Kalibrierungsziele: Mehrrendite der jährlich umgeschichteten Gleichgewichtung gegen den Performanceindex ≤ 2 Punkte, Mehrrendite der 20 tiefsten Abstände zum Hoch ≤ 2–3 Punkte, Anteil der Aktien mit negativer Rendite über 30 Jahre als Info;
    - TS §6.4, §6.9 und R12 berichtigen.
- **Folgen:** Golden Master bricht, neue `SIM_VERSION`, bestehende Spieler gesperrt; vollständige Neukalibrierung (7.1b-02, 7.1b-03 und 7.1b-05 gehen mit). Aufwand M (a) bis L (b).
- **Empfehlung:** **7.3 Modell.** Das Spiel ist mit einer einfachen, sichtbaren Strategie in jedem Seed ausnutzbar, und das widerspricht dem Kern der PS. Den Weg (a) oder (b) und die neuen R12-Grenzen entscheidet der PO. Ich empfehle (a) in 7.3 und den Rest von (b) wie geplant in M9.

### 7.1b-02 Einzelaktien zeigen kein Volatilitäts-Clustering, Large Caps kaum fette Ränder

- **Schwere:** mittel, **Art:** Modellfehler (fehlender Stylized Fact), Testlücke
- **Quelle:** Opus B-02, Fable B-03
- **Befund:**
  - `σ_i` ist konstant (TS §6.4: Skalierung „vorgesehen, aber nicht umgesetzt“). Clustering entsteht nur über die Faktoren.
  - ACF(r², 1) im Median der Aktien liegt bei rund 0,01 (Small Caps 0,001, Large Caps 0,06–0,08), real bei rund 0,1–0,25.
  - Die Kurtosis der Large Caps liegt bei 4,2.
  - Das Ziel `clustering-lag1` misst nur den Weltindex.
- **Beleg:** `instrument-step.ts:39`; Messungen beider Läufe (25 bzw. 5 Seeds) und eigene auf 8 frischen Seeds (0,004–0,014).
- **Vorschlag:** `σ_i` des Tages mit einem gedämpften Marktzustand skalieren, z. B. `(s_Welt/s̄_Welt)^φ` mit φ ≈ 0,5. Den Kompensator mit der Tagesvarianz rechnen. Info-Zeile oder Ziel „ACF(|r|, 1) im Median der Aktien“ ergänzen.
- **Folgen:** Golden Master, `SIM_VERSION`; Neukalibrierung von Korrelationen (in Krisen sinken sie) und Kurtosis. Aufwand M.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen**, also in der Modelländerung von 7.1b-01. Spieler sehen den Unterschied in Einzelcharts nur bei genauem Hinsehen, und ausnutzbar ist er nicht. Allein rechtfertigt er keine `SIM_VERSION`.

### 7.1b-03 Kalibrierung hängt an fünf krisenlastigen Seeds; auf typischen Seeds liegen Weltvolatilität und Kurtosis im Vorlauf unter dem Band

- **Schwere:** mittel, **Art:** Testlücke (Prüfregel E-34)
- **Quelle:** Fable B-02, Opus B-10
- **Befund:**
  - Die Ziele mit Mindestdauer bis 10 Jahre werden nur über den Vorlauf von `calib-1…5` geprüft. Diese Seeds haben 10–25 % Krisenzeit, typisch sind 5 %.
  - Auf 60 frischen Seeds liegen im Median die Weltvolatilität bei 12,9 % (Band 14–18 %) und die Kurtosis bei 4,9 (≥ 5).
  - Nur 18 % bzw. 45 % zufälliger 5er-Sätze bestünden die Prüfung.
  - Die Langzeitziele (Rendite, Bärenmärkte) streuen im Median von 5 Seeds um rund 0,8 Punkte bei 2 Punkten Bandbreite (Opus).
- **Beleg:** `calibration-targets.calibration.spec.ts` (`TEST_SEEDS.calibration`), Messung oben (`pre-summary.txt`, `long-summary.txt`).
- **Vorschlag:**
  - Die Prüfregel auf mindestens 20 Seeds stellen (rund 2 s je Seed für den Vorlauf, 16 s für den langen Lauf). Die Vorlauf-Ziele zusätzlich über den langen Lauf prüfen.
  - Die Neukalibrierung von 7.1b-01 gleich gegen diesen breiteren Satz machen.
  - Ob die Vorlauf-Bänder für einen typischen Seed gelten sollen oder für den Mittelwert, entscheidet der PO.
- **Folgen:** Allein die Prüfregel zu ändern macht die Suite rot. Daran hängt eine Neukalibrierung mit `SIM_VERSION`. Laufzeit der Suite: rund 5–6 min statt 1,5 min. Aufwand S (Prüfregel) plus Neukalibrierung.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen**, in 7.3 zusammen mit 7.1b-01. Die Bänder bleiben PO-Entscheidung.

### 7.1b-04 Kappung nur zur Epoche: Das Indexprofil zeigt eine Grenze, die zum Spielstart verletzt ist

- **Schwere:** mittel, **Art:** sichtbare Unstimmigkeit
- **Quelle:** Opus B-03
- **Befund:**
  - Kappungsfaktoren aus den Startkursen zur Epoche, danach fest.
  - Zum Spielstart liegen 46 von 80 (Opus) bzw. 51 von 96 (frische Seeds) gekappten Indizes über ihrer Grenze, bis zum 2,7-Fachen.
  - Das Profil zeigt „Höchstgewicht je Wert 15 %“, die Zusammensetzung derselben Seite 32 %.
- **Beleg:** `index-layout.ts:50–51`, `instrument-profile.component.html:88–94`, TS §6.6; `caps.txt`.
- **Vorschlag:** Im Profil „Höchstgewicht bei Auflage“ zeigen und TS §6.6 ergänzen. Die Kappung zum Spielstart zu berechnen (ändert Indizes und ETFs, nicht Aktien, Aufwand S–M) in die Modelländerung von 7.1b-01 aufnehmen, sofern sie nicht ohnehin durch die Neugewichtung aus 7.1b-01 (b) ersetzt wird.
- **Folgen:** Anzeige und Doku: kein Golden Master, Aufwand S (neuer i18n-Text).
- **Empfehlung:** **7.3 ohne Modelländerung.** Die Anzeige ist falsch, die Ursache ist eine dokumentierte Vereinfachung von Stufe 1.

### 7.1b-05 Regionen sind schwach korreliert, Regionalindizes rund 20 % volatil

- **Schwere:** niedrig, **Art:** Modellfehler (Kalibrierung)
- **Quelle:** Fable B-04, Opus B-07
- **Befund:**
  - Der Regionsfaktor (10,3 %) ist fast so stark wie der Weltfaktor (13,2 %). Das war nötig für die Overnight-Ziele (TS §6.9, Zielkonflikt E-34).
  - Monatskorrelation Nordamerika/Europa 0,51–0,59 (real seit 2000 rund 0,75–0,85).
  - Regionalindizes 18–23 % Volatilität, größter Drawdown im Median 75–82 %.
  - Kein Ziel misst das.
- **Beleg:** `default-market-config.ts:60`; Messungen beider Läufe und eigene auf 6 frischen Seeds.
- **Vorschlag:** In der Neukalibrierung den Regionsfaktor schwächer und den Weltfaktor stärker setzen. Den Konflikt mit den Overnight-Zielen neu abwägen. Info-Zeilen siehe 7.1b-07.
- **Folgen:** Golden Master, `SIM_VERSION`, Neukalibrierung von Overnight, Korrelation und Indexvolatilität. Aufwand M.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen.** Mehr Nutzen aus regionaler Streuung ist weniger Risiko, keine ausnutzbare Rendite. Das ist nicht grundlegend.

### 7.1b-06 Die Zählung der Bärenmärkte weicht von der üblichen Definition ab

- **Schwere:** niedrig, **Art:** Messvorschrift
- **Quelle:** Opus B-04
- **Befund:**
  - Gemessen wird der Performanceindex, und eine Episode endet erst mit einem neuen Hoch.
  - Mit der üblichen Definition (−20 % vom Hoch bis +20 % vom Tief, Kursindex) wären es rund 0,29 je Jahr statt 0,145, also über dem Band. Mit der heutigen Definition liegt der Kursindex bei 0,12, unter dem Band.
  - Auf 20 frischen Seeds liegt die heutige Messung bei 0,13, knapp im Band.
- **Beleg:** `lab-statistics.ts` (`drawdownEpisodes(sample.worldTotalReturn, 0.2)`), `drawdown-logic.ts:28–46`; `bear.txt` (Opus), `long-summary.txt`.
- **Vorschlag:** Definition und Quelle des Ziels in TS §6.9 nennen; die andere Zählung als Info-Zeile führen.
- **Folgen:** nur Messung und Doku. Aufwand S.
- **Empfehlung:** **PO entscheidet**, welche Definition das Band meint. Ich empfehle, die heutige Messung beizubehalten, sie zu dokumentieren und die übliche Zählung als Info zu zeigen.

### 7.1b-07 Messlücken: Regionalindizes, Autokorrelation, Langfristrisiko und Höchstkurs haben keine Info-Zeilen

- **Schwere:** niedrig, **Art:** Testlücke
- **Quelle:** Opus B-07, B-08; Fable B-04 (Teil), B-05, B-09, B-10
- **Befund:**
  - Ohne Info-Zeile fallen Änderungen in diesen Größen bei Modelländerungen nicht auf:
    - Volatilität, Drawdown und Korrelation der Regionalindizes;
    - Lag-1-Autokorrelation (Weltindex 0,17 wegen asynchroner Schlüsse, Aktien 0,00);
    - Volatilität des Weltindex auf Wochen- und Monatsbasis (16,2–17,2 % gegen 14,5–14,8 % täglich, beide Läufe);
    - größter Drawdown (Median 73 %), längste Zeit unter dem Hoch (Median 16 Jahre) und schlechtestes 30-Jahres-Fenster (bei 7 von 25 Seeds negativ, Fable);
    - Höchstkurs;
    - Konzentration am Stichtag 25 Jahre (höchster Wert 56 %, Fable).
  - Das Tagesziel der Weltvolatilität misst eine geglättete Reihe.
- **Beleg:** `calibration-targets.ts`, TS §6.9; Messungen beider Läufe (nicht eigens nachgemessen, beide Läufe stimmen bei der Autokorrelation und der Wochenvolatilität überein).
- **Vorschlag:** Info-Zeilen in `CALIBRATION_TARGETS` bzw. im Seed-Vergleich ergänzen; Stichtag 25 Jahre in die Prüfung von `LONG_TERM_LIMITS` aufnehmen. Ob die Weltvolatilität künftig auf Wochenbasis gemessen wird, entscheidet der PO mit der Neukalibrierung.
- **Folgen:** nur Labor und Tests, neue i18n-Texte. Aufwand S–M.
- **Empfehlung:** **7.3 ohne Modelländerung**, vor der Neukalibrierung von 7.1b-01, damit sie deren Wirkung zeigen.

### 7.1b-08 Geld- und Briefkurs können an den Stufengrenzen außerhalb ihres eigenen Preisrasters liegen

- **Schwere:** niedrig, **Art:** Abweichung innerhalb der Spezifikation
- **Quelle:** Fable B-07
- **Befund:**
  - `bidAsk` rundet mit dem Raster des Mittelkurses. Beispiele: Mitte 9,998 € ergibt Brief 10,011 €, Mitte 10,004 € ergibt Geld 9,99 € (effektiver Spread doppelt).
  - TS §6.7 widerspricht sich damit selbst (Formel gegen Rasterregel).
- **Beleg:** `price-step-logic.ts:31–36`; `quote.mjs` neu ausgeführt.
- **Vorschlag:** In TS §6.7 die Ausnahme nennen. Das Runden je Seite auf das eigene Raster nur mitnehmen, wenn die Kursbildung ohnehin geändert wird.
- **Folgen:** Doku: keine. Code: kein Golden Master, aber andere Ausführungskurse in bestehenden Spielständen. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung** (Doku-Korrektur). Die Wirkung liegt bei Zehntelpunkten an zwei Kursgrenzen.

### 7.1b-09 Dividenden werden je Aktie auf ganze Cent gerundet

- **Schwere:** niedrig, **Art:** Randfall
- **Quelle:** Fable B-08
- **Befund:**
  - Unter rund 0,80 € zahlt ein Quartalszahler mit 2,5 % nichts, der Zielpfad zieht den erwarteten Abschlag trotzdem ab.
  - Zwischen 1 € und 5 € weicht die Zahlung bis rund 30 % ab.
  - Heute selten (keine Aktie unter 1 €). Ohne Rückkehr (7.1b-01) wird es häufig: nach der Probe 19 % unter 1 € nach 30 Jahren.
- **Beleg:** `dividend-logic.ts:69–75`; nachgerechnet (0,79 € → 0 Cent statt 0,49).
- **Vorschlag:** Dividende je Aktie mit vier Nachkommastellen führen, erst die Gutschrift auf Cent runden.
- **Folgen:** Golden Master, `SIM_VERSION`; berührt Buchung und Steuer. Aufwand M.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen**, zwingend, wenn 7.1b-01 mehr Kurse unter 5 € erzeugt.

### 7.1b-10 Dividenden folgen dem Kurs eins zu eins

- **Schwere:** niedrig, **Art:** vereinfachte Annahme
- **Quelle:** Opus B-06
- **Befund:**
  - Betrag = Zielrendite × letzter Schlusskurs ÷ Frequenz. Fällt der Kurs um 50 %, sinkt die nächste Dividende um 50 %.
  - Die Dividendenrendite steigt in Krisen nicht; real sind Dividenden geglättet.
- **Beleg:** `dividend-logic.ts` (`dividendCents`), `instrument-step.ts:140–147`; Konstruktion.
- **Vorschlag:** Geglätteter Dividendenpfad (Lintner) mit dem Fachkonzept zu Dividendenkürzungen in Stufe 2; `D_i` neu herleiten.
- **Folgen:** Golden Master, `SIM_VERSION`, Neukalibrierung der Dividendenrenditen. Aufwand M.
- **Empfehlung:** **Bei nächster Modelländerung mitnehmen**, sinnvoll erst mit M9 (Lebenszyklus, Kürzungen). Es ist eine Verbesserung und kein Fehler.

### 7.1b-11 Kurse wachsen ohne Splits in die Millionen; Float32-Kerzen verlieren ab 131.072 € die Cent-Genauigkeit

- **Schwere:** niedrig, **Art:** bekannte Grenze, Randfall der Implementierung
- **Quelle:** Opus B-05, Fable B-09
- **Befund:**
  - Teuerste Aktie nach 100 Jahren im Median rund 0,5 Mio. €, im oberen Zehntel 3,5–3,8 Mio. €.
  - Tages- und Wochenkerzen sind `Float32`. Ab 2^17 = 131.072 € kann die OHLC-Anzeige eine andere Cent-Stelle zeigen als Kurs und Quote (Opus' Schwelle von 83.000 € ist zu niedrig, siehe „Nachgeprüft“).
- **Beleg:** `engine/data-access/worker/daily-candles.utils.ts:58`, TS §6.4, §6.8.
- **Vorschlag:** Grenze in TS §6.8 dokumentieren; Splits mit US-MK-16 in M9 und dort ein Ziel für die Kursspanne.
- **Folgen:** Doku: keine. `Float64`-Kerzen: Migration des Stores, doppelter Speicher, keine `SIM_VERSION`.
- **Empfehlung:** **7.3 ohne Modelländerung** (Doku); die Splits bleiben in M9.

### 7.1b-12 Die Phase „Krise“ ist ein Volatilitätsregime, kein Abschwung

- **Schwere:** niedrig, **Art:** Doku, Hinweis für Stufe 2
- **Quelle:** Fable B-06
- **Befund:** Eine Krise bringt im Mittel −1,6 % Indexrendite bei 20 % Streuung, 53 % der Krisen enden im Plus. Die Asymmetrie der Renditen insgesamt stimmt (Schiefe monatlich −0,58). Meldet der Newsticker der Stufe 2 Phasenwechsel als „Krise“, steigt der Markt danach jedes zweite Mal.
- **Beleg:** Fable `facts.ts`, Block `long` (nicht eigens nachgemessen; folgt aus Trendziel −5 %, Halbwertszeit 2,8 Monate, Dauer 0,4 Jahre).
- **Vorschlag:** In TS §6.3 und §6.10 festhalten, dass die Phase ein Volatilitätsregime ist und der Newsticker sie nicht als Richtungsaussage verwendet.
- **Folgen:** nur Doku. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.**

### 7.1b-13 Kennzahlen in TS §6.2–§6.4 und §6.9 stammen von den Kalibrierungs-Seeds

- **Schwere:** Hinweis, **Art:** Abweichung Doku↔Messung
- **Quelle:** Opus B-09, Fable B-02 (Teil)
- **Befund:**
  - TS nennt 7,3 % Rendite des Weltindex, 14,5 % Volatilität des Weltfaktors und 1,9 % Steigung `ḡ_Welt − r_z`.
  - Über viele Seeds sind es 6,6–6,7 % Rendite (eigene 20 Seeds 6,6 %, Fable 25 Seeds 6,65 %, Opus 40 Seeds 6,7 %), 13,2 % Volatilität (40 bzw. 150 Seeds) und rund 1,1 % Steigung.
  - Das Modell hat keinen Bias: Messung und Erwartung `m − ½E[s²]` stimmen auf 0,1 Punkte.
- **Beleg:** Opus `drift.txt`, Fable `factor.json`, eigene `long-summary.txt`.
- **Vorschlag:** Zahlen als Werte von `calib-1…5` kennzeichnen und die Erwartung daneben stellen; nach der Neukalibrierung über den breiten Seed-Satz neu messen.
- **Folgen:** nur Doku. Aufwand S.
- **Empfehlung:** **7.3 ohne Modelländerung.**

## Verworfen

- **Keinen Befund ganz verworfen.** Alle Belege beider Läufe waren nachvollziehbar.
- **Berichtigt:**
  - Opus B-05: Schwelle der Cent-Genauigkeit 131.072 € statt „rund 83.000 €“.
  - Fable B-02: Auf frischen Seeds liegt nicht nur die Weltvolatilität unter dem Band, sondern im Median von 60 Seeds auch die Kurtosis (4,9 statt Fables 6,2 auf 20 Seeds). Die Aussage „alle übrigen Ziele im Band“ gilt damit nicht.
- **Abgestuft:**
  - Fable B-04 (Regionen) von mittel auf niedrig: nicht ausnutzbar, im historischen Bereich.
  - Fable B-02 bleibt mittel, gilt aber als Testlücke und nicht als Modellfehler: Über 110 Jahre liegt das Modell im Band.
- **Nicht übernommen als Begründung:** Opus' Satz, reale notleidende Aktien rentierten „eher schlechter“ (Bessembinder, aus dem Gedächtnis). Für 7.1b-01 ist er nicht nötig: Die eigene Messung gegen den Welt-ETF trägt den Befund allein.

## Empfehlung an den Product Owner

- **7.3 Modell:**
  - 7.1b-01 Rückkehr von `U_i`: Verlierer- und Gleichgewichtungsstrategien als sichere Gewinner. Der PO entscheidet E-22 neu (Weg a oder b) und die R12-Grenzen.
- **7.3 ohne Modelländerung:**
  - 7.1b-04 Anzeige der Kappung („bei Auflage“),
  - 7.1b-07 Info-Zeilen und Stichtag 25 Jahre,
  - 7.1b-08 TS §6.7 Rastergrenzen,
  - 7.1b-11 TS §6.8 Float32-Grenze,
  - 7.1b-12 TS §6.3/§6.10 Krise als Volatilitätsregime,
  - 7.1b-13 TS-Kennzahlen kennzeichnen.
- **Bei nächster Modelländerung mitnehmen** (de facto mit 7.1b-01 in 7.3):
  - 7.1b-02 Volatilitäts-Clustering der Einzelaktien,
  - 7.1b-03 Prüfregel und Neukalibrierung auf mindestens 20 Seeds,
  - 7.1b-05 Korrelation der Regionen,
  - 7.1b-09 Dividenden mit vier Nachkommastellen,
  - 7.1b-10 geglättete Dividenden (eher M9).
- **PO entscheidet:**
  - 7.1b-06 Definition der Bärenmärkte (Empfehlung: heutige Messung dokumentieren, übliche Zählung als Info).
- **Nicht umsetzen:** –

**Vorschlag für den Schnitt von AP 7.3** (Marktmodell):

1. **7.3-M1 Messung zuerst** (ohne `SIM_VERSION`):
   - Info-Zeilen aus 7.1b-07,
   - neue Ziele für die Prämien aus 7.1b-01 als Info,
   - breiter Seed-Satz für die Prüfregel (7.1b-03), zunächst nur als Info-Lauf,
   - Doku-Korrekturen 7.1b-04, -08, -11, -12, -13.
2. **7.3-M2 Modelländerung** (eine neue `SIM_VERSION`):
   - Aufteilung von `U_i` nach E-22 neu (7.1b-01),
   - `θ_k` prüfen,
   - Clustering (7.1b-02),
   - Dividenden auf vier Nachkommastellen (7.1b-09),
   - optional Kappung zum Spielstart (7.1b-04).
3. **7.3-M3 Neukalibrierung:**
   - auf mindestens 20 Seeds,
   - mit den Regionen (7.1b-05),
   - Entscheidung des PO über die Bänder (Vorlauf typisch oder Mittel, R12-Grenzen, Bärenmärkte).

Lebenszyklus und Neugewichtung bleiben in M9, außer der PO wählt Weg (b).

## Geprüft ohne Befund

- **Formeln und Tabellen:** Brückenformel (TS §6.1) als bedingte Verteilung hergeleitet; Beispieltabellen TS §6.2 (Aktivität der Regionsfaktoren), §6.4 (alle 9 Zeilen, Dividendenabschläge) und §6.5 (Lebenszyklus) unabhängig nachgerechnet; Parameter in TS §6.2 und §6.3 gleich `DEFAULT_MARKET_CONFIG`.
- **Drift:**
  - Driftkorrektur −½σ² des Weltfaktors (150 Seeds, kein Bias);
  - Konvexitätskorrektur der Unterfaktoren mit `γ_k`;
  - Kompensator von Diffusion und Sprüngen in `U_i`, Rest dritter Ordnung rund −0,03 % p. a.;
  - Log-Drift 6,1 % gegen Erwartung 6,0 % (40 Seeds).
- **Phasenkette:** stationäre Anteile 40,2 / 34,9 / 17,1 / 7,9 %, 0,197 Krisen je Jahr, P(Krise > 1 Jahr) 8,1 %; gemessen passend.
- **Stochastische Volatilität:** `E[s²] = s̄²·exp(ξ²/κ_s)`.
- **Tagesschritt:** Faktoren und Instrumente Zeile für Zeile gegen TS §6.2 und §6.4 gelesen (exakte OU-Diskretisierung, Ziehreihenfolge).
- **Indizes, ETFs, Spreads:**
  - Performanceindex `R ← R·I_ref/(I_ref − Punkte)`;
  - ETFs: TER, Tracking als Martingal, Topf und Ausschüttung;
  - Spread-Faktor 1–3 (an rund 3,4 % der Tage an der Obergrenze);
  - `bidAsk` mit mindestens einem Rasterschritt.
- **Stylized Facts des Weltindex (110 Jahre):**
  - Kurtosis rund 7,4,
  - Cluster Lag 1 rund 0,25 mit langem Gedächtnis,
  - Schiefe monatlich −0,58,
  - Leverage-Effekt schwach vorhanden,
  - Korrelation in Krisen deutlich höher;
  - auf 20 frischen Seeds Kurtosis 6,7, Cluster 0,24.
- **Equity-Premium und Dividendenrendite:** Equity-Premium rund 4–5 Punkte über Tagesgeld; Dividendenrendite des Weltindex 2,2 % (60 frische Seeds im Vorlauf 2,3 %).
- **Langzeitgrenzen und Lag-1-Autokorrelation:** Langzeitgrenzen (Top 5, unter 1 €, Untergrenze) im Median deutlich eingehalten, zum Preis von 7.1b-01. Lag-1-Autokorrelation der Aktien und Regionalindizes rund 0.
- **Messvorschriften:** `lab-statistics.ts`, `market-sample.ts`, `long-term-statistics.ts`, `intraday-statistics.ts` messen, was TS §6.9 beschreibt (Einschränkungen 7.1b-06, 7.1b-07).
- **Kalibrierungs-Suite:** grün in beiden Läufen und hier (79 Tests).
- **Lead-lag zwischen Regionen:** Nordamerika (t) → Asien-Pazifik (t + 1) 0,4–0,5 ist nicht ausnutzbar (Eröffnungsschock, indikative ETF-Werte).
- **Nicht geprüft (beide Läufe und hier):**
  - Kerzen-Verdichtung und `PriceSource` nur gelesen;
  - ETF-Tracking-Differenz nicht gemessen;
  - Minutenebene nur über die Suite;
  - Literaturwerte aus dem Gedächtnis, nur zur Einordnung.
