# PortfoliGo – Projektplan

> **Status:** Entwurf v0.2 · **Stand:** 13.11.2026
> **Grundlagen:** [Produktspezifikation](./specs/produktspezifikation.md) (PS) · [Technische Spezifikation](./specs/technische-spezifikation.md) (TS)

Dieser Plan zerlegt PortfoliGo in Meilensteine und Arbeitspakete (AP). Ein AP ist so geschnitten, dass es in **einer Session** umgesetzt werden kann. Verweise wie `US-SP-01` zeigen auf User Stories der Produktspezifikation, `TS §3.2` auf Abschnitte der technischen Spezifikation, `E-02` auf Entscheidungen (TS §16).

## Inhalt

1. [Überblick](#1-überblick)
2. [Arbeitsweise in Sessions](#2-arbeitsweise-in-sessions)
3. [Offene Entscheidungen](#3-offene-entscheidungen)
4. [Statusübersicht](#4-statusübersicht)
5. [Stufe 1: Meilensteine M0–M6](#5-stufe-1-meilensteine-m0m6)
6. [Spätere Ausbaustufen](#6-spätere-ausbaustufen)
7. [Änderungsprotokoll](#7-änderungsprotokoll)

## 1. Überblick

Geplant wird rollierend: Die Meilensteine bis zum MVP (Stufe 1, M0–M6) sind in Arbeitspakete zerlegt. Spätere Stufen sind als Epics skizziert und werden detailliert, sobald das MVP steht und die Prioritäten feststehen.

```mermaid
flowchart TD
  M0[M0 Fundament] --> M1[M1 Simulationskern]
  M1 --> M2[M2 Engine und Spieler]
  M2 --> M3[M3 Banking und Haushalt]
  M2 --> M4[M4 Märkte und Charts]
  M3 --> M5[M5 Handel, Depot, Steuern]
  M4 --> M5
  M5 --> M6[M6 Export, PWA, Release 1.0]
  M6 --> M7[M7 Prüfung des Rechenkerns]
  M7 --> M8[M8 Zinsen, Inflation, Anleihen]
  M8 --> M9[M9 Rohstoffe, Edelmetalle, Fonds]
  M9 --> M10[M10 Realismus-Ausbau]
  M10 --> M11[M11 CFDs]
  M10 --> M12[M12 Regeln und Backtesting]
  M11 --> M13[M13 Lebenssimulation]
  M12 --> M13
  M13 --> M14[M14 Newsticker]
  M14 --> M15[M15 Achievements und Gamification]
  M15 --> M16[M16 Erben und Prestige]
  M6 -.-> N1[N1 Native App, optional]
  M10 -.-> N2[N2 Große Welt, optional]
```

| Meilenstein | Stufe | Ziel                                               | Ergebnis, das man zeigen kann                                                             | APs |
| ----------- | ----- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- | --- |
| M0          | 1     | Sauberes Fundament mit Design-System und App-Shell | Navigierbare, leere App im Trading-Look; CI prüft Lint, Tests und Build                   | 4   |
| M1          | 1     | Getesteter, deterministischer Simulationskern      | Simulations-Labor zeigt eine generierte Welt mit Kursverläufen und Statistiken            | 12  |
| M2          | 1     | Spielschleife mit Spielern, Uhr und Persistenz     | Spieler anlegen, Zeit in jeder Geschwindigkeit laufen lassen, schließen, nachberechnen    | 6   |
| M3          | 1     | Geldflüsse: Einkommen, Kosten, Gebühren, Zinsen    | Kontoauszüge füllen sich; Konten eröffnen, Geld überweisen, Warnungen                     | 6   |
| M4          | 1     | Märkte im Trading-Look                             | Marktübersicht, Screener, Watchlist, Instrumentseite mit Live-Chart und Indikatoren       | 5   |
| M5          | 1     | Kernspiel komplett                                 | Kaufen, verkaufen, Daueraufträge, Sparpläne, Steuern, Depot, Dashboard mit Benchmark      | 10  |
| M6          | 1     | Datensicherheit, Installierbarkeit, Feinschliff    | Version 1.0: Export und Import, PWA, Einstellungen, Hintergrundmodi, Deutsch und Englisch | 9   |

**Empfohlene Reihenfolge:** M3, M4 und M5 sind abgeschlossen (M5 mit der einmaligen Erhöhung von `SCHEMA_VERSION` auf 6, §5, M5). In M6 sind AP 6.7 (weitere Modi für das Verhalten im Hintergrund, `SCHEMA_VERSION` 7) AP 6.1 (Export und Import, Formatversion 1 mit den neuen Spielereinstellungen) AP 6.2 (Einstellungen) und AP 6.3 (PWA und Browser-Benachrichtigungen, `@angular/service-worker`) und AP 6.4 (Performance und Robustheit, Verdichtung alter Tageskerzen) fertig; als Nächstes folgt AP 6.5 (Barrierefreiheit, Hilfen und Hinweise). E-35 und die Ergänzungen zu E-10 sind entschieden (14.11.2026, §3). Die Sprachumschaltung (AP 6.8a, AP 6.8b) folgt nach AP 6.2; die Übersetzung kommt zuletzt, wenn alle Texte von M6 stehen. Ab AP 2.3 gibt es gespeicherte Spieler, die jede Modelländerung ungültig macht (TS §15); Änderungen am Marktmodell prüft seitdem die Kalibrierungs-Suite gegen die Ziele.

## 2. Arbeitsweise in Sessions

### 2.1 Vorbereitung

```sh
nvm use   # Node 22.22.3 laut .nvmrc – Angular CLI 22 verlangt ≥ 22.22.3
npm ci    # nur nötig, wenn sich Abhängigkeiten geändert haben
```

Für die Systemtests einmal je Rechner: `npx playwright install chromium`. Lokal laufen nur die Chromium-Projekte; Firefox und WebKit prüft die CI. Wer sie lokal braucht: `npx playwright install firefox webkit` und unter Linux und WSL `sudo npx playwright install-deps` (TS §14.1).

Für Tests auf dem Smartphone im lokalen Netz: `ng serve --ssl --host 0.0.0.0` – mehrere Browser-APIs funktionieren nur über HTTPS (TS §1.3).

### 2.2 Session starten

Vorlage für den Start einer Session:

> Setze AP 1.2 aus `docs/projektplan.md` um.

Claude liest dann `CLAUDE.md`, die Rules der betroffenen Domänen (`.claude/rules/<domain>.md`, Ist-Stand des Codes), das AP samt Abhängigkeiten, die jüngsten Einträge im [Änderungsprotokoll](./aenderungsprotokoll.md) und die Einträge zu den Abhängigkeiten (Suche nach `AP x.y`) sowie die referenzierten Abschnitte der Spezifikationen.

### 2.3 Ablauf

1. Prüfen, ob alle Abhängigkeiten des AP den Status „fertig" haben.
2. Betroffene Entscheidungen klären: Steht eine, die das AP braucht, noch auf „Vorschlag", fragt Claude nach, bevor darauf aufgebaut wird (§3 nennt für jede Entscheidung das AP, vor dem sie fallen muss).
3. In kleinen, testbaren Schritten umsetzen.
4. Prüfen: während der Arbeit `npm test` und die betroffenen Suiten, zum Abschluss `npm run verify` (Format, Lint, Typen, alle Testsuiten, Mutationstests, Build mit Bundle-Budget, Systemtests; TS §14.4); bei geänderten Texten `ng extract-i18n`.
5. Status (§4, Tabelle und Abhängigkeitsgraph), [Änderungsprotokoll](./aenderungsprotokoll.md) (neuer Eintrag oben) und den Ist-Stand der betroffenen Domänen in `.claude/rules/` aktualisieren. Weicht die Umsetzung von der Spezifikation ab, wird die Spezifikation angepasst.
6. Commits nur auf ausdrückliche Anweisung.

### 2.4 Definition of Done (für jedes AP)

- Die Abnahmekriterien des AP sind erfüllt.
- `npm run verify` läuft fehlerfrei.
- Jedes Abnahmekriterium ist durch einen benannten automatisierten Test abgedeckt oder als manuelle Prüfung im AP dokumentiert. Die Tests stehen schon beim Planen fest: Beispieltabellen (in der Spezifikation), Invarianten, Engine-Szenarien je Abnahmekriterium, Seiten- und Komponententests, Systemtest-Journeys (`CLAUDE.md` §10, TS §14.1). Erwartungswerte stammen aus unabhängigen Orakeln. Simulationscode hält die Determinismus-Regeln ein (TS §4.5).
- Neuer Regelcode ist in den Mutationstests erfasst; überlebende Mutanten sind durch Tests getötet oder im AP als äquivalent begründet.
- Berührt das AP ein Budget aus TS §14.3, ist es lokal mit der Perf-Suite gemessen und in TS §14.3 eingetragen.
- Neue oder geänderte Texte haben i18n-IDs, `messages.xlf` ist aktualisiert.
- Statusübersicht und [Änderungsprotokoll](./aenderungsprotokoll.md) sind gepflegt.
- Der Ist-Stand der berührten Domänen in `.claude/rules/<domain>.md` ist nachgeführt (neue Domäne: neue Rule-Datei und Zeile in der Modulkarte der `CLAUDE.md`).
- Hat sich eine Golden-Master-Prüfsumme (`market/domain/golden-master.ts`) geändert, steht das im [Änderungsprotokoll](./aenderungsprotokoll.md). Ab AP 2.3 ist dann auch `SIM_VERSION` erhöht (E-25); hat sich die Struktur des gespeicherten Zustands ohne Migration geändert, `schemaVersion` (TS §15).

### 2.5 Schnitt der Arbeitspakete

Wird ein AP für eine Session zu groß, teilt Claude es (z. B. AP 3.4a und 3.4b) und trägt die Teilung in §4 ein. Erkenntnisse, die spätere APs betreffen, kommen ins [Änderungsprotokoll](./aenderungsprotokoll.md).

## 3. Offene Entscheidungen

Diese Punkte sollte der Product Owner bestätigen oder ändern, spätestens bevor das genannte AP beginnt. Details und Begründungen stehen in TS §16 und den verlinkten Abschnitten. Am einfachsten ist es, alle Vorschläge gesammelt zu bestätigen und nur Abweichungen zu nennen; Claude trägt den Status dann in TS §16 ein.

| ID   | Frage                                               | Vorschlag                                                                                                  | Spätestens vor |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------- |
| E-25 | Versionsregeln ab 1.0 (TS §15; vor 1.0 entschieden) | Umfang der Kompatibilitätszusage festlegen, z. B. aktuelle und vorige `simVersion` spielbar, ältere lesbar | AP 6.6         |

**Bereits entschieden:** E-07 (`CLAUDE.md`), E-03 – Zufallsströme per MurmurHash3 x86_128, `sfc32`, eigene `detExp`/`detLog` (10.11.2026), E-09 – Geld in Cent, Stück in Millionstel, Kurse als Gleitkomma mit Preisraster (10.11.2026), E-20 – Kursberechnung mit dem Brückenmodell (10.11.2026; Begründung und Messwerte in TS §3.2, §6.1 und §6.6), E-06 – Tailwind CSS v4 mit angehobener Browserslist und Inter Variable als selbst gehostete Schrift (10.11.2026) sowie die Ergänzungen für `CLAUDE.md` aus TS §11.2 (10.11.2026, übernommen in AP 0.2), E-15 – Hash-Routing mit englischen Routenpfaden (10.11.2026), E-16 – Angular Aria neben dem CDK für Tabs und Menüs (10.11.2026), E-12 – Stufe 1 mit Aktien, ETFs und Indizes, CFDs bleiben in Stufe 3 (10.11.2026), E-13 – reale Regionen und Länder, fiktive Unternehmen, Banken, Börsen, Indizes, Emittenten und Kennungen; Standardwelt nach TS §5.2 (10.11.2026), E-17 – Banking mit sofortiger Eröffnung und Überweisung, Dispo mit geduldeter Überziehung, Bankbelastungen dürfen Verrechnungskonten ins Minus bringen (10.11.2026), E-02 – Tick = 1 Spielminute, Start Mo 01.04.2030 00:00, im Hintergrund Echtzeit (pro Spieler auf Pause umstellbar), eine Pause bleibt Pause (11.11.2026), E-18 – Handelszeiten je Region, Orders jederzeit, Ausführung in der Handelszeit (11.11.2026), E-04 – lightweight-charts 5.3.0 mit TradingView-Logo, lazy geladen; eigene SVG-Sparklines und -Donuts (Spike in AP 1.7, 11.11.2026), E-01 – autoritative Engine im Web Worker, NgRx hält nur Projektionen (12.11.2026), E-26 – die App bleibt bis 1.0 öffentlich, Impressum, Datenschutzhinweis und Hinweis „keine Anlageberatung“ erst in AP 6.5; das Risiko trägt der Product Owner (12.11.2026), E-27 – vierfache CPU-Drosselung (Chromium) statt Referenzgerät, Budgets Engine bei 1 w/s < 50 % eines Kerns und Spielstart < 6 s, erste Messung in M2 (12.11.2026), E-08 – Persistenz mit Ergänzungen: Marktzustände zu Monatsbeginn im eigenen Store (DB-Version 4), Write-ahead nur für Spielkommandos, Kommando-Log älter als der älteste Snapshot wird gelöscht, Uhr spätestens nach einem Spieltag gesichert, Tick des letzten `clock`-Ereignisses bei `pagehide` als Untergrenze; Tageskerzen bleiben je Spieler (12.11.2026), E-25 vor 1.0 – `SIM_VERSION` und `schemaVersion` ab AP 2.3, veraltete Spieler gesperrt (nur löschen; Zusage ab 1.0 offen bis AP 6.6) (12.11.2026), E-14 – Lebenshaltungskosten als Startparameter, Hausbank ist die erste Filialbank in Weltreihenfolge, Start pausiert, Vorgaben 10.000 € / 2.500 € / 1.800 € (12.11.2026). E-30 bis E-33 – Regionsfaktoren mit eigener Aktivität und Schwellenländer-Ziel als „Info“, Korrelationsziele über Large Caps, Zero-Beta-Rendite, Dividenden-Lebenszyklus (12.11.2026, Vorbereitung der Kalibrierung, AP 1.9b). E-34 – Prüfregel und Ziele der Kalibrierung: Median von `calib-1` bis `calib-5`, Korrelation zwischen Sektoren 0,2–0,4, Tagesprofil 1,3–2,0, Risikoklassen als Quintile (12.11.2026, AP 1.9c). E-11 – Steuern in Stufe 1: 25 % pauschal, 1.000 € Sparerpauschbetrag, ein Verlusttopf, ohne Soli und Kirchensteuer (13.11.2026). E-19 – Buchungstermine: Bank-Lauf 06:00, Gehalt am letzten, Lebenshaltung am ersten Bankarbeitstag des Monats (13.11.2026). E-17 ergänzt: Dispo je Bank nach dem Gehaltseingang bei ihr, geduldete Überziehung ohne Obergrenze (13.11.2026, TS §7.4). E-21 – Daueraufträge (US-BK-10) in Stufe 1 statt eines Abbuchungskontos je Sparplan; Sparpläne buchen nur vom Verrechnungskonto ihres Depots (13.11.2026, TS §7.4, §7.8). E-28 – ETF-Durchschau als Muss, zweite Vergleichsgröße, Story „Erste Schritte“ (US-UI-10, Soll) in Stufe 1, Depotübertrag (US-BK-12) als Story in Stufe 2 (13.11.2026). E-05 ergänzt: „Demnächst“ liest die planbaren Termine aus Terminplaner und Kalender mit Basisbeträgen, keine Vorausrechnung im MVP (13.11.2026, TS §8.1). E-05 – PWA im MVP mit `@angular/service-worker`, Capacitor als optionaler Meilenstein N1, Ports jetzt vorbereiten (14.11.2026, TS §13). E-10 – Exportformat mit gzip schon in Formatversion 1, ohne `commands`, Import startet pausiert (14.11.2026, TS §10). E-35 – Hintergrundmodi `keep-speed` und `custom-speed`, Pause-Frist `backgroundPauseAfter` auch bei geschlossener App, Lücken im Takt über 5 s zählen als Echtzeit, Auto-Pause verborgen in den neuen Modi (14.11.2026, TS §3.6, §3.7). E-36 – Deutsch und Englisch, Übersetzungen zur Laufzeit, ein Build, Standard Deutsch, Englisch als `en-GB` (14.11.2026, TS §11.9). Das Deployment ist laut Product Owner unter `https://algoristic.de/portfoligo/` per HTTPS erreichbar.

## 4. Statusübersicht

Status: **offen**, **in Arbeit**, **fertig**.

| AP   | Titel                                            | Status | Abhängig von         |
| ---- | ------------------------------------------------ | ------ | -------------------- |
| 0.1  | Aufräumen und Baseline                           | fertig | –                    |
| 0.2  | Design-System-Grundlage (Tailwind v4, Tokens)    | fertig | 0.1                  |
| 0.3  | App-Bootstrap und Infrastruktur                  | fertig | 0.1                  |
| 0.4  | App-Shell und UI-Grundkomponenten                | fertig | 0.2, 0.3             |
| 0.5  | Testkonzept und Testinfrastruktur                | fertig | 0.4, 1.8a            |
| 1.1  | Deterministischer Zufall und Mathematik          | fertig | 0.1                  |
| 1.2  | Spielkalender und Zeitmodell                     | fertig | 0.1                  |
| 1.3  | Weltgenerierung: Taxonomie, Unternehmen, Banken  | fertig | 1.1                  |
| 1.4  | Marktmodell: Tagesschritt und Vorlauf            | fertig | 1.2, 1.3             |
| 1.5  | Brücken, Minutenkurse und Kerzen                 | fertig | 1.4                  |
| 1.6a | Dividenden und Indizes                           | fertig | 1.5                  |
| 1.6b | ETFs, indikative Werte, Geld- und Briefkurse     | fertig | 1.6a                 |
| 1.7  | Simulations-Labor: Welt, Simulation, Chart-Spike | fertig | 1.6b, 0.4            |
| 1.8a | Simulations-Labor: Statistik                     | fertig | 1.7                  |
| 1.8b | Labor: Intraday, Langzeit, Selbsttest            | fertig | 1.8a                 |
| 1.9a | Marktmodell: Änderungen vor der Kalibrierung     | fertig | 1.8b                 |
| 1.9b | Marktmodell: Ergänzungen aus der Kalibrierung    | fertig | 1.9a                 |
| 1.9c | Kalibrierung des Marktmodells                    | fertig | 1.9b                 |
| 2.1  | GameEngine und Terminplaner                      | fertig | 1.6b                 |
| 2.2  | Worker-Host, Protokoll und EngineService         | fertig | 2.1, 0.3             |
| 2.3  | Persistenz im Worker und Wiederherstellung       | fertig | 2.2                  |
| 2.4  | Spielerverwaltung                                | fertig | 2.3, 0.4             |
| 2.5  | Spielsitzung und Uhr                             | fertig | 2.4                  |
| 2.6  | Einstellungen: Grundlage                         | fertig | 2.5                  |
| 3.1  | Hauptbuch und Kontenmodell                       | fertig | 2.4                  |
| 3.2  | Haushalt und periodische Buchungen               | fertig | 3.1                  |
| 3.3  | Bankkommandos und Banking-Slice                  | fertig | 3.2, 2.5             |
| 3.4  | Kontenübersicht und Kontoauszug                  | fertig | 3.3                  |
| 3.5  | Bankenvergleich, Dialoge und Monatsübersicht     | fertig | 3.4                  |
| 3.6  | Benachrichtigungen                               | fertig | 3.3, 2.6             |
| 4.1  | Marktdaten-Feed und Market-Slice                 | fertig | 2.5                  |
| 4.2  | Chart-Komponenten                                | fertig | 4.1, 1.7             |
| 4.3  | Indikatoren                                      | fertig | 4.2                  |
| 4.4  | Marktübersicht, Screener und Watchlist           | fertig | 4.2                  |
| 4.5  | Instrument-Detailseite                           | fertig | 4.3, 4.4, 1.8a       |
| 5.1a | Orderregeln als reine Funktionen                 | fertig | 3.3, 1.6b            |
| 5.1b | Orders in der Engine                             | fertig | 5.1a                 |
| 5.1c | Orders im Protokoll, Projektion, Texte           | fertig | 5.1b                 |
| 5.2  | Positionen, Lots, Ausschüttungen und Depotgebühr | fertig | 5.1c                 |
| 5.3  | Steuern                                          | fertig | 5.2                  |
| 5.4a | Trading-Slice und Order-Ticket                   | fertig | 5.3, 4.5, 3.6        |
| 5.4b | Orderbuch, Ändern und Stornieren                 | fertig | 5.4a                 |
| 5.5  | Depot, Positionen und Steuerübersicht (UI)       | fertig | 5.4                  |
| 5.6a | Daueraufträge                                    | fertig | 3.5, 5.1c            |
| 5.6b | Sparpläne                                        | fertig | 5.5                  |
| 5.7a | Tagesreihen, Rendite und Benchmark               | fertig | 5.5                  |
| 5.7b | Dashboard                                        | fertig | 5.7a                 |
| 5.7c | Erträge und Kosten, Dividendenkalender           | fertig | 5.7b                 |
| 5.8  | Chart: wählbare Auflösung und Indikatorfarben    | fertig | 4.5                  |
| 5.9  | Kopfzeile: stabiles Layout der Uhr               | fertig | 2.5                  |
| 6.1  | Export und Import                                | fertig | 5.6a, 5.6b, 5.7, 6.7 |
| 6.2  | Einstellungen                                    | fertig | 6.1, 3.6, 2.6        |
| 6.3  | PWA und Browser-Benachrichtigungen               | fertig | 6.2                  |
| 6.4  | Performance und Robustheit                       | fertig | 6.1, 1.9c, 6.7       |
| 6.5  | Barrierefreiheit, Hilfen und Hinweise            | offen  | 6.3                  |
| 6.6  | Release 1.0                                      | offen  | 6.4, 6.5, 3.5, 6.8b  |
| 6.7  | Verhalten im Hintergrund: weitere Modi           | fertig | 2.6, 3.6             |
| 6.8a | Sprachumschaltung: Mechanik                      | offen  | 6.2                  |
| 6.8b | Englische Übersetzung                            | offen  | 6.8a, 6.5, 6.7       |

### Abhängigkeitsgraph

Die Pfeile zeigen von der Voraussetzung zum abhängigen AP. Fertige APs sind grün, APs in Arbeit gelb markiert. Der Graph wird zusammen mit der Tabelle gepflegt (Status und Abhängigkeiten).

```mermaid
flowchart TD
  subgraph M0["M0 – Fundament"]
    direction TB
    AP0_1["0.1 Aufräumen und Baseline"]
    AP0_2["0.2 Design-System-Grundlage (Tailwind v4, Tokens)"]
    AP0_3["0.3 App-Bootstrap und Infrastruktur"]
    AP0_4["0.4 App-Shell und UI-Grundkomponenten"]
    AP0_5["0.5 Testkonzept und Testinfrastruktur"]
  end
  subgraph M1["M1 – Simulationskern"]
    direction TB
    AP1_1["1.1 Deterministischer Zufall und Mathematik"]
    AP1_2["1.2 Spielkalender und Zeitmodell"]
    AP1_3["1.3 Weltgenerierung: Taxonomie, Unternehmen, Banken"]
    AP1_4["1.4 Marktmodell: Tagesschritt und Vorlauf"]
    AP1_5["1.5 Brücken, Minutenkurse und Kerzen"]
    AP1_6a["1.6a Dividenden und Indizes"]
    AP1_6b["1.6b ETFs, indikative Werte, Geld- und Briefkurse"]
    AP1_7["1.7 Simulations-Labor: Welt, Simulation, Chart-Spike"]
    AP1_8a["1.8a Simulations-Labor: Statistik"]
    AP1_8b["1.8b Labor: Intraday, Langzeit, Selbsttest"]
    AP1_9["1.9 Marktmodell: Ergänzungen und Kalibrierung"]
  end
  subgraph M2["M2 – Engine, Spieler und Persistenz"]
    direction TB
    AP2_1["2.1 GameEngine und Terminplaner"]
    AP2_2["2.2 Worker-Host, Protokoll und EngineService"]
    AP2_3["2.3 Persistenz im Worker und Wiederherstellung"]
    AP2_4["2.4 Spielerverwaltung"]
    AP2_5["2.5 Spielsitzung und Uhr"]
    AP2_6["2.6 Einstellungen: Grundlage"]
  end
  subgraph M3["M3 – Banking und Haushalt"]
    direction TB
    AP3_1["3.1 Hauptbuch und Kontenmodell"]
    AP3_2["3.2 Haushalt und periodische Buchungen"]
    AP3_3["3.3 Bankkommandos und Banking-Slice"]
    AP3_4["3.4 Kontenübersicht und Kontoauszug"]
    AP3_5["3.5 Bankenvergleich, Dialoge und Monatsübersicht"]
    AP3_6["3.6 Benachrichtigungen"]
  end
  subgraph M4["M4 – Märkte und Charts"]
    direction TB
    AP4_1["4.1 Marktdaten-Feed und Market-Slice"]
    AP4_2["4.2 Chart-Komponenten"]
    AP4_3["4.3 Indikatoren"]
    AP4_4["4.4 Marktübersicht, Screener und Watchlist"]
    AP4_5["4.5 Instrument-Detailseite"]
  end
  subgraph M5["M5 – Handel, Depot und Steuern"]
    direction TB
    AP5_1["5.1 Depot und Orderausführung"]
    AP5_2["5.2 Positionen, Lots, Ausschüttungen und Depotgebühr"]
    AP5_3["5.3 Steuern"]
    AP5_4["5.4 Order-Ticket und Orderbuch"]
    AP5_5["5.5 Depot, Positionen und Steuerübersicht (UI)"]
    AP5_6a["5.6a Daueraufträge"]
    AP5_6b["5.6b Sparpläne"]
    AP5_7["5.7 Dashboard und Performance"]
    AP5_8["5.8 Chart: wählbare Auflösung und Indikatorfarben"]
    AP5_9["5.9 Kopfzeile: stabiles Layout der Uhr"]
  end
  subgraph M6["M6 – Export, PWA und Release 1.0"]
    direction TB
    AP6_1["6.1 Export und Import"]
    AP6_2["6.2 Einstellungen"]
    AP6_3["6.3 PWA und Browser-Benachrichtigungen"]
    AP6_4["6.4 Performance und Robustheit"]
    AP6_5["6.5 Barrierefreiheit, Hilfen und Hinweise"]
    AP6_6["6.6 Release 1.0"]
    AP6_7["6.7 Verhalten im Hintergrund: weitere Modi"]
    AP6_8a["6.8a Sprachumschaltung: Mechanik"]
    AP6_8b["6.8b Englische Übersetzung"]
  end
  AP0_1 --> AP0_2
  AP0_1 --> AP0_3
  AP0_2 --> AP0_4
  AP0_3 --> AP0_4
  AP0_1 --> AP1_1
  AP0_1 --> AP1_2
  AP1_1 --> AP1_3
  AP1_2 --> AP1_4
  AP1_3 --> AP1_4
  AP1_4 --> AP1_5
  AP1_5 --> AP1_6a
  AP1_6a --> AP1_6b
  AP1_6b --> AP1_7
  AP0_4 --> AP1_7
  AP0_4 --> AP0_5
  AP1_8a --> AP0_5
  AP1_7 --> AP1_8a
  AP1_8a --> AP1_8b
  AP1_8b --> AP1_9
  AP1_6b --> AP2_1
  AP2_1 --> AP2_2
  AP0_3 --> AP2_2
  AP2_2 --> AP2_3
  AP2_3 --> AP2_4
  AP0_4 --> AP2_4
  AP2_4 --> AP2_5
  AP2_5 --> AP2_6
  AP2_4 --> AP3_1
  AP3_1 --> AP3_2
  AP3_2 --> AP3_3
  AP2_5 --> AP3_3
  AP3_3 --> AP3_4
  AP3_4 --> AP3_5
  AP3_3 --> AP3_6
  AP2_6 --> AP3_6
  AP2_5 --> AP4_1
  AP4_1 --> AP4_2
  AP1_7 --> AP4_2
  AP4_2 --> AP4_3
  AP4_2 --> AP4_4
  AP4_3 --> AP4_5
  AP4_4 --> AP4_5
  AP1_8a --> AP4_5
  AP3_3 --> AP5_1
  AP1_6b --> AP5_1
  AP5_1 --> AP5_2
  AP5_2 --> AP5_3
  AP5_3 --> AP5_4
  AP4_5 --> AP5_4
  AP3_6 --> AP5_4
  AP5_4 --> AP5_5
  AP3_5 --> AP5_6a
  AP5_1 --> AP5_6a
  AP5_5 --> AP5_6b
  AP5_5 --> AP5_7
  AP4_5 --> AP5_8
  AP2_5 --> AP5_9
  AP5_6a --> AP6_1
  AP5_6b --> AP6_1
  AP5_7 --> AP6_1
  AP6_1 --> AP6_2
  AP3_6 --> AP6_2
  AP2_6 --> AP6_2
  AP6_2 --> AP6_3
  AP6_1 --> AP6_4
  AP1_9 --> AP6_4
  AP6_3 --> AP6_5
  AP6_4 --> AP6_6
  AP6_5 --> AP6_6
  AP3_5 --> AP6_6
  AP2_6 --> AP6_7
  AP3_6 --> AP6_7
  AP6_7 --> AP6_1
  AP6_7 --> AP6_4
  AP6_2 --> AP6_8a
  AP6_8a --> AP6_8b
  AP6_5 --> AP6_8b
  AP6_7 --> AP6_8b
  AP6_8b --> AP6_6
  classDef done fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef active fill:#fef3c7,stroke:#d97706,color:#78350f
  class AP0_1,AP0_2,AP0_3,AP0_4,AP0_5,AP1_1,AP1_2,AP1_3,AP1_4,AP1_5,AP1_6a,AP1_6b,AP1_7,AP1_8a,AP1_8b,AP1_9,AP2_1,AP2_2,AP2_3,AP2_4,AP2_5,AP2_6,AP3_1,AP3_2,AP3_3,AP3_4,AP3_5,AP3_6,AP4_1,AP4_2,AP4_3,AP4_4,AP4_5,AP5_1,AP5_2,AP5_3,AP5_4,AP5_5,AP5_6a,AP5_6b,AP5_7,AP5_8,AP5_9,AP6_1,AP6_2,AP6_3,AP6_4,AP6_7 done
```

## 5. Stufe 1: Meilensteine M0–M6

### M0 – Fundament

**Ziel:** sauberer, grüner Ausgangszustand mit Design-System, Infrastruktur und App-Shell.
**Ergebnis:** navigierbare, leere App im Trading-Look; die CI prüft Lint, Tests und Build.

#### AP 0.1 – Aufräumen und Baseline

- **Umfang:**
  - Ionic-Reste entfernen: `ionic.config.json`, `capacitor.config.ts` (wird bei Bedarf in N1 neu angelegt), Ionic-Schematics und `schematicCollections` in `angular.json`, `src/theme/variables.scss`, Ionic-Hinweise in `src/test-setup.ts` (den `matchMedia`-Polyfill behalten, falls Tests ihn brauchen) und in `.vscode/settings.json`, Ionic-CLI-Schritt in `.github/workflows/build-latest.yml`, `author` und `homepage` in `package.json`.
  - `src/environments/environment.model.ts` von verwaisten Importen befreien und die Umgebung neu ordnen (u. a. Devtools-Konfiguration, Flag für Labor und Entwicklerseiten).
  - `src/index.html`: `lang="de"`, Zoom nicht mehr sperren (`maximum-scale` und `user-scalable=no` entfernen).
  - `.browserslistrc` nach TS §1.3 anheben.
  - `AppComponent` nach `CLAUDE.md` (kein leerer Konstruktor, eigene Template- und Style-Datei).
  - Einen ersten Test anlegen, damit `ng test` läuft.
  - CI: Node aus `.nvmrc`, `npm ci`, `ng lint`, `ng test --watch=false`, `ng build`; Deployment unverändert nur nach Erfolg. Prüfen, dass die Zieladresse per HTTPS erreichbar ist.
  - `uuid` entfernen (ersetzt durch `crypto.randomUUID()`).
- **Abnahme:** `ng build` ohne Browserslist-Warnung; `ng lint` und `ng test --watch=false` grün; keine Ionic-Referenzen mehr in Code und Konfiguration; HTTPS-Erreichbarkeit geklärt.
- **Referenzen:** TS §1.1, §1.3, §14.4; E-06
- **Abhängig von:** –

#### AP 0.2 – Design-System-Grundlage (Tailwind v4, Tokens)

- **Umfang:**
  - Tailwind v4 über `@tailwindcss/postcss` und `.postcssrc.json` einbinden; `src/styles.css` als globaler Einstieg in `angular.json`, `src/global.scss` entfernen.
  - Semantische Tokens `--pgo-*` nach TS §11.5 für Dunkel (Standard) und Hell, Klasse `dark` am `<html>`. Vorläufig folgt das Theme `prefers-color-scheme`; die Einstellung kommt in AP 6.2.
  - Schrift festlegen (Inter selbst gehostet oder System-Schrift) und `tabular-nums` für Zahlen.
  - Optional `prettier-plugin-tailwindcss`.
  - Token-Übersicht auf einer Entwicklerseite (gleiches Umgebungs-Flag wie das Labor).
  - `CLAUDE.md` um die Ergänzungen und Ausnahmen aus TS §11.2 erweitern – nach Freigabe (§3).
- **Abnahme:**
  - Tokens wirken in Utility-Klassen und – als `var(--pgo-*)` – in Komponenten-SCSS (geprüft an einer Beispielkomponente).
  - Dunkel und Hell funktionieren; Standardfarben wie `bg-red-500` erzeugen keine Styles.
  - Textkontraste der Tokens ≥ 4,5:1.
- **Referenzen:** TS §11.2, §11.5; US-UI-01; E-06
- **Abhängig von:** AP 0.1

#### AP 0.3 – App-Bootstrap und Infrastruktur

- **Umfang:**
  - `app.config.ts`: Router (Hash), Store, Effects, Router Store, Devtools nur in der Entwicklung, `LOCALE_ID` `de` mit `registerLocaleData`.
  - `@angular/cdk` installieren.
  - `persistence/data-access`: framework-freie Schema-Definition für IndexedDB (nutzbar in UI und Worker), `IndexedDbService`, `LocalStorageService` (typisiertes, versioniertes JSON). Als Vorlage dient der Prototyp: `git show 9bab719^:src/app/idb/data-access/service/idb.service.ts`.
  - `fake-indexeddb` als Dev-Abhängigkeit für Tests.
  - `shared/domain`: `Cents`, `MicroUnits`, Rundungsfunktionen und Preisraster (TS §6.7, §7.1); `shared/util`: Formatierungsfunktionen (TS §11.9); `shared/ui`: Pipes darüber.
- **Abnahme:** App startet mit Store und Devtools; Tests für Rundung, Preisraster, Formatierung und Services grün.
- **Referenzen:** TS §6.7, §7.1, §9.1, §9.3, §11.9; E-09
- **Abhängig von:** AP 0.1

#### AP 0.4 – App-Shell und UI-Grundkomponenten

- **Umfang:**
  - `shell/feature`: Layout mit Kopfzeile (Platzhalter für Uhr, Gesamtvermögen, Suche, Benachrichtigungen, Spielermenü), Seitennavigation auf dem Desktop, untere Navigation auf dem Smartphone (`BreakpointObserver`); Routen-Gerüst nach TS §11.4 mit lazy geladenen Platzhalterseiten.
  - `shared/ui`: Button, Icon-Button, Panel, Badge, Tabs, Leerzustand, Skeleton, Kennzahl-Kachel, Kursveränderung (Vorzeichen, Pfeil, Farbe), Toast-Container (CDK Overlay), Dialog-Rahmen (CDK Dialog), Bestätigungsdialog.
  - `data-testid` nach `CLAUDE.md`, Fokusstile, Tastaturbedienung.
- **Abnahme:** leere App im Trading-Look auf Desktop und Smartphone navigierbar, auch per Tastatur; i18n-IDs vergeben, `ng extract-i18n` ausgeführt.
- **Referenzen:** PS §10; US-UI-03, US-UI-04; TS §11.4, §11.6; E-15, E-16
- **Abhängig von:** AP 0.2, AP 0.3

#### AP 0.5 – Testkonzept und Testinfrastruktur

Querschnitts-AP auf Auftrag des Product Owners (12.11.2026): neues Testkonzept statt der bisherigen Regeln, sofort auf den Bestand angewendet.

- **Umfang:**
  - Konzept in TS §4.6 (Determinismus-Vertrag) und §14 (Teststrategie, Budgets, CI), Schreibregeln in `CLAUDE.md` §10; Entscheidung E-29.
  - Runner aufgeteilt: `logic` (Vitest unter Node für `domain` und `util`), `angular` (`ng test` unter jsdom), `calibration`, `perf`; `npm run typecheck` und `npm run verify`.
  - Werkzeuge: fast-check, Stryker (`stryker.config.mjs`, `vitest.mutation.config.ts`), Playwright mit axe (`playwright.config.ts`, `e2e/`), Bundle-Budget (`tools/check-bundle-budget.mjs`); Lint-Regeln für Specs (kein `.only`, keine Wanduhr außerhalb der Perf-Suite, keine Format- und State-Helfer als Orakel in Seitentests).
  - Golden Master als Modul `market/domain/golden-master.ts` mit sechs Prüfsummen (neu: Marktzustand zum Spielstart); Selbsttest im Labor vorgezogen aus AP 1.8b.
  - Fixtures `goldenYear()`, Mini-Welt, Helfer in `src/testing`.
  - Alle 74 Spec-Dateien umgestellt: Erwartungen aus unabhängigen Orakeln, Eigenschaften neben den Beispielen, Toleranzen in Standardfehlern, statistische Tests in die Kalibrierungs-Suite, Zeitmessungen in die Perf-Suite; Tests ohne Mehrwert gelöscht.
  - CI mit allen Prüfungen als Gate vor dem Deployment (TS §14.4).
- **Abnahme:** `npm run verify` lokal grün (Systemtests in den Chromium-Projekten), Firefox und WebKit in der CI; die Golden-Master-Konstanten sind unverändert reproduziert; der Selbsttest ergibt in Chromium und Firefox dieselben Prüfsummen wie Node.
- **Referenzen:** TS §4.6, §14; `CLAUDE.md` §10; E-29
- **Abhängig von:** AP 0.4, AP 1.8a

### M1 – Simulationskern

**Ziel:** eine reine, getestete Simulationsbibliothek, die aus einem Seed Welt, Markt und Historie erzeugt.
**Ergebnis:** Das Simulations-Labor zeigt eine generierte Welt mit plausiblen Kursverläufen und Statistiken.

#### AP 1.1 – Deterministischer Zufall und Mathematik

- **Umfang:** `simulation/util`: Seed-Normalisierung, 128-Bit-Hash (Seed-Schlüssel und Strom-Ableitung, TS §4.1, §4.2), `sfc32`, Verteilungen (TS §4.3), `detExp` und `detLog`, Prüfsummen über Float64-Werte; Seed-Generator für gut teilbare Seeds.
- **Abnahme:** Tests für Reproduzierbarkeit, Stromunabhängigkeit, Momente der Verteilungen (mit Toleranz), `detExp`/`detLog` gegen `Math.*` (≤ 1 ulp auf Stichproben), feste Testvektoren für Hash und Generator.
- **Referenzen:** TS §4; E-03; NF-05
- **Abhängig von:** AP 0.1

#### AP 1.2 – Spielkalender und Zeitmodell

- **Umfang:** `clock/domain`: Tick ↔ Datum, Wochentag, Tagesindex, Monats- und Jahresgrenzen, Bankarbeitstage, erster und letzter Bankarbeitstag; Handelszeiten (offen, nächste Öffnung und Schließung); Geschwindigkeitsstufen als `as const`-Liste; Ziel-Tick aus Anker und Wanduhr als reine Funktion; Formatierung der Spielzeit (`formatGameTime`, aus AP 0.3 verschoben, TS §11.9).
- **Abnahme:** Tests inklusive Schaltjahren, Monatsenden, Wochenenden und Handelszeitgrenzen; der Spielstart ist Tick 5.389.920 (Mo, 01.04.2030, 00:00).
- **Referenzen:** TS §3.1, §3.3–§3.5; E-02, E-18
- **Abhängig von:** AP 0.1

#### AP 1.3 – Weltgenerierung: Taxonomie, Unternehmen, Banken

- **Umfang:** `world/domain`: Weltkonfiguration (Mengen, Verteilungen); Regionen, Länder, Börsen mit Handelszeiten, Sektoren, Branchen; Namensgeneratoren für Unternehmen, Banken, Emittenten und Indizes mit Blockliste; eindeutige Ticker und Kennungen mit Prüfziffer; Unternehmensattribute inkl. Profil-Vorlagencode, Sparplanfähigkeit und Startwerten der Modellparameter; Stammdaten der Indizes (Art, Zusammensetzung, Kappung) und ETFs (Emittent, Index, TER, Ertragsverwendung, Replikation, Fondsvolumen) nach TS §5.5 und §5.6; Banken mit Konditionen (TS §5.7, Typen aus TS §7.3); Modelle als `*.model.ts`.
- **Abnahme:** gleicher Seed ergibt eine identische Welt (Prüfsummentest); Verteilungen im vorgesehenen Rahmen; keine Dubletten; Generierung unter 200 ms.
- **Referenzen:** TS §5, §7.3; PS §4.4, §6; E-12, E-13, E-17
- **Abhängig von:** AP 1.1

#### AP 1.4 – Marktmodell: Tagesschritt und Vorlauf

- **Umfang:** `market/domain`: Marktzustand in Typed Arrays; Tagesschritt nach TS §6.1–§6.4 – Marktphasen, Trends und Volatilität der Faktoren mit Stützpunkten an den Grenzen der Handelszeiten, Tagesstützpunkte der Aktien mit Overnight-Schock, Sprüngen (Anzahl, Minute, Größe) und Kursuntergrenze; Vorlauf als Tagesschritte ab der Epoche; Faktorhistorie mit Zuständen zu Monatsbeginn; Neuberechnung der Historie eines einzelnen Instruments; Snapshot und Restore des Marktzustands; Markt-Prüfsumme.
- **Abnahme:** Tests aus TS §4.6: Golden Master über die Tagesschlusskurse, Granularität, Snapshot mit Restore und Weiterlauf, Stromunabhängigkeit; die neu berechnete Historie eines einzelnen Instruments entspricht der des Gesamtlaufs. Benchmark mit `detExp`/`detLog`: zehn Jahre Vorlauf der Standardwelt in ≤ 0,5 s auf dem Entwicklungsrechner.
- **Referenzen:** TS §3.2, §4.2, §4.6, §6.1–§6.4, §6.8; E-02, E-20
- **Abhängig von:** AP 1.2, AP 1.3

#### AP 1.5 – Brücken, Minutenkurse und Kerzen

- **Umfang:**
  - Brücken für Faktoren (ein Strom je Faktor, Tag und Intervall) und Aktien (Sprünge ab ihrer Minute) nach TS §6.1–§6.4; Endpunkte als Stützpunkte gesetzt; Tagesprofil der Volatilität als Parameter (Standard: gleichmäßig).
  - `priceAt(instrumentId, tick)` mit Cache der Tagesverläufe und offiziellem Kurs bei geschlossener Börse.
  - Kerzen aller Auflösungen bei Abfrage; Tageskerzen mit Hoch und Tief; Ergänzung fehlender Hoch- und Tiefkurse als zeitteilbare Funktion für den Hintergrundauftrag (TS §6.8); Abfragegrenze (TS §4.5, Regel 7).
  - Testhelfer: Referenz-Simulation Minute für Minute nach TS §4.6; die Prototyp-Werte in TS §6.1 geben die Größenordnung der Toleranzen vor.
- **Abnahme:** Tests aus TS §4.6: Stützpunkte bitgenau getroffen; Bedarf, Vorabberechnung und Neuberechnung nach Verwerfen der Caches bitgleich; statistische Gleichwertigkeit mit der Referenz-Simulation innerhalb fester Toleranzen; Abfragegrenze; Golden Master um die Minutenkurse einer festen Stichprobe erweitert. Benchmark mit `detExp`/`detLog`: ein Spieljahr mit allen Minutenverläufen der Standardwelt in ≤ 4 s; Minutenchart eines vergangenen Tags in < 50 ms.
- **Schnitt:** Wird das AP zu groß, zuerst Brücken und `priceAt` (AP 1.5a), dann Kerzen und Abfragegrenze (AP 1.5b).
- **Referenzen:** TS §4.5, §4.6, §6.1, §6.2, §6.4, §6.8, §14.3; E-20
- **Abhängig von:** AP 1.4

#### AP 1.6a – Dividenden und Indizes

AP 1.6 wurde nach §2.5 geteilt (11.11.2026).

- **Umfang:** Dividendenkalender (Ex-Tag-Rhythmus je Unternehmen aus dem Seed, Ankündigung mit dem Schlusskurs vor der Ankündigung, Ex-Tag-Abschlag im Tagesschritt, Zahltag als Ereignisdatum); Kurs- und Performanceindizes auf Basis der Index-Stammdaten aus AP 1.3 mit Kappung, innerhalb des Tages exakt aus den Minutenkursen aller Werte; Reinvestitionsfaktor `R` im Tagesschritt; Tageskerzen sowie Hoch und Tief der Indizes. Abgeleitete Werte als reine Funktionen (TS §6.6).
- **Abnahme:** Tests:
  - Index entspricht zu jeder Minute der gewichteten Summe; Ex-Tag-Abschlag; `R` steigt nur zur Eröffnung eines Werts am Ex-Tag.
  - Die Dividendenhöhe hängt nicht von Kursen des Ankündigungstags ab.
  - Beobachtungsunabhängigkeit: Abfragen ändern die Markt-Prüfsumme nicht.
  - Index-Kurven live, nachgerechnet und nach Verwerfen der Caches bitgleich; Golden Master um die Indexstände erweitert.
- **Referenzen:** TS §6.5, §6.6, §6.8, §4.6
- **Abhängig von:** AP 1.5

#### AP 1.6b – ETFs, indikative Werte, Geld- und Briefkurse

- **Umfang:** indikative Werte aus den Faktorbrücken; ETF-NAV (thesaurierend und ausschüttend mit Ausschüttungstopf und eigenen Ex-Tagen, TER, Tracking); Tageskerzen der ETFs; Spread-Modell mit Preisraster und Quotes. Zustandsbehaftete Größen (`k`, Topf) wie `R` im Tagesschritt (TS §6.6).
- **Abnahme:** Tests:
  - TER-Abschlag ≈ TER p. a.
  - Thesaurierender und ausschüttender ETF haben vor Kosten dieselbe Gesamtrendite (Toleranz für den Kassenbestand im Topf).
  - Geld < Brief bei jedem Kurs (auch unter 10 €); Spreads im vorgesehenen Rahmen.
  - Beobachtungsunabhängigkeit: Abfragen ändern die Markt-Prüfsumme nicht.
- **Referenzen:** TS §6.6, §6.7, §4.6
- **Abhängig von:** AP 1.6a

#### AP 1.7 – Simulations-Labor: Welt, Simulation, Chart-Spike

- **Umfang:**
  - `lab/feature` (nur mit Umgebungs-Flag): Seed eingeben, Welt erzeugen und in Tabellen anzeigen, Zeitraum in einem einfachen Web Worker simulieren (Vorstufe zu AP 2.2).
  - Chart-Spike: `lightweight-charts` installieren; Linie und Kerzen, Zeitachse in Spielzeit, Farben aus den Tokens; Bundle-Größe bei lazy Laden messen.
- **Abnahme:** Das Labor zeigt Welt und Charts beliebiger Instrumente. Das Spike-Ergebnis (Größe, Theming, Zeitachse) steht im Änderungsprotokoll; E-04 ist bestätigt oder revidiert.
- **Referenzen:** TS §11.7, §14.2; E-04
- **Abhängig von:** AP 1.6b, AP 0.4

AP 1.8 wurde nach §2.5 geteilt (11.11.2026).

#### AP 1.8a – Simulations-Labor: Statistik

- **Umfang:** `analysis/domain`: Statistikfunktionen (Rendite, Volatilität, Korrelation, Schiefe, Kurtosis, Autokorrelation, Quantile, Histogramm, Drawdown). Messvorschrift je Kalibrierungsziel (TS §6.9). Statistikansicht im Labor nach TS §14.2 für einen wählbaren Zeitraum (ab Epoche oder ab Spielstart) mit Vergleich zu den Kalibrierungszielen, Phasen-Zeitleiste, Verteilung der Tagesrenditen, Korrelationsmatrix nach Sektor, Volatilität je Größenklasse und Drawdowns des Weltindex; Simulationsschritt „10 Jahre“.
- **Abnahme:** Tests der Statistikfunktionen mit Referenzwerten; die Ansicht zeigt die Größen aus TS §6.9, die sich aus den Tagesstützpunkten messen lassen; Seitentest mit der Domain als Orakel.
- **Referenzen:** TS §6.9, §14.2
- **Abhängig von:** AP 1.7

#### AP 1.8b – Labor: Intraday, Langzeit, Selbsttest

- **Umfang:** Intraday-Statistik (Minutenvolatilität, Tagesspanne, Tagesprofil) im Vergleich zur Referenz-Minutensimulation aus AP 1.5 und Durchsatz der Minutenverläufe; Langzeit-Kennzahlen über 50 und 100 Spieljahre (Konzentration des Weltindex, Anteil der Kurse unter 1 € und an der Kursuntergrenze, Höchstkurse, Indexvolatilität in rollierenden Fenstern; E-22), der Overnight-Anteil der Varianz von Indizes und Einzelaktien (E-24); die Referenz-Simulation läuft im Worker. Der Selbsttest der Golden-Master-Prüfsummen besteht seit AP 0.5 (TS §14.2).
- **Abnahme:** Die Statistikansicht zeigt auch die übrigen Größen aus TS §6.9 (Status „AP 1.8b“ entfällt). Der Systemtest des Selbsttests (J11) bleibt in Chromium, Firefox und WebKit grün; neue Intraday- und Langzeitwerte prüft der Seitentest des Labors mit `LabSimulation` als Orakel.
- **Vormerkungen** (aus AP 1.8a): Messvorschrift für Tagesprofil, Overnight-Anteil und Langzeit-Kennzahlen steht in TS §6.9. Die Golden-Master-Konstanten liegen seit AP 0.5 in `market/domain/golden-master.ts`. `ReferenceSimulation` nutzt nichts Node-spezifisches und läuft im Worker. Die Statistik rechnet die Tagesschritte aus den Monatsbeginn-Zuständen nach (rund 45 ms je Spieljahr); für den Langzeitlauf die Stichprobe besser schon beim Simulieren sammeln. Aus der Prüfung vom 12.11.2026: Rendite, Volatilität und Dividendenrendite des Weltindex zusätzlich in rollierenden Fenstern (10 und 30 Jahre) und über mehrere Seeds zeigen, weil die Messung über 110 Jahre von der festen Indexzusammensetzung verzerrt ist (TS §6.9, „Einordnung der Startwerte“).
- **Referenzen:** TS §4.6, §6.9, §14.2; E-22, E-24
- **Abhängig von:** AP 1.8a

#### AP 1.9a – Marktmodell: Änderungen vor der Kalibrierung

- **Umfang:** Modelländerungen nach den Entscheidungen E-22 bis E-24 und den offenen Fragen aus der Prüfung vom 12.11.2026, damit danach nur einmal kalibriert wird: Rückkehr von `U_i` zu seinem erwarteten Pfad mit Kompensator für Diffusion und Sprünge, abklingendes Alpha, Rückkehr des Niveaus der Unterfaktoren (E-22); Aktivitätsgewichte der Faktor-Intervalle (E-24); Spread-Faktor aus der Volatilität des Weltfaktors (E-23); Sprünge nach Größenklasse; Risikoklasse aus der vollen Volatilität; Ziele und Grenzen im Labor (Overnight-Anteil je Region, Volatilitäts-Cluster, Langzeitgrenzen).
- **Abnahme:** Golden Master bewusst neu gesetzt und im Änderungsprotokoll vermerkt; Beispieltabellen in TS §6.4; statistische Tests für Kompensator, Rückkehr und Dividendenabschlag; erste Messung auf `calib-1` bis `calib-5` in TS §6.9; `npm run verify` grün.
- **Referenzen:** TS §5.4, §6.2, §6.4, §6.7, §6.9; E-22–E-24
- **Abhängig von:** AP 1.8b

#### AP 1.9b – Marktmodell: Ergänzungen aus der Kalibrierung

AP 1.9b wurde nach §2.5 geteilt (12.11.2026, Entscheidung des Product Owners): Beim Planen der Kalibrierung zeigten sich Zielkonflikte, die Parameter allein nicht realistisch lösen (TS §6.9, „Messung AP 1.9b“). Die Modellergänzungen kommen in AP 1.9b, die Kalibrierung in AP 1.9c.

- **Umfang:** Ergänzungen nach E-30 bis E-33, jeweils als reine Funktion des Tages ohne neuen Zustand:
  - Regionsfaktoren mit eigener Aktivität (`regionClosedActivity`, Intervallanteile je Faktor; TS §6.2).
  - Zero-Beta-Rendite im erwarteten Pfad von `U_i` (`zeroBetaReturn`; TS §6.4).
  - Dividenden-Lebenszyklus: Zielrenditen gleichen sich über Jahrzehnte an, Unternehmen ohne Dividende beginnen nach exponentiell verteilter Zeit zu zahlen (`dividendLifecycle`, `dividendInitiationYears`; TS §5.4, §6.5).
  - Labor: Korrelationsziele über Large Caps, alle Paare zur Information; Overnight-Anteil der Schwellenländer als „Info“ (TS §6.9).
- **Abnahme:** Beispieltabellen in TS §6.2, §6.4 und §6.5. Statistische Tests: Varianzanteil der Regionsfaktoren in ihrer Sitzung, Steigung der Zero-Beta-Drift, gezahlte Abschläge gegen `D(d)` und kein Rückholen der Dividenden je Gruppe von Zahlern, Verteilung der Initiierung; jeder schlägt mit dem jeweils entfernten Baustein fehl. Golden Master bewusst neu gesetzt; erste Messung und Machbarkeitsproben auf `calib-1` bis `calib-5` in TS §6.9; `npm run verify` grün.
- **Referenzen:** TS §5.4, §6.2, §6.4, §6.5, §6.9; E-30–E-33
- **Abhängig von:** AP 1.9a

#### AP 1.9c – Kalibrierung des Marktmodells

- **Umfang:** Parameter mit mehreren Seeds gegen die Ziele aus TS §6.9 abstimmen, einschließlich Tagesprofil der Volatilität (TS §6.1); statistische Tests mit Toleranzen; finale Parameter in TS §6 nachtragen.
- **Abnahme:** Kalibrierungsziele auf mindestens fünf Seeds erreicht oder Abweichungen begründet; die Kalibrierungs-Suite (`npm run test:calibration`) prüft ab jetzt auch `CALIBRATION_TARGETS` und `LONG_TERM_LIMITS` auf `calib-1` bis `calib-5` und ist grün. Ändern sich dadurch die Golden-Master-Prüfsummen, steht das im Änderungsprotokoll. Die Langzeit-Kennzahlen über 50 und 100 Spieljahre liegen in den Grenzen (E-22).
- **Zu kalibrieren** (Startwerte, Messung und Machbarkeitsproben nach AP 1.9b in TS §6.9):
  - Phasen: Übergangsgewichte für stationär 40 / 35 / 17 / 8 % (gemessen 47 / 39 / 13 / 3 %; rund 30 % aller Phasenwechsel müssen in eine Krise führen); Trendziele, damit die Rendite des Weltindex bei 6–8 % liegt (gemessen über 100 Jahre 12,8 %; die Probe mit um 5 Punkte gesenkten Trendzielen ergibt 6,0 %).
  - Varianzbudget: Weltfaktor rund 12 %, Sektorfaktor stärker, unternehmensspezifischer Anteil und Sprünge der Large Caps schwächer. Gemessen über Large Caps (E-31) 0,42 / 0,33 statt 0,5–0,6 / 0,2–0,35; die Probe (Welt 12 %, Region 10 %, Sektor 12 %, Large Caps 12–20 % mit weniger Sprüngen) erreicht 0,58 / 0,33 bei 29 % Volatilität. Volatilität und Kurtosis des Weltindex (Probe 13,7 % und 3,7) über die Phasen und `volOfVol` anheben.
  - Overnight-Anteile über `regionClosedActivity`, `volTarget` der Regionsfaktoren, `closedActivity` und `exchangeActivity` (gemessen Nordamerika 55 %, Europa 48 %, Asien-Pazifik 64 %; Probe 30 / 32 / 59,5 %, Aktien 27 %).
  - Langzeit (E-22): `zeroBetaReturn` im Abgleich mit der kalibrierten Drift des Weltfaktors (Steigung `ḡ_Welt − r_z` rund 2 %), `dividendLifecycle`, `dividendInitiationYears`, Rückkehr (`idioReversion`, `levelReversion`, `alphaDecay`) und Startkonzentration (`marketCap.sigma`). Gemessen Top 5 nach 50 / 100 Jahren 41 % / 60 %; die Probe mit Rendite 6 % und σ = 1,1 liegt bei 31 % / 37 %, die Dividendenrendite der 30-Jahres-Fenster bei 1,9 %.
  - Volatilitäts-Cluster (Ziel 0,10–0,30 bei Lag 1, gemessen 0,10–0,18), Tagesprofil und seine Grenze, Größenprämie (`trendTarget` des Größenfaktors ≈ 1–2 %, Entscheidung des Product Owners), Grenzen der Risikoklassen, `riskClassFactorVols` im Abgleich mit der Marktkonfiguration, Spreads, Tracking-Fehler und Startkurse der ETFs.
  - Budget des Vorlaufs nachmessen; Laufzeit der Kalibrierungs-Suite beachten (`measureSeedRun` rund 8 s je Seed und 100 Jahre).
- **Referenzen:** TS §6.2, §6.4, §6.5, §6.7, §6.9, §14.1; E-22–E-24, E-30–E-33; Risiken R1, R12
- **Abhängig von:** AP 1.9b

### M2 – Engine, Spieler und Persistenz

**Ziel:** eine lauffähige Spielschleife mit Spielerverwaltung, Uhr und Speicherung – noch ohne Geldflüsse.
**Ergebnis:** Spieler anlegen, die Zeit in jeder Geschwindigkeit laufen lassen, die App schließen und beim Öffnen nachberechnen lassen.

#### AP 2.1 – GameEngine und Terminplaner

- **Umfang:** `engine/domain`: `GameEngine` mit der API aus TS §8.1, `World` und `GameState`, Systemreihenfolge nach TS §3.8 (vorerst Kalender und Markt), Terminplaner als Binärheap, Ereignispuffer, Kommandos mit Tick-Stempel, Snapshot und Restore inklusive (vorerst minimalem) Spielerzustand.
- **Abnahme:** Eigenschaften auf der Mini-Welt (fast-check): beliebige Stückelung der Ticks ≡ ein Lauf (Stapel gegen Live); Snapshot, Restore und Replay an beliebiger Stelle ≡ ununterbrochener Lauf. Reihenfolge des Terminplaners als Beispieltabelle nach TS §3.8. Die Engine bezieht Kurse über einen Port; ein Testmarkt mit vorgegebenen Kursen dient den Engine-Szenarien, ein Vertragstest läuft gegen den echten Adapter und den Testmarkt (TS §14.1).
- **Vormerkungen** (aus AP 1.6b): Ereignisse der ETF-Ausschüttung (`MarketDay.etfExCents`, Zahltag über `paymentDay`); Quotes der Abos über `PriceSource.quoteAt`. Die ESLint-Regel für Simulationscode gilt ab hier auch für `engine/domain` (TS §4.4).
- **Referenzen:** TS §2.2, §3.8, §8.1; E-01
- **Abhängig von:** AP 1.6b

#### AP 2.2 – Worker-Host, Protokoll und EngineService

- **Umfang:**
  - `engine/data-access`: `engine.worker.ts`, Nachrichtenprotokoll (TS §8.2, §8.3), Typ-Guards in `engine-service.utils.ts`.
  - `EngineService` (Observable-API, Korrelation, Fehler, Abo-Zählung) mit `provideEngineService()` – einmal in den Bootstrap-Providern (TS §11.2, Punkt 4); Token für eine Worker-Factory (Tests mit Fake-Worker).
  - Takt (TS §3.5), Sichtbarkeit und `backgroundMode` (TS §3.6), Drosselung (TS §8.4), Auslastungsmeldung.
- **Abnahme:** Service-Tests mit dem Worker-Code im Testprozess (Kommandos, Antworten, Fehler, Abbruch); Eigenschaften über die Protokoll-Guards (beliebige Nachrichten werden abgewiesen, nie geworfen) und die Taktlogik. Systemtest entsteht in AP 2.5: echter Worker (`clock`-Ereignisse kommen an, Pause und Weiter) in Chromium, Firefox und WebKit; erste Messung mit vierfacher CPU-Drosselung in Chromium (J10, E-27).
- **Vormerkungen:** Für Seitentests braucht es den Worker-Code im Testprozess (wie `provideInProcessLabWorker()`) und die Uhr des Hosts als Testnaht (`CLAUDE.md` §10). Kommando-Klassen nach TS §8.2 (E-08): Abfragen und Abos halten den Takt nicht an.
- **Referenzen:** TS §3.5, §3.6, §8.2–§8.5, §11.2, §14.3; E-27
- **Abhängig von:** AP 2.1, AP 0.3

#### AP 2.3 – Persistenz im Worker und Wiederherstellung

- **Umfang:** IndexedDB-Schema nach TS §9.1 mit Besitzern je Store (Version 3 besteht seit AP 0.3, Erweiterungen kommen als Version 4); Kommando-Annahme nach dem Write-ahead-Protokoll (TS §8.5); Speicherstrategie (TS §9.2); Laden als Welt + Marktzustände zu Monatsbeginn + Snapshot + Replay + Nachberechnung mit Fortschritt; Tageskerzen im Store `candles` mit dem zeitgeteilten Hintergrundauftrag für fehlende Hoch- und Tiefkurse (TS §6.8); Web Lock je Spieler (TS §9.4). `navigator.storage.persist()` kommt in AP 2.4 (nur im Fenster verfügbar, nicht im Worker).
- **Abnahme:** Tests mit `fake-indexeddb`:
  - Speichern und Laden; Replay; Verwerfen der Spielerdaten nach dem Snapshot-Tick, Tageskerzen bleiben erhalten.
  - Nach Verwerfen des Stores `candles` baut der Hintergrundauftrag identische Tageskerzen auf.
  - Absturz kurz nach einem Kommando, das nach der letzten periodischen Uhr-Speicherung kam: Das Kommando wirkt nach der Wiederherstellung an seinem ursprünglichen Tick.
  - Als Eigenschaft: Absturz an beliebiger Stelle (fehlerinjizierender Speicher-Port) und Wiederherstellung ≡ ununterbrochener Lauf.
  - Upgrade von Version 3 auf 4 mit eingefrorener Fixture `db-v3.json`.
  - Systemtest entsteht in AP 2.5 (Chromium, Firefox und WebKit): Neuladen mitten im Lauf stellt den Stand wieder her; ein zweiter Tab desselben Spielers erhält den Hinweis des Web Locks.
- **Vormerkungen:** `SIM_VERSION` und `schemaVersion` als Konstanten einführen (E-25).
- **Geklärt (12.11.2026):** E-08 mit Ergänzungen bestätigt – Marktzustände zu Monatsbeginn im eigenen Store mitspeichern (DB-Version 4; nicht beim Laden aufbauen), Write-ahead nur für Spielkommandos, Einträge im Kommando-Log älter als der älteste aufbewahrte Snapshot löschen, Uhrzustand spätestens nach einem Spieltag sichern, Tick des letzten `clock`-Ereignisses aus localStorage als Untergrenze für `loadPlayer`. Tageskerzen bleiben je Spieler (TS §6.8, §8.2, §8.5, §9.1, §9.2). E-25 vor 1.0 bestätigt (TS §15).
- **Referenzen:** TS §3.7, §8.5, §9, §15; US-ZT-04, US-SP-02; E-08, E-25
- **Abhängig von:** AP 2.2

#### AP 2.4 – Spielerverwaltung

- **Umfang:** `players` (domain, data-access, feature): Profilmodell, `PlayersService` (Read-Modify-Write auf eigene Datensätze), Players-Slice nach `CLAUDE.md` §6; Seiten „Spielerauswahl" (umbenennen; löschen mit Bestätigung und Lock-Prüfung) und „Spieler anlegen" (Signal Forms, Voreinstellungen, Seed-Generator, Validierung, Betragseingabe als `FormValueControl<Cents>`); Initialisierung beim ersten Laden im Worker (Welt, Vorlauf bis zum Spielstart, Uhr); `navigator.storage.persist()` nach dem ersten angelegten Spieler (TS §9.5).
- **Abnahme:** Tests für Slice, Service und Validierungsregeln. Spieler lassen sich anlegen, umbenennen und löschen (inklusive aller Daten); ein gesperrter Spieler lässt sich nicht löschen; die Auswahl öffnet die (noch leere) Shell. Seitentests: Spieler anlegen mit Validierung, umbenennen, löschen, veralteten Spieler erkennen.
- **Geklärt (12.11.2026):** Lebenshaltungskosten über dem Einkommen sind erlaubt; das Formular zeigt einen Hinweis am Feld, keinen Fehler (TS §7.4). Grenzen, Vorgaben und Voreinstellungen nach PS US-SP-01 (E-14). Der Name wird nur über den `PlayersService` geändert; das Engine-Kommando `renamePlayer` entfällt (TS §8.2, §9.1). Spieler mit anderer `SIM_VERSION` oder `schemaVersion` erscheinen als veraltet und lassen sich nur löschen (E-25). Hausbank wird die erste Bank vom Typ `branch` in Weltreihenfolge (TS §5.7). Nicht in M2: Buchung des Startkapitals (AP 3.1), Seed in den Einstellungen (AP 6.2).
- **Referenzen:** US-SP-01–US-SP-03; TS §4.1, §9.1, §9.4, §11.8, §15; E-14, E-25
- **Abhängig von:** AP 2.3, AP 0.4

#### AP 2.5 – Spielsitzung und Uhr

- **Umfang:** Session- und Clock-Slice, registriert über `provideGameState()` an der Shell-Route; Guards `enterGame` und `leaveGame`; Kopfzeile mit Datum, Uhrzeit, Wochentag, Börsenstatus je Region, Geschwindigkeitsregler, Pause/Weiter, abschaltbaren Tastenkürzeln und Auslastungsanzeige; Overlay für Initialisierung und Nachberechnung; Vorspulen (S).
- **Abnahme:** Tests für Slices, Effects und Guards. Seitentests mit dem Worker-Code im Testprozess und gestellter Uhr; was nur ein echter Browser zeigt (Hintergrund-Tab, Tastenkürzel mit Fokus, Neuladen), als Systemtest:
  - Ein neuer Spieler startet pausiert am 01.04.2030, 00:00; Geschwindigkeitswechsel wirken sofort.
  - Im Hintergrund läuft Echtzeit; Tab schließen und später öffnen ergibt eine Nachberechnung.
  - Eine Pause bleibt nach dem Neuladen erhalten; ein zweiter Tab mit demselben Spieler erhält einen Hinweis.
  - Systemtests aus AP 2.2 und AP 2.3, gebündelt hier, weil erst diese Oberfläche einen echten Worker bedient: `clock`-Ereignisse kommen an, Pause und Weiter (Chromium, Firefox, WebKit); erste Messung mit vierfacher CPU-Drosselung in Chromium (J10, E-27); Neuladen mitten im Lauf stellt den Stand wieder her; ein zweiter Tab desselben Spielers erhält den Hinweis des Web Locks.
- **Geklärt (12.11.2026):** Börsenstatus als vier kompakte Anzeigen (Asien-Pazifik, Europa, Nordamerika, Schwellenländer); die Schwellenländer gelten als offen, sobald eine ihrer Börsen offen ist. Ein Klick öffnet eine Liste aller Börsen mit Status und nächster Öffnung bzw. Schließung (TS §3.3, PS US-ZT-01). Den Schalter zum Abschalten der Tastenkürzel liefert AP 2.6. Nicht in M2: Abwesenheitsbericht (US-BN-03, kommt mit AP 3.6).
- **Referenzen:** US-ZT-01–US-ZT-05; TS §3, §9.4, §11.2, §11.10, §14.3; E-02, E-08, E-27
- **Abhängig von:** AP 2.4

#### AP 2.6 – Einstellungen: Grundlage

Neu nach der kritischen Prüfung vom 11.11.2026: Mehrere APs brauchen Einstellungen, lange bevor AP 6.2 an der Reihe ist.

- **Umfang:** Settings-Slice mit localStorage (`pgo.settings`) für Geräteeinstellungen; Einstellungsseite mit Erscheinungsbild (System, Dunkel, Hell; Standard Dunkel nach E-06 und US-UI-01; die Klasse früh setzen, damit nichts flackert) und Tastenkürzel an/aus; Spielereinstellung „Verhalten im Hintergrund“ über das Kommando `setBackgroundMode`. Spätere APs ergänzen ihre Abschnitte (Auto-Pause in AP 3.6), AP 6.2 vervollständigt die Seite.
- **Abnahme:** Tests für Slice und Service. Seitentest: Erscheinungsbild wechseln, Tastenkürzel abschalten, Verhalten im Hintergrund umstellen; Geräteeinstellungen bleiben nach dem Neuladen erhalten.
- **Referenzen:** US-UI-01, US-UI-09, US-ZT-02; TS §3.6, §9.3, §11.5, §11.10
- **Abhängig von:** AP 2.5

### M3 – Banking und Haushalt

**Ziel:** Geld fließt: Gehalt, Lebenshaltung, Gebühren und Zinsen; Konten lassen sich eröffnen, schließen und Geld bewegen.
**Ergebnis:** Kontoauszüge füllen sich mit der Zeit; Warnungen erscheinen bei Unterdeckung.

#### AP 3.1 – Hauptbuch und Kontenmodell

- **Umfang:** `banking/domain`: Transaktionen und Buchungen mit Invariante, Kontoarten, Salden, Gebühren- und Zinsmodelle (TS §7.3) mit Berechnungsfunktionen; Startkapital als `opening-balance` auf das Girokonto der Hausbank bei der Initialisierung; Speicherung im Store `transactions`.
- **Abnahme:** Tests: Summe 0 je Transaktion; Saldo gleich Summe der Buchungen; jedes Gebührenmodell; taggenaue Zinsen.
- **Vormerkungen:** Die ESLint-Regel für Simulationscode gilt ab hier auch für die `domain`-Ordner von `banking`, `trading`, `portfolio` und `taxes` (TS §4.4).
- **Referenzen:** TS §7.1–§7.3; E-09
- **Abhängig von:** AP 2.4

#### AP 3.2 – Haushalt und periodische Buchungen

- **Umfang:** Banking-System der Engine: Gehalt, Lebenshaltung mit Schwankung, Kontoführung mit Befreiungsbedingungen, Dispo-, Soll- und Habenzinsen, Ereignisse bei Unterdeckung und Überziehung, Monatswerte für die Monatsübersicht (TS §7.4). Dazu der Steuerkern in `taxes/domain` (Jahreszustand und Berechnung nach TS §7.7), weil Habenzinsen mit Steuereinbehalt gebucht werden; AP 5.3 baut darauf auf.
- **Abnahme:** Tests über mehrere simulierte Monate: Termine, Beträge, Determinismus, Gutschriften vor Lastschriften, Monatswerte.
- **Geklärt (13.11.2026, TS §7.4):** Als Geldeingang für die Gebührenbefreiung zählen nur Gutschriften von außen (Gehalt, Startkapital), nicht eigene Überweisungen, Zinsen oder Steuererstattungen. Die Kontoführung wird im Eröffnungs- und im Schließmonat anteilig nach Kalendertagen berechnet. Die geduldete Überziehung hat keine Obergrenze; ihr Aufschlag gilt nur auf den Teil über dem Limit. Habenzinsen auf Verrechnungskonten werden bei allen Banken monatlich gutgeschrieben. Der Dispo-Rahmen richtet sich je Bank nach den Gehaltseingängen bei ihr (TS §7.4) und wird am ersten Bankarbeitstag jedes Monats angepasst.
- **Referenzen:** US-EK-01, US-EK-02, US-BK-07, US-BK-08; TS §7.4, §7.7; E-11, E-17, E-19
- **Abhängig von:** AP 3.1

#### AP 3.3 – Bankkommandos und Banking-Slice

- **Umfang:** Kommandos `openAccount`, `closeAccount` (mit Abschluss und Zielkonto, TS §7.4), `setSalaryAccount` und `transfer` mit Validierung und Fehlercodes; Projektionen für Banken und Konten; Banking-Slice mit Facade.
- **Abnahme:** Tests für Engine-Kommandos (inkl. Kontoabschluss mit Zinsen und anteiligen Gebühren), Reducer, Selektoren, Effects und Facade.
- **Referenzen:** US-BK-02–US-BK-05; TS §7.4, §8.2, §8.3
- **Abhängig von:** AP 3.2, AP 2.5

#### AP 3.4 – Kontenübersicht und Kontoauszug

- **Umfang:** Kontenübersicht (Karten je Konto, Summen); Kontoauszug mit seitenweiser Abfrage (Guard und Effects, TS §11.3), virtuellem Scrollen, Filtern und Suche.
- **Abnahme:** Kontoauszug mit 10.000 Buchungen scrollt ohne Ruckeln (Main-Thread-Arbeit je Seite < 4 ms); per Tastatur bedienbar; Leerzustände. Seitentest: blättern, filtern, suchen, Leerzustand.
- **Geklärt (13.11.2026):** Die Suche läuft im Worker über Verwendungszweck, Namen (Banken, Gegenkonten) und Betrag, weil Buchungstexte erst in der UI aus Codes entstehen (TS §8.6) und der Store nur eine Seite hält; dazu Filter nach Zeitraum und Buchungsart.
- **Referenzen:** US-BK-06; TS §11.3, §14.3
- **Abhängig von:** AP 3.3

#### AP 3.5 – Bankenvergleich, Dialoge und Monatsübersicht

- **Umfang:** Bankenvergleich mit Sortierung; Dialoge „Konto eröffnen", „Konto schließen" (Zielkonto), „Überweisen" (Signal Forms) und „Gehaltskonto wechseln"; Monatsübersicht aus den Monatswerten.
- **Abnahme:** Alle Abläufe per Maus und Tastatur bedienbar; Fehlercodes der Engine als verständliche Texte; i18n extrahiert. Seitentests: Konto eröffnen und schließen, überweisen, Gehaltskonto wechseln, Banken sortieren.
- **Referenzen:** US-BK-01–US-BK-05, US-EK-03; PS §10.3
- **Abhängig von:** AP 3.4

#### AP 3.6 – Benachrichtigungen

- **Umfang:** `notifications`: Slice, Benachrichtigungszentrum, Toasts mit Bündelung, Abwesenheitsbericht nach der Nachberechnung, Auto-Pause je Ereignis-Code in der Engine (unterdrückt bei Nachberechnung und verborgener App), begrenzte Speicherung, Zähler in der Kopfzeile. Die Schalter für die Auto-Pause kommen auf die Einstellungsseite aus AP 2.6.
- **Abnahme:** Tests für Slice, Effects und die Auto-Pause-Regeln. Eine Überziehung erzeugt eine Warnung und, falls eingestellt, eine Pause; nach der Rückkehr erscheint der Abwesenheitsbericht. Seitentest: Warnung im Zentrum und als Toast, Auto-Pause, Abwesenheitsbericht.
- **Referenzen:** US-BN-01–US-BN-03, US-ZT-06; TS §3.6, §12
- **Abhängig von:** AP 3.3, AP 2.6

### M4 – Märkte und Charts

**Ziel:** Märkte im Trading-Look mit Live-Kursen, Charts und Indikatoren.
**Ergebnis:** Marktübersicht, Screener, Watchlist und Instrumentseite mit Live-Chart.

#### AP 4.1 – Marktdaten-Feed und Market-Slice

- **Umfang:** Abos (`subscribe`, `unsubscribe`) über Guards und Effects (TS §11.3), `quotes`-Ereignisse, Instrument-Stammdaten als Projektion, Abfragen (Details, Kerzen, Suche, Filter), Market-Slice mit Entity-Adaptern, Referenzzählung der Abos.
- **Abnahme:** Tests für Service, Effects, Reducer und Selektoren; Kursupdates kommen gedrosselt im Store an; Verlassen einer Seite beendet ihre Abos.
- **Vormerkungen** (aus AP 1.6a und AP 1.7): Lange Zeiträume von Indizes und ETFs nicht aus Minutenkurven rechnen (rund 2,5 s je Spieljahr), sondern aus den gespeicherten Tageskerzen oder den Stützpunkten (`SupportValues`). Gewinner, Verlierer und Sektorentwicklung rechnet der Worker; die UI abonniert dafür nicht alle Instrumente.
- **Referenzen:** US-MK-05; TS §8.4, §11.3
- **Abhängig von:** AP 2.5

#### AP 4.2 – Chart-Komponenten

- **Umfang:** `charts/ui`: Kurschart-Wrapper (TS §11.7), Sparkline und Donut als SVG-Komponenten.
- **Abnahme:** Chart mit Live-Daten; Theme-Wechsel wirkt; beim Verlassen der Seite wird der Chart entfernt (kein Speicherleck); die Bibliothek wird lazy geladen. Der Komponententest des Kurscharts deckt Live-Updates und Theme-Wechsel ab.
- **Vormerkungen** (aus AP 1.7): Der Wrapper `charts/ui/price-chart` braucht noch inkrementelle Updates, Overlays und Outputs (TS §11.7).
- **Referenzen:** US-CH-01; TS §11.7; E-04
- **Abhängig von:** AP 4.1, AP 1.7

#### AP 4.3 – Indikatoren

- **Umfang:** `analysis/domain`: SMA, EMA, SMMA und Bollinger-Bänder als reine, inkrementell fortschreibbare Funktionen; Auswahl und Parameter im Chart; Speicherung in `pgo.ui.chart`.
- **Abnahme:** Tests mit Referenzwerten; mehrere Indikatoren gleichzeitig.
- **Referenzen:** US-CH-02; TS §11.7
- **Abhängig von:** AP 4.2

#### AP 4.4 – Marktübersicht, Screener und Watchlist

- **Umfang:** Märkte-Seite (Indizes, Gewinner und Verlierer, Sektoren); Screener mit Filtern nach TS §5.3, Sortierung, virtuellem Scrollen und Sparklines; Watchlist im Spielerzustand (Kommando `updateWatchlist`); kurze Hervorhebung von Kursänderungen, die bei „Bewegung reduzieren“ entfällt (US-MK-05; Schalter in AP 6.2). Soll-Punkte, die laut PO-Entscheidung vom 13.11.2026 in diesem AP umgesetzt werden: Heatmap der Sektoren (US-MK-01), Reihenfolge der Watchlist per Drag & Drop (US-MK-04).
- **Abnahme:** Filter sind kombinierbar; die Watchlist bleibt nach dem Neuladen erhalten; bei Quotes für 250 Instrumente bleibt die Main-Thread-Arbeit je Update unter 4 ms. Seitentest: suchen, Filter kombinieren, sortieren, Watchlist ändern.
- **Referenzen:** US-MK-01, US-MK-02, US-MK-04, US-MK-05; TS §14.3
- **Abhängig von:** AP 4.2

#### AP 4.5 – Instrument-Detailseite

- **Umfang:** Kurskopf (Geld, Brief, Spread, Handelsstatus), Chart mit Indikatoren, Kennzahlen (Volatilität und Beta mit den Statistikfunktionen aus AP 1.8a), Profil für Aktien und ETFs (Text aus Vorlagen-Code), Dividenden (Historie, nächster Termin), Aktionen (Watchlist; Kaufen und Verkaufen werden in AP 5.4 angebunden). Der Dividendenkalender für Depot und Watchlist (US-MK-06) folgt in AP 5.7.
- **Abnahme:** Alle Angaben aus US-MK-03 sichtbar und live aktualisiert, Kursänderungen hervorgehoben (US-MK-05). Seitentest: Aktie und ETF öffnen, Angaben prüfen, zur Watchlist hinzufügen.
- **Entschieden (13.11.2026):** Der indikative Wert zeigt am Wochenende den Stand von Freitag 24:00 (Vorschlag aus TS §6.6 bestätigt). Kennzahlen: Volatilität annualisiert aus den täglichen Log-Renditen der letzten 252 Markttage, Beta gegen den Welt-Kursindex im selben Fenster, Dividendenrendite = Dividenden mit Ex-Tag in den letzten 12 Monaten ÷ Kurs, Performance 1M/1J/5J als Kursveränderung.
- **Referenzen:** US-MK-03, US-MK-05, US-MK-06; TS §5.4, §6.6, §8.6
- **Abhängig von:** AP 4.3, AP 4.4, AP 1.8a

### M5 – Handel, Depot und Steuern

**Ziel:** Das Kernspiel ist komplett.
**Ergebnis:** Kaufen, verkaufen, Daueraufträge, Sparpläne, Steuern, Depot und Dashboard mit Benchmark – der Funktionsumfang des MVP. Dazu kommen Nachbesserungen an Chart und Kopfzeile (AP 5.8, AP 5.9). Sie hängen von keinem anderen M5-AP ab und können jederzeit umgesetzt werden.

**`SCHEMA_VERSION` in M5 (PO-Entscheidung 13.11.2026):** Sie wird in M5 nur einmal erhöht, am Ende, mit dem letzten AP, das den Spielerzustand ändert. Zwischenstände von M5 erhöhen sie nicht, auch wenn sich die Struktur des gespeicherten Zustands ändert (abweichend von §2.4); Spielstände aus Zwischenständen von M5 können deshalb unbrauchbar werden. **Erledigt (14.11.2026):** Mit dem Abschluss von M5 ist `SCHEMA_VERSION` 6; Spieler vom Stand M4 (Schema 5) gelten als veraltet.

#### AP 5.1 – Depot und Orderausführung

- **Umfang:** Depot mit Verrechnungskonto eröffnen; Orderarten und Gültigkeit; Prüfung je Tick; Ausführung zu Geld- und Briefkurs; Gebühren; Reservierung, Ablehnung und Ablauf; Sonderfall Pause; Sperre neuer Käufe bei negativem Verrechnungskonto; Ereignisse.
- **Abnahme:** Tests für alle Orderarten und Zustandsübergänge (inkl. Storno und Ablauf ausgelöster Stop-Limit-Orders), Kurslücken, Reservierungen und Gebührenmodelle; die Markt-Prüfsumme ist mit und ohne Orders identisch.
- **Geklärt (13.11.2026, TS §7.5):** Betragsorders berechnen die Stücke bei der Ausführung, Stück = (Betrag − Kosten) / Brief zum Ausführungskurs, abgerundet auf ganze Stück bzw. auf Millionstel bei `fractionalShares`; reserviert wird der Betrag. „Bis Tagesende“ endet mit dem nächsten Handelsschluss der Börse des Instruments (außerhalb der Handelszeit dem des nächsten Handelstags). Verkaufsorders dürfen bei allen Banken Bruchstücke enthalten; nur Kauf-Einzelorders sind bei Banken ohne `fractionalShares` auf ganze Stück beschränkt. Reservierungen offener Kauforders mindern den verfügbaren Betrag des Verrechnungskontos (für Überweisungen, Daueraufträge und Sparpläne). Bewertet wird zum Geldkurs ohne Aufschlag des Handelsplatzes (TS §7.9). Die Kaufsperre an der Kursuntergrenze (E-22) ist entschieden.
- **Referenzen:** US-HD-01–US-HD-03; TS §7.4, §7.5
- **Abhängig von:** AP 3.3, AP 1.6b

AP 5.1 wurde nach §2.5 geteilt (13.11.2026) und ist mit allen drei Teilen fertig: **AP 5.1a** die Orderregeln als reine Funktionen in `trading/domain` mit den Beispieltabellen in TS §7.5, **AP 5.1b** die Orders in der `GameEngine` (`engine/domain/order-system.ts`: Kommandos, Prüfung je Tick, Ausführung, Ablauf, Reservierungen, Bestände), **AP 5.1c** Protokoll und Worker-Host, Projektion der Orders und Bestände an die UI, `AccountView.reserved`, `EngineService` und die Texte der Order-Benachrichtigungen samt Abwesenheitsbericht (TS §8.2–§8.4, §12).

#### AP 5.2 – Positionen, Lots, Ausschüttungen und Depotgebühr

- **Umfang:** Positionen und Lots nach FIFO mit Anschaffungskosten in Cent, Einstandskurs, realisierte Gewinne und Verluste; Dividenden und ETF-Ausschüttungen an die Bestände am Stichtag, Gutschrift am Zahltag; Depotgebühr quartalsweise auf den durchschnittlichen Depotwert.
- **Abnahme:** Tests für FIFO-Teilverkäufe (Anschaffungskosten summieren sich exakt), Stichtagsregel, ausschüttende ETFs, Depotgebühr inklusive Belastung eines leeren Verrechnungskontos.
- **Geklärt (13.11.2026):** Ein Depot darf zwischen Ex-Tag und Zahltag geschlossen werden; die Dividende bzw. Ausschüttung geht am Zahltag auf das beim Schließen gewählte Zielkonto (TS §7.4). Depotgebühr bei angebrochenen Quartalen (Festlegung ohne PO-Entscheidung, TS §7.3): anteilig nach Kalendertagen wie die Kontoführung, der Durchschnitt läuft über die Tage, an denen das Depot offen war; beim Schließen wird die anteilige Gebühr mit der Abrechnung gebucht. Die Details legt AP 5.2 fest.
- **Referenzen:** US-PF-06, US-BK-08; TS §6.5, §7.4, §7.6
- **Abhängig von:** AP 5.1c

AP 5.2 ist fertig (13.11.2026): Lots nach FIFO in `portfolio/domain` mit Beispieltabellen in TS §7.6, Ausschüttungen am Ex-Tag und Zahltag (`DistributionSystem`), Depotgebühr aus Tageswerten mit Beispieltabelle in TS §7.3, Gesamtvermögen mit Positionswerten und die erweiterte Projektion (TS §8.3, §8.4). Die Steuer auf Verkäufe und Ausschüttungen hängt AP 5.3 an den Haken `taxCapitalIncome` der Engine.

#### AP 5.3 – Steuern

- **Umfang:** Baut auf dem Steuerkern aus AP 3.2 auf. Steuersystem nach TS §7.7: Einbehalt und Erstattung, Sparerpauschbetrag, Verlustvortrag, Jahreswechsel; Steuer-Projektion und Steuer-Slice.
- **Abnahme:** Tests mit Jahresszenarien: nur Gewinne, nur Verluste, gemischt, über den Jahreswechsel, mit Zinsen und Dividenden.
- **Referenzen:** US-ST-01–US-ST-03; TS §7.7; E-11
- **Abhängig von:** AP 5.2

AP 5.3 ist fertig (13.11.2026): Verkäufe, Dividenden und Ausschüttungen gehen mit den Habenzinsen in einen Topf (`BankingSystem.taxCapitalIncome`), Einbehalt und Erstattung auf dem Konto des auslösenden Ereignisses, Jahreshistorie `closedTaxYears` mit den Kennzahlen der Steuerübersicht, Steuervorschau `saleTaxPreview` für AP 5.4, Steuer-Projektion und Slice `taxes` mit den Selektoren für AP 5.4 und AP 5.5 (TS §7.7, §8.3, §11.3). Abnahme: Jahresszenarien in `engine/domain/game-engine-taxes.spec.ts` mit den Beispieltabellen in TS §7.7.

#### AP 5.4 – Order-Ticket und Orderbuch

- **Umfang:** Trading-Slice; Order-Ticket als Dialog (Signal Forms, Live-Kostenvorschau mit derselben Gebührenfunktion wie die Engine, Deckungsprüfung, Steuervorschau beim Verkauf); Orderbuch mit offenen Orders und Historie, Stornieren und Ändern; Anbindung von Kaufen und Verkaufen auf der Instrumentseite; Depot mit Verrechnungskonto im Dialog „Konto eröffnen“ (Engine seit AP 5.1).
- **Abnahme:** Tests für Slice und Effects; Kauf und Verkauf von der Instrumentseite und Storno aus dem Orderbuch; verständliche Fehlermeldungen. Seitentests: Depot eröffnen, kaufen mit Kostenvorschau, verkaufen mit Steuervorschau, Order ändern und stornieren.
- **Referenzen:** US-HD-01–US-HD-04; TS §2.3
- **Abhängig von:** AP 5.3, AP 4.5, AP 3.6

AP 5.4 wurde nach §2.5 geteilt (13.11.2026) und ist mit beiden Teilen fertig: **AP 5.4a** der Trading-Slice, das Order-Ticket als Dialog mit Kosten-, Deckungs- und Steuervorschau und Kaufen/Verkaufen auf der Instrumentseite, **AP 5.4b** das Orderbuch (`/game/:playerId/orders`: offene Orders mit Reservierungen je Verrechnungskonto, Historie mit Ausführungsdetails), „Order ändern“ und Stornieren mit Bestätigung, der Systemtest `e2e/trading.e2e.ts` und Nacharbeiten (Dialoghöhe, „Depot“ vorbelegt im Dialog „Konto eröffnen“, `formatSignedCents` im Ticket). Abnahme: Slice- und Effect-Tests, Seitentests `market/feature/instrument/instrument-trade.page.spec.ts` und `trading/feature/orders/orders.page.spec.ts` (TS §7.5, §11.3, §11.4, §11.8).

#### AP 5.5 – Depot, Positionen und Steuerübersicht (UI)

- **Umfang:** Depotübersicht (Positionen, Summen, Allokation als Donut nach Assetklasse, Region und Sektor) mit Kaufen und Verkaufen aus der Positionsliste; Positionsdetail (Lots, realisierte Gewinne, Dividenden, Trades im Chart als S); Steuerseite. ETF-Durchschau in der Allokation (Muss, E-28).
- **Abnahme:** Werte stimmen mit der Engine-Projektion überein; Tabellen sortierbar; Kauf und Verkauf aus dem Depot; responsive. Seitentest: Positionen, Allokation, Positionsdetail, Steuerseite.
- **Referenzen:** US-PF-02, US-PF-03, US-PF-06, US-ST-04; E-28
- **Abhängig von:** AP 5.4

AP 5.5 wurde nach §2.5 geteilt (14.11.2026) und ist mit beiden Teilen fertig: **AP 5.5a** die Depotseite (`/game/:playerId/portfolio`: Positionen je Depot oder zusammengefasst, sortierbar, Summen, Kaufen und Verkaufen je Zeile, Allokation nach Assetklasse, Region und Sektor mit ETF-Durchschau), **AP 5.5b** das Positionsdetail (`/game/:playerId/portfolio/:instrumentId`: Kennzahlen, Lots, realisierte G/V, Ausschüttungen, Ausführungen, eigene Trades als Marker im Chart), die Steuerseite (`/game/:playerId/taxes`) und der Systemtest `e2e/portfolio.e2e.ts`. Abnahme: Seitentests `portfolio/feature/portfolio/portfolio.page.spec.ts`, `portfolio/feature/position/position.page.spec.ts` und `taxes/feature/taxes/taxes.page.spec.ts` (TS §7.9, §11.3, §11.4, §11.7).

#### AP 5.6a – Daueraufträge

- **Umfang:** Engine: Kommandos anlegen, ändern, pausieren und löschen; Ausführung im Bank-Lauf um 06:00 am Ausführungstag (1–28) bzw. am nächsten Bankarbeitstag, als letzter Schritt nach allen Gutschriften und Lastschriften der Bank; Ausfall ohne Teilüberweisung mit Ereignis und Benachrichtigung, wenn der verfügbare Betrag des Quellkontos nicht reicht (Reservierungen offener Kauforders mindern ihn). Slice und UI auf der Kontenseite.
- **Abnahme:** Tests für Ausführungstage, Wochenenden (nächster Bankarbeitstag), Reihenfolge im Bank-Lauf (Dauerauftrag am Gehaltstag sieht das Gehalt), fehlende Deckung; Daueraufträge werden auch während der Nachberechnung ausgeführt. Seitentest: Dauerauftrag anlegen, ändern, pausieren, löschen.
- **Geklärt (14.11.2026):** Ein Konto, das Quell- oder Zielkonto eines Dauerauftrags ist, lässt sich erst schließen, wenn der Dauerauftrag gelöscht ist (TS §7.4).
- **Hinweis:** Fachlich hängt das AP nur an AP 3.5 und AP 5.1 (Reservierungen mindern den verfügbaren Betrag); im Plan läuft es nach AP 5.5.
- **Referenzen:** US-BK-10; TS §7.4; E-21
- **Abhängig von:** AP 3.5, AP 5.1c

AP 5.6a ist fertig (14.11.2026): Regeln in `banking/domain/standing-order-logic.ts`, Kommandos `createStandingOrder`, `changeStandingOrder`, `setStandingOrderPaused`, `deleteStandingOrder`, Ausführung als letzter Schritt des Bank-Laufs (`standing-orders`), Ausfall mit `standing-order-failed`, Projektion `standingOrders` mit nächstem Termin, Tab „Daueraufträge“ auf der Kontenseite. Abnahme: Engine-Szenarien `engine/domain/game-engine-standing-orders.spec.ts` (Ausführungstage, Wochenende, Gehaltstag, mehrere am selben Tag, fehlende Deckung auch durch Reservierungen, Pause, Ändern, Löschen, Schließen), Nachberechnung im Host-Test `engine-host-standing-orders.spec.ts`, Eigenschaften in `engine-properties.spec.ts`, Seitentest `banking/feature/accounts/accounts.page.spec.ts` („standing orders“: anlegen, ändern, pausieren, fortsetzen, Ausführung nach einem Sprung im Kontoauszug, Schließen gesperrt, löschen).

#### AP 5.6b – Sparpläne

- **Umfang:** Engine (Ausführung immer in Bruchstücken, Kosten, Ausfall), Kommandos und UI (anlegen, ändern, pausieren, löschen; Übersicht im Depot und unter Orders). Sparpläne buchen nur vom Verrechnungskonto ihres Depots; den Zufluss übernimmt ein Dauerauftrag (AP 5.6a, E-21, TS §7.8).
- **Abnahme:** Tests für Ausführungstage, Wochenenden, Bruchstücke und fehlende Deckung; Sparpläne werden auch während der Nachberechnung ausgeführt. Seitentest: Sparplan anlegen, ändern, pausieren, löschen.
- **Referenzen:** US-HD-05; TS §7.8; E-21
- **Abhängig von:** AP 5.5

AP 5.6b ist fertig (14.11.2026): Regeln in `trading/domain/savings-plan-logic.ts` (Prüfung, Kosten `fee(savingsPlanFee, Betrag)`, Stück auf Millionstel, Ausfallgründe, Buchung `buy` mit `refs.savingsPlanId`, Vorschau) und `savings-plan-schedule-logic.ts` (Termin = Handelsbeginn der Börse am Tag oder nächsten Handelstag, erledigte Monate, nächste Ausführung), Mindestbetrag 1,00 € (Festlegung); `SavingsPlanSystem` mit den Kommandos `createSavingsPlan`, `changeSavingsPlan` (Betrag und Tag), `setSavingsPlanPaused`, `deleteSavingsPlan` und dem Termin `savings-plan` (Rang nach `session-open`); Ereignisse und Benachrichtigungen `savings-plan-executed`/`-failed`; Projektion `savingsPlans`; Tab „Sparpläne“ im Orderbuch, Abschnitt „Sparpläne“ auf der Depotseite, „Sparplan anlegen“ auf Instrumentseite und Positionsdetail. Abnahme: Beispieltabellen und Properties `trading/domain/savings-plan-logic.spec.ts`, `savings-plan-schedule-logic.spec.ts`; Engine-Szenarien `engine/domain/game-engine-savings-plans.spec.ts` (Ausführungstage, Wochenenden, Bruchstücke, mehrere am selben Termin, Dauerauftrag um 06:00 deckt den Sparplan, fehlende Deckung auch durch Reservierungen, Kursuntergrenze, Pause, Ändern, Löschen, Depot schließen, Snapshot); Nachberechnung im Host-Test `engine-host-savings-plans.spec.ts`; Eigenschaften in `engine-properties.spec.ts`; Seitentest „savings plan“ in `trading/feature/orders/orders.page.spec.ts` (anlegen von der Instrumentseite mit Vorschau, ändern, pausieren, fortsetzen, Ausführung nach Sprung als Position und Benachrichtigung, löschen auf der Depotseite); Perf-Fall in `engine.perf.spec.ts` (TS §14.3).

#### AP 5.7 – Dashboard und Performance

- **Umfang:** Tagesreihen (Vermögen, Zuflüsse), zeitgewichtete Rendite, Benchmark-Schattenportfolio und zweite Vergleichsgröße (US-PF-05, E-28); Dashboard mit Gesamtvermögen (Kopfzeile und Kachel), Vermögensverlauf, Cashflow des Monats, Top-Positionen, Watchlist, letzten Benachrichtigungen und „Demnächst" (nur planbare Termine, TS §8.1; S). Soll: Erträge und Kosten (US-PF-07), Dividendenkalender für Depot und Watchlist (US-MK-06), „Erste Schritte“ auf der Übersicht (US-UI-10).
- **Abnahme:** Tests für Rendite (inkl. Tagen mit Vermögen ≤ 0) und Benchmark; Dashboard vollständig. Seitentest des Dashboards mit Werten aus dem Domain-Code als Orakel.
- **Geklärt (13.11.2026):** Externe Flüsse gehen am Tagesanfang in die Rendite ein, `r_day = V_end / (V_start + CF_day) − 1`; Tage mit `V_start + CF_day ≤ 0` gehen nicht in die Verkettung ein. „Veränderung heute“ rechnet ohne externe Zuflüsse (Einkommen, Lebenshaltung), zeigt also Markt, Zinsen, Kosten und Steuern (TS §7.9). „Demnächst“ liest die planbaren Termine aus Terminplaner und Kalender mit Basisbeträgen, ohne Vorausrechnung (E-05, TS §8.1). Zweite Vergleichsgröße und „Erste Schritte“ gehören zum Umfang (E-28).
- **Referenzen:** US-PF-01, US-PF-04, US-PF-05, US-PF-07, US-MK-06, US-UI-10; TS §7.9, §8.1; E-05, E-28
- **Abhängig von:** AP 5.5

AP 5.7 wurde nach §2.5 geteilt (14.11.2026) und ist mit allen drei Teilen fertig: **AP 5.7a** Tagesreihen, zeitgewichtete Rendite, Benchmark und zweite Vergleichsgröße (TS §7.9, Abfrage `performanceHistory`), **AP 5.7b** die Übersicht (`/game/:playerId/dashboard`) mit „Erste Schritte“, Gesamtvermögen, Vermögensverlauf, Performance, „Demnächst“ (Abfrage `upcoming`, TS §8.1), Cashflow, Top-Positionen, Watchlist und letzten Benachrichtigungen, **AP 5.7c** die Soll-Teile Erträge und Kosten (US-PF-07: Kostenarten und geschätzte Spread- und TER-Kosten in den Monatswerten, Tab „Erträge und Kosten“ der Kontenseite, TS §7.4) und Dividendenkalender für Depot und Watchlist (US-MK-06: Kachel der Übersicht, TS §8.1), „Erste Schritte“ wieder einblenden, Aufräumen von `pgo.ui.firstSteps` beim Löschen eines Spielers und der Systemtest `e2e/dashboard.e2e.ts`. Abnahme: Beispieltabellen in `portfolio/domain/performance-logic.spec.ts`, `banking/domain/monthly-values-logic.spec.ts`, `income-costs-logic.spec.ts`, `portfolio/domain/cost-estimate-logic.spec.ts`, `dashboard/domain/*.spec.ts`; Engine-Szenarien `game-engine-performance.spec.ts`, `game-engine-upcoming.spec.ts`, `game-engine-savings-plans.spec.ts` (Kosten in den Monatswerten); Seitentests `dashboard/feature/dashboard/dashboard.page.spec.ts` (Werte der Engine als Orakel) und `banking/feature/accounts/accounts.page.spec.ts` (Erträge und Kosten).

#### AP 5.8 – Chart: wählbare Auflösung und Indikatorfarben

- **Umfang:** Nachbesserungen am Chart der Instrumentseite. Thematisch gehören sie zu M4, laut PO-Entscheidung vom 13.11.2026 werden sie in M5 umgesetzt.
  - **Auflösung:** Neben dem Zeitraum wählt der Anwender die Kerzen-Auflösung (`1m`, `5m`, `15m`, `1h`, `1d`, `1w`). Standard bleibt die automatische Zuordnung je Zeitraum (`CHART_RANGE_INTERVALS`, TS §11.7). Angeboten werden je Zeitraum nur Auflösungen, die die Grenzen der Kerzenabfrage einhalten (`MAX_INTRADAY_DAYS`, `MAX_CANDLE_LIMIT`; TS §8.2). Nachladen beim Scrollen und Live-Kerzen laufen in der gewählten Auflösung.
  - **Indikatorfarben:** Im Indikator-Formular wählt der Anwender eine Farbe aus der Chart-Palette (`--pgo-chart-1` … `-6`). Bei SMA, EMA und SMMA ist das die Linienfarbe. Bei Bollinger gilt sie für Mittellinie und Bänder; die Fläche zwischen den Bändern wird transparent gefüllt, in einer aus der Linienfarbe abgeleiteten Farbe. Die Farbe wird mit dem Indikator in `pgo.ui.chart` gespeichert; ein neuer Indikator bekommt weiterhin die erste freie Farbe.
  - PS US-CH-01 („die Auflösung passt sich an“) und US-CH-02 sowie TS §6.8 und §11.7 an das neue Verhalten anpassen.
- **Abnahme:**
  - Zeitraum und Auflösung sind kombinierbar; unzulässige Kombinationen lassen sich nicht wählen.
  - Die Farbauswahl ist per Tastatur bedienbar und zugänglich benannt.
  - Die Bollinger-Fläche ist im hellen und im dunklen Theme lesbar, Kerzen und Linien darunter bleiben erkennbar.
  - Seitentest: Auflösung wählen, der Chart zeigt Kerzen dieser Auflösung und lädt beim Scrollen ältere; Farbe eines Indikators ändern, sie bleibt nach dem Neuladen erhalten.
- **Geklärt (13.11.2026):**
  - Die gewählte Auflösung bleibt beim Wechsel des Zeitraums erhalten, solange sie zulässig ist, sonst fällt sie auf „Auto“ zurück. Sie wird nicht in `pgo.ui.chart` gespeichert.
  - Mehrere Indikatoren dürfen dieselbe Farbe haben; die Regel „höchstens ein Indikator je Chart-Farbe“ (TS §11.7) entfällt. Ein neuer Indikator bekommt weiterhin die erste freie Farbe, sind alle belegt, die erste. Die Obergrenze an Indikatoren bleibt.
- **Hinweis:** Der Wrapper `charts/ui/price-chart` zeichnet bisher nur Linien-Overlays, die Bollinger-Bänder gestrichelt. Für die Fläche zwischen zwei Linien braucht er eine Erweiterung, z. B. ein Series-Primitive von lightweight-charts.
- **Referenzen:** US-CH-01, US-CH-02; TS §6.8, §8.2, §11.7
- **Abhängig von:** AP 4.5

#### AP 5.9 – Kopfzeile: stabiles Layout der Uhr

- **Umfang:** Layoutfehler der Uhr in der Kopfzeile (`clock/ui/clock-controls`). Thematisch gehören sie zu AP 2.5, laut PO-Entscheidung vom 13.11.2026 werden sie in M5 umgesetzt.
  - **Spielzeit:** Im Schnelldurchlauf springt das Layout, weil die Wochentagskürzel unterschiedlich breit sind („Mi“, „Do“); die Ziffern sind schon `tabular-nums`. Die Anzeige bekommt eine feste Breite, sodass die Elemente danach stillstehen.
  - **Pause:** Beim Pausieren erscheint der Chip „Pausiert“ vor dem Pause-Knopf und schiebt ihn zur Seite; wer sofort weiterlaufen lassen will, muss die Maus nachführen. Der Knopf bleibt beim Wechsel zwischen Laufen und Pause an derselben Stelle. Das gilt auch für den Chip „ausgelastet“ und für eine Auto-Pause mit Grund („Pausiert: Dispo überschritten“), deren Text unterschiedlich lang ist.
  - Die Beschreibung der Uhrleiste in TS §11.4 nachziehen.
- **Abnahme:**
  - Position und Breite des Pause-Knopfs und der Elemente rechts der Uhrzeit ändern sich weder über alle sieben Wochentage noch beim Wechsel zwischen Laufen und Pause.
  - Das gilt in der Desktop- und in der kompakten Ansicht (360 px).
  - Pausieren und Fortsetzen gelingen mit zwei Klicks an derselben Stelle.
  - Systemtest, weil nur ein echter Browser das Layout zeigt: Er vergleicht die Bounding-Boxes.
- **Referenzen:** US-ZT-01, US-ZT-03; TS §11.4
- **Abhängig von:** AP 2.5

### M6 – Export, PWA und Release 1.0

**Ziel:** Datensicherheit, Installierbarkeit und Feinschliff.
**Ergebnis:** Version 1.0 mit Export und Import, PWA und Einstellungen.

#### AP 6.1 – Export und Import

- **Umfang:** Export (TS §10.2) mit dem Marktzustand vom Beginn des Export-Tags; Import (TS §10.3) mit Validierung, sofortiger Spielbarkeit, Nachrechnen der Kurshistorie im Hintergrund, Prüfsummenvergleich, Fortschritt und verständlichen Fehlermeldungen; Backup-Erinnerung.
- **Abnahme:**
  - Tests für Format, Validierung und Prüfsumme.
  - Nach Export und Import ist der Spielerzustand zum Export-Tick identisch (abgesehen von ID und Name); die Markt-Prüfsumme der nachgerechneten Historie stimmt.
  - Die Exportdatei enthält keine Stützpunkte des laufenden Tags.
  - Ein Spieler mit 50 Spieljahren ist nach unter 3 s spielbar; Datei und Zwischenablage funktionieren.
  - Rundreise Export → Import als Eigenschaft (Spielerzustand gleich bis auf ID und Name); eingefrorene Fixture je `formatVersion`.
  - Seitentest: exportieren, importieren, beschädigte Datei ablehnen.
  - Systemtest mit echtem Download und Upload in Chromium, Firefox und WebKit.
- **Geklärt (14.11.2026):** E-10 mit Ergänzungen bestätigt – gzip schon in Formatversion 1, Export ohne `commands`, Import startet pausiert (TS §10.1, §10.3).
- **Vor der Umsetzung klären:** Beim Import legt die UI das Profil an (Vorschlag, TS §9.1; in AP 6.1 so umgesetzt, Bestätigung durch den PO offen).
- **Referenzen:** US-EX-01–US-EX-03; TS §10; E-10
- **Abhängig von:** AP 5.6a, AP 5.6b, AP 5.7, AP 6.7 (die erweiterten Hintergrund-Einstellungen gehören schon in Formatversion 1)

#### AP 6.2 – Einstellungen

- **Umfang:** Baut auf AP 2.6 auf und vervollständigt die Einstellungen: übrige Geräteeinstellungen (Gewinn- und Verlustfarben, Hervorhebung von Kursänderungen, Toast und Browser je Ereignis-Code); spielerbezogene Einstellungen (Name, Seed anzeigen und kopieren, Export).
- **Abnahme:** Tests für Slice und Service; Geräteeinstellungen bleiben nach dem Neuladen erhalten; Spielereinstellungen wandern mit dem Export. Seitentest der vollständigen Einstellungsseite.
- **Umgesetzt (14.11.2026):** Farben Grün/Rot oder Blau/Orange (US-UI-02, Soll, mit umgesetzt), Kurs-Hervorhebung an/aus, Toast und Browser je Code (Browser wirkt erst mit AP 6.3), Name und Seed des Spielers; `pgo.settings` bleibt Version 1 (TS §9.3, §11.5, §12).
- **Referenzen:** US-UI-01, US-UI-02, US-UI-09, US-SP-03, US-MK-05; TS §3.6, §9.3, §11.5, §12
- **Abhängig von:** AP 6.1, AP 3.6, AP 2.6

#### AP 6.3 – PWA und Browser-Benachrichtigungen

- **Umfang:** `@angular/service-worker` (Manifest, Icons – abgeleitet aus `src/assets/favicon.svg`, das Favicon und `apple-touch-icon.png` gibt es seit dem Nachtrag zu M5 –, Offline-Betrieb, Hinweis auf neue Versionen mit Angebot zum Neuladen, Hinweis vor 1.0 zu ungültig werdenden Spielständen), Installationshinweis, `NOTIFICATION_PORT` mit Web-Implementierung über `ServiceWorkerRegistration.showNotification()`, Anzeige des Speicherstatus in den Einstellungen.
- **Abnahme:** App ist installierbar und offline nutzbar: Systemtest (Service Worker aktiv, Neuladen ohne Netz) in Chromium, Firefox und WebKit, manuell unter Chrome für Android; nach Erlaubnis erscheinen Benachrichtigungen bei verborgenem Tab (am Desktop; Smartphones halten die App im Hintergrund an, PS US-BN-04).
- **Geklärt (14.11.2026):** E-05 bestätigt – PWA im MVP mit `@angular/service-worker`, Capacitor als optionaler Meilenstein N1, Ports (`NOTIFICATION_PORT`) jetzt vorbereiten (TS §13).
- **Umgesetzt (14.11.2026):** `@angular/service-worker` 22.2.5 mit `ngsw-config.json` (ganze App vorab im Cache, offline auch neue Spieler), Manifest und Icons aus der SVG, Banner „Neue Version verfügbar“ mit „Neu laden“, Hinweis vor 1.0 in Spielerauswahl und Einstellungen, Abschnitt „App“ in den Einstellungen (Installation, Erlaubnis für Benachrichtigungen, Speicherstatus), Browser-Benachrichtigungen bei verborgener App über `NOTIFICATION_PORT` und den Service Worker (TS §12, §13). Systemtests in Chromium und Firefox lokal grün, WebKit nur in der CI; offen sind die manuellen Prüfungen unter Chrome für Android und iOS (Installation, offline).
- **Referenzen:** US-UI-07, US-BN-04, US-EX-03; TS §12, §13, §15; E-05
- **Abhängig von:** AP 6.2

#### AP 6.4 – Performance und Robustheit

- **Umfang:** Messung gegen die Performance-Budgets (TS §14.3) und Optimierungen, auch für die Hintergrundmodi aus AP 6.7 (Engine bei gewählter Geschwindigkeit im verborgenen Tab, mit und ohne CPU-Drosselung); Verdichtung alter Tageskerzen (TS §6.8); Fehlerbehandlung (Worker-Neustart mit Wiederherstellung und Abbruch nach wiederholtem Fehlschlag, TS §8.5; `QuotaExceededError`); Budgets für das Referenz-Mobilgerät (E-27).
- **Abnahme:** Alle Budgets aus TS §14.3 mit Perf-Suite und Systemtests (CPU-Drosselung) gemessen und eingehalten oder Abweichungen dokumentiert; ein künstlich ausgelöster Worker-Absturz wird ohne Verlust von Anwender-Aktionen überstanden.
- **Geklärt (14.11.2026):** Die Verdichtung alter Tageskerzen wird in AP 6.4 umgesetzt (nicht verschoben). NF-07 wird gemessen (Schätzung TS §9.6: rund 1,7 MB je Spieljahr gegen das Budget von 1,5 MB), eine Überschreitung wird dem PO gemeldet, das Budget bleibt.
- **Referenzen:** NF-01, NF-02, NF-06, NF-07; TS §3.6, §8.5, §9.5, §14.3; E-27, E-35
- **Abhängig von:** AP 6.1, AP 1.9c, AP 6.7

#### AP 6.5 – Barrierefreiheit, Hilfen und Hinweise

- **Umfang:** Barrierefreiheit (Tastatur, Kontraste, Screenreader-Stichproben); Erklärungen und Glossar (S); Befehlspalette (S); rechtliche Hinweise und Lizenzen (TradingView-Attribution).
- **Geklärt (14.11.2026):** Impressum und Datenschutzhinweis sind ausgeklammert und folgen außerhalb von AP 6.5 auf Anweisung des PO; Glossar/Erklärungen und Befehlspalette (Soll) werden umgesetzt.
- **Abnahme:** Systemtest mit axe über alle Hauptansichten in hell und dunkel ohne ernste oder kritische Befunde; alle Aktionen per Tastatur erreichbar; Hinweise vorhanden.
- **Referenzen:** NF-09; US-UI-04–US-UI-06, US-UI-08
- **Abhängig von:** AP 6.3

#### AP 6.6 – Release 1.0

- **Umfang:** die dann gültige `simVersion` einfrieren und die Kompatibilitätszusage im beschlossenen Umfang aktivieren (TS §15, E-25); Versionsanzeige; README (Spielidee, Entwicklung, Deployment); CI/CD prüfen; Abschlusstest nach Checkliste aller Muss-Stories der Stufe 1.
- **Abnahme:** Alle APs sind fertig und alle Muss-Stories der Stufe 1 erfüllt (Zuordnung am Ende von §5); der Selbsttest zeigt auch auf einem iOS-Gerät (Safari) die Golden-Master-Prüfsummen, in Chromium, Firefox und WebKit prüft das J11 bei jedem Push (TS §4.6); Release deployt (Tag und Commit auf Anweisung).
- **Referenzen:** TS §4.6, §14.4, §15; E-25
- **Abhängig von:** AP 6.4, AP 6.5, AP 3.5, AP 6.8b

#### AP 6.7 – Verhalten im Hintergrund: weitere Modi

- **Umfang:** Die Spielereinstellung `backgroundMode` (TS §3.6) bekommt zu `realtime` und `pause` zwei Modi: `keep-speed` (verborgen läuft die gewählte Geschwindigkeit weiter) und `custom-speed` (verborgen mit einer eigenen `backgroundSpeed`). Dazu kommt `backgroundPauseAfter` (Echtzeit-Minuten oder aus), das für alle laufenden Modi gilt: Nach der Frist pausiert das Spiel an dem Tick, der zur Frist gehört. Betroffen sind `effectiveSpeed` (`engine/domain/clock-pacing-logic.ts`), `catchUpTarget` (`engine/domain/catch-up-logic.ts`), `autoPauseApplies`, der Engine-Host, das Kommando für die Einstellung, der `clock`-Slice und `settings/ui/player-settings`.
  - **Geschlossen oder eingefroren:** Nachberechnet wird weiter in Echtzeit (§3.7), sonst würde aus einer Stunde Einfrieren bei 1 w/s eine Nachberechnung von rund 69 Spieljahren. Der Host erkennt Lücken im Takt des Workers (Abstand zwischen zwei Durchläufen über der Schwelle; in Chromium zusätzlich `freeze`/`resume`) und zählt sie als Echtzeit.
  - **Auto-Pause:** greift in `keep-speed` und `custom-speed` auch bei verborgener App; die Ereignisse erscheinen im Abwesenheitsbericht, Browser-Benachrichtigungen folgen mit AP 6.3.
  - **Seiteneffekte prüfen und in TS §3.6 dokumentieren:** CPU und Akku im verborgenen Tab (Budget NF-02, E-27; die Messung gehört zu AP 6.4); Drosselung durch die Browser (Timer im Haupt-Thread, Intensive Throttling, Tab-Freezing und Energiesparmodus in Chromium, Firefox, Safari; Verhalten von Dedicated Workern); Drosselung der Projektionen im verborgenen Zustand (keine `quotes`, seltener `clock`); Persistenz (Takt von Snapshots und Uhr-Sicherung, `pgo.lastTick`, schnelleres Wachstum von Journal und Tageskerzen gegen NF-07); Hintergrundauftrag für Hoch und Tief und `liveHighLowMaxSpeed`; Web Lock und mehrere Tabs; Mobilgeräte, die die App anhalten.
  - `SCHEMA_VERSION` steigt auf 7, weil sich der Spielerzustand ändert (E-25 vor 1.0); spätere APs erhöhen bei Bedarf erneut.
- **Abnahme:**
  - Beispieltabelle für `effectiveSpeed`, die Pause-Frist und die Nachberechnung in TS §3.6 und §3.7, als Logiktests umgesetzt.
  - Eigenschaft: Eine Lücke im Takt bringt nie mehr Spielzeit als Echtzeit.
  - Host-Tests mit simulierter Sichtbarkeit und Uhr: Wechsel der Modi, Frist, Auto-Pause verborgen, Lücke.
  - Seitentest der Spielereinstellungen. Ein Systemtest für den verborgenen Tab ist nicht möglich (TS §14.1).
  - Die Seiteneffekte sind in TS §3.6 mit Befund und Gegenmaßnahme dokumentiert.
- **Geklärt (14.11.2026):** E-35 bestätigt – Lücken im Takt über 5 s zählen als Echtzeit, die Frist `backgroundPauseAfter` gilt auch bei geschlossener App, die Auto-Pause greift in den neuen Modi auch verborgen.
- **Referenzen:** US-ZT-01, US-UI-09; TS §3.5–§3.7, §12, §14.3; E-02, E-35
- **Abhängig von:** AP 2.6, AP 3.6

#### AP 6.8a – Sprachumschaltung: Mechanik

- **Umfang:** Deutsch und Englisch als Sprachen (TS §11.9, E-36). `main.ts` liest die Sprache aus den Geräteeinstellungen, lädt bei Englisch die Übersetzungen (`loadTranslations()` aus `@angular/localize`) und importiert erst danach den Bootstrap, weil `$localize` in Modulkonstanten schon beim Import ausgewertet wird. Es bleibt bei einem Build; die Übersetzungsdatei wird mit der PWA zwischengespeichert. Umschalten in den Geräteeinstellungen lädt die App neu. `LOCALE_ID`, Locale-Daten und `<html lang>` folgen der Sprache; `shared/util/format.ts` bekommt eine einstellbare Locale (Englisch: `en-GB`), Währung EUR und Zeit UTC bleiben. Standard ist Deutsch, unabhängig von der Browsersprache. Eine Prüfung in `npm run verify` meldet IDs aus `messages.xlf` ohne Übersetzung (Gate ab AP 6.8b).
- **Abnahme:** Formattabelle für Englisch in TS §11.9 als Logiktest; Seitentest der Einstellung; Systemtest: auf Englisch umschalten, neu laden, englischer Text und englisches Zahlenformat erscheinen, `@intl` bleibt grün.
- **Geklärt (14.11.2026):** E-36 bestätigt wie vorgeschlagen.
- **Referenzen:** US-UI-11; TS §9.3, §11.9; E-36
- **Abhängig von:** AP 6.2

#### AP 6.8b – Englische Übersetzung

- **Umfang:** alle Texte ins Englische, auch die Texte der Engine-Codes, Glossar und Erklärungen, rechtliche Hinweise und Manifest; Begriffsliste DE → EN für Fachbegriffe (Depot, Verrechnungskonto, Sparerpauschbetrag …) in TS §11.9; die Prüfung auf fehlende Übersetzungen wird Teil des Gates.
- **Abnahme:** keine fehlende Übersetzung; Stichprobe aller Hauptansichten auf Englisch im Browser (Textlängen, Umbrüche) und axe-Prüfung in beiden Sprachen.
- **Referenzen:** US-UI-11; TS §11.9; E-36
- **Abhängig von:** AP 6.8a, AP 6.5, AP 6.7

### Zuordnung der User Stories

Stories der Stufe 1 (PS §7) und die Arbeitspakete, die sie umsetzen. AP 6.6 prüft die Muss-Stories nach dieser Liste.

| Stories                                    | Arbeitspakete                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| US-SP-01–03                                | AP 2.4; Seed in den Einstellungen: AP 6.2                                                                  |
| US-ZT-01–05                                | AP 2.5 (US-ZT-05 Soll); Schalter für Tastenkürzel und Hintergrund: AP 2.6; weitere Hintergrundmodi: AP 6.7 |
| US-ZT-01, US-ZT-03 (Layout der Uhr)        | AP 5.9                                                                                                     |
| US-ZT-06 (Soll)                            | AP 3.6                                                                                                     |
| US-EK-01, US-EK-02                         | AP 3.2                                                                                                     |
| US-EK-03                                   | AP 3.5                                                                                                     |
| US-BK-01–05                                | AP 3.3 (Kommandos), AP 3.5 (Oberfläche); Depot eröffnen: AP 5.1 und AP 5.4                                 |
| US-BK-06                                   | AP 3.4                                                                                                     |
| US-BK-07, US-BK-08                         | AP 3.2; Depotgebühr: AP 5.2                                                                                |
| US-BK-10                                   | AP 5.6a                                                                                                    |
| US-MK-01, US-MK-02, US-MK-04               | AP 4.4                                                                                                     |
| US-MK-03                                   | AP 4.5                                                                                                     |
| US-MK-05                                   | AP 4.1 (Feed), AP 4.4 und AP 4.5 (Hervorhebung); Schalter: AP 6.2                                          |
| US-MK-06 (Soll)                            | AP 4.5 (Termine am Instrument), AP 5.7 (Kalender für Depot und Watchlist)                                  |
| US-HD-01–04                                | AP 5.1 (Engine), AP 5.4 (Oberfläche)                                                                       |
| US-HD-05                                   | AP 5.6b                                                                                                    |
| US-PF-01, US-PF-04, US-PF-05               | AP 5.7                                                                                                     |
| US-PF-02, US-PF-03, US-PF-06               | AP 5.5; Lots und Erträge in der Engine: AP 5.2                                                             |
| US-PF-07 (Soll)                            | AP 5.7                                                                                                     |
| US-ST-01–03                                | AP 3.2 (Steuerkern, Zinsen), AP 5.3                                                                        |
| US-ST-04                                   | AP 5.5                                                                                                     |
| US-CH-01                                   | AP 4.2; wählbare Auflösung: AP 5.8                                                                         |
| US-CH-02                                   | AP 4.3; Indikatorfarben: AP 5.8                                                                            |
| US-BN-01–03                                | AP 3.6                                                                                                     |
| US-BN-04 (Soll)                            | AP 6.3                                                                                                     |
| US-EX-01, US-EX-02, US-EX-03 (Soll)        | AP 6.1; Speicherstatus: AP 6.3                                                                             |
| US-UI-01, US-UI-09                         | AP 2.6, AP 6.2; Hintergrundmodi: AP 6.7                                                                    |
| US-UI-02 (Soll)                            | AP 6.2                                                                                                     |
| US-UI-03, US-UI-04                         | AP 0.4 und jedes UI-AP; Abschlussprüfung: AP 6.5                                                           |
| US-UI-05 (Soll), US-UI-06 (Soll), US-UI-08 | AP 6.5                                                                                                     |
| US-UI-07 (Soll)                            | AP 6.3                                                                                                     |
| US-UI-10 (Soll)                            | AP 5.7                                                                                                     |
| US-UI-11 (Soll)                            | AP 6.8a, AP 6.8b                                                                                           |

Soll-Punkte innerhalb von Stories, die noch kein AP nennt: Saldoverlauf als Chart (US-BK-06) und die Aufteilung des Vermögensverlaufs in Bargeld und Wertpapiere (US-PF-04). Sie werden zugeordnet oder bewusst auf nach 1.0 verschoben, sobald M4 steht.

## 6. Spätere Ausbaustufen

Die Reihenfolge ab M7 ist ein Vorschlag und wird nach dem MVP gemeinsam priorisiert. Jeder Meilenstein wird vor dem Start wie M0–M6 in Arbeitspakete zerlegt.

**Wichtig ab Version 1.0:** Neue Marktmechaniken ändern die Welt bestehender Seeds. Sie brauchen eine neue `simVersion`; bestehende Spieler laufen mit ihrer Version weiter (TS §15).

| Meilenstein                         | Stufe | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Stories                                                                |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| M7 – Prüfung des Rechenkerns        | 2     | **AP 7.1 Modellreview durch Fable 5.2** (`claude-fable-5-2`, als Subagent mit `model: fable`) je Bereich: Determinismus-Mathematik (TS §4), Weltgenerierung (§5), Marktmodell und Kalibrierung (§6), Wirtschaftsmodell mit Rundung, Zinsen, Dispo, Steuern, Lots, Sparplänen, Rendite und Benchmark (§7); fachliche Plausibilität mit Nachrechnen, nicht nur Doku gegen Code; Befundliste zur Bewertung durch den Product Owner, Korrekturen in eigenen APs mit neuer `simVersion` (TS §15). **AP 7.2 WASM-Machbarkeit (Spike):** Hotspots profilieren (Tagesschritt, Brücken und Minutenkurse, Stapelbetrieb, Hoch/Tief-Auftrag), Toolchains vergleichen (z. B. Rust mit wasm-bindgen, AssemblyScript), einen Hotspot portieren und mit und ohne CPU-Drosselung messen; Determinismus (Golden-Master-Prüfsummen bitgleich, `detExp`/`detLog` portiert, Selbsttest auf allen Engines), Bundle-Größe, Einbindung in den Worker, CI, Tests und Mutationstests in zwei Sprachen; Ergebnis ist eine Entscheidung in TS §16, wichtig vor allem für N2 | –                                                                      |
| M8 – Zinsen, Inflation, Anleihen    | 2     | Makromodell (Verbraucherpreise, Leitzins, Zinskurve), Inflation bei Kosten und Gehalt, Realwertanzeige, Staats- und Unternehmensanleihen mit Stückzinsen, Renten-ETFs, Tagesgeld am Leitzins, Festgeld und Lockzinsen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | US-MK-10, US-MK-11, US-BK-11                                           |
| M9 – Rohstoffe, Edelmetalle, Fonds  | 2     | Rohstoffe mit Branchenkopplung, ETCs, physische Edelmetalle über das Barvermögen (Händler, Spanne, Spekulationsfrist), aktive Fonds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | US-MK-12, US-MK-13, US-MK-14                                           |
| M10 – Realismus-Ausbau              | 2     | Steuerdetails, Depotübertrag, Trailing-Stop, Kursalarme, Fundamentaldaten und Quartalszahlen, Unternehmensereignisse, Fremdwährungen, Feiertage und Direkthandel, Vergleichschart, weitere Indikatoren, Risikokennzahlen; voraussichtlich in zwei Teile zu schneiden                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | US-ST-10–12, US-BK-12, US-HD-10–11, US-MK-15–18, US-CH-03–04, US-PF-08 |
| M11 – CFDs                          | 3     | CFD-Konto, Long und Short mit Hebel, Margin, Finanzierungskosten, Margin-Call und Zwangsglattstellung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | US-CF-01, US-CF-02                                                     |
| M12 – Regeln und Backtesting        | 3     | Regel-Editor („wenn Bedingung, dann Aktion") ohne `eval`, Auswertung zum Kerzenschluss in der Engine, Ausführungsprotokoll, Backtest auf der Historie mit denselben Indikatorfunktionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | US-RG-01–US-RG-04                                                      |
| M13 – Lebenssimulation              | 4     | Seed-basierte Lebensereignisse, Upgrades, Versicherungen, Karriere und Gehaltsentwicklung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | US-LE-01–US-LE-04                                                      |
| M14 – Newsticker                    | 4     | Nachrichten aus den strukturierten Markt-Ereignissen, Wirtschaftskalender                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | US-NT-01, US-NT-02                                                     |
| M15 – Achievements und Gamification | 4     | Erfolge mit Kategorien und Stufen (z. B. erster Kauf, erste Dividende, Vermögensschwellen, Sparplan über Jahre, Bärenmarkt ohne Verkauf durchgehalten, Sparerpauschbetrag ausgeschöpft), Spielziele und Herausforderungen mit Frist, Freischalten per Toast und Meldung im Newsticker, Übersicht mit Fortschritt; Auswertung deterministisch in der Engine aus Zustand und Journal (nur Codes), Teil des Spielstands und des Exports; Grundlage für Prestige in M16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | US-GA-01–US-GA-03                                                      |
| M16 – Erben und Prestige            | 4     | Nachfolger mit Erbe nach Erbschaftsteuer, Startvorteile, Familienchronik                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | US-ER-01–US-ER-03                                                      |
| N1 – Native App (optional)          | N     | Capacitor, Android zuerst; vorausgeplante lokale Benachrichtigungen über die Ereignisvorschau; iOS bei Bedarf                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | US-NA-01–US-NA-03                                                      |
| N2 – Große Welt (optional)          | N     | Deutlich größere Welt mit mehr Ländern, Börsen, Branchen, Aktien, ETFs und den Assetklassen aus M8/M9 (Größenordnung: einige Tausend bis 10.000 Aktien, Zielgröße wird vor dem Start festgelegt); erweiterter Namensgenerator, genäherte breite Indizes, Tageskerzen und Hoch/Tief bei Bedarf, eigene Budgets für Spielstart, Speicher und Export, Bedienung großer Listen; Umsetzung nach der Checkliste in TS §5.8; zuletzt eingeplant, Entscheidung über den Start nach M16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | US-MK-19, US-MK-20                                                     |

## 7. Änderungsprotokoll

Das Änderungsprotokoll steht seit dem 13.11.2026 in einem eigenen Dokument: [Änderungsprotokoll](./aenderungsprotokoll.md) (neueste Einträge oben).
