# Design-Mockups

> **Archiviert am 19.11.2026:** Der UI-Overhaul wurde gestrichen (E-37 ergänzt, Projektplan §6), die Mockups werden nicht umgesetzt.

Statische HTML-Mockups für den UI-Overhaul in M7, die als Vorlage für AP 7.5 gedacht waren. Gewählt war Entwurf H „Werkbank“ (18.11.2026). H verbindet A und G. A „Terminal“ bleibt die Vorlage für Gestaltung und Navigation und für die Inhalte der Seiten, die H am Desktop nicht zeigt (Übersicht, Konten und Banken, Orders). Die Entwürfe B–D, die Terminal-Varianten A2–A4 sowie E–G sind verworfen; G bleibt nur als Herkunft der Arbeitsfläche von H im Ordner.

| Variante     | Ordner      | Vorbild für die Struktur | Vorbild für die Domäneninhalte | Status                     |
| ------------ | ----------- | ------------------------ | ------------------------------ | -------------------------- |
| A „Terminal“ | `terminal/` | eigenes Trading-Terminal | eigenes Trading-Terminal       | Grundlage von H            |
| E „Editor“   | `editor/`   | VS Code                  | VS Code                        | verworfen                  |
| F „Charting“ | `charting/` | TradingView              | TradingView                    | verworfen                  |
| G „Hybrid“   | `hybrid/`   | VS Code                  | TradingView                    | verworfen, Grundlage von H |
| H „Werkbank“ | `werkbank/` | G, Navigation aus A      | G, Gestaltung aus A            | gewählt                    |

Die Mockups sind eine Vorlage, kein übernehmbarer Code. Farben stehen als Hex-Werte direkt im Markup und Texte haben keine i18n-IDs. In der App gelten weiter die Regeln aus `CLAUDE.md` §3–§5.

## Öffnen

`index.html` im Browser öffnen, sie verlinkt alle Varianten. Ein Build ist nicht nötig. Die Schriften kommen von Google Fonts. Ohne Netz greift die Systemschrift.

## Variante A „Terminal“ (Grundlage von H)

Der Einstieg ist `terminal/index.html`. Die Navigation verlinkt die Seiten untereinander. „Märkte“ führt auf die Instrumentseite, weil es keine eigene Märkte-Seite gibt. Steuern, Einstellungen und die „Alle …“-Links haben kein Ziel. A enthält keine Logik.

### Seiten

| Seite           | Desktop (1440 px)         | Smartphone (390 × 844 px)    | Inhalt                                                                                                                           |
| --------------- | ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Übersicht       | `uebersicht-desktop.html` | `uebersicht-smartphone.html` | Gesamtvermögen mit Kennzahlen und Verlauf gegen die Benchmark, Depot, Watchlist, Termine, offene Orders, Protokoll               |
| Depot           | `depot-desktop.html`      | `depot-smartphone.html`      | Depotwert, Positionen mit Kauf und Verkauf, Allokation nach Sektor, Region und Klasse, Wertentwicklung, Sparplan                 |
| Konten & Banken | `konten-desktop.html`     | `konten-smartphone.html`     | Bargeld und Dispo, Konten mit Reservierungen, Monatsübersicht, Kontoauszug Girokonto, Daueraufträge, Bankenvergleich             |
| Orders          | `orders-desktop.html`     | `orders-smartphone.html`     | Offene Orders mit Abstand und Reservierung, Historie mit Filter, Orderdetail mit Kosten                                          |
| Instrument      | `instrument-desktop.html` | `instrument-smartphone.html` | Corvan Systems nach PS US-MK-03: Kurskopf, Kerzenchart mit Limitlinie, Order-Ticket, Kennzahlen, Performance, Dividenden, Profil |

Auf dem Smartphone liegen Orders unter „Mehr“ in der unteren Leiste. Im Mockup erreicht man sie über die offene Order auf der Instrumentseite.

### Gestaltung

- **Dichte:** Trading-first. Haarlinien mit 1 px Abstand statt Kacheln, keine Rundungen.
- **Schrift:** IBM Plex Sans für Text, IBM Plex Mono für Ziffern, Kürzel und Überschriften. Ziffern sind tabellarisch.
- **Shell (Desktop):**
  - Icon-Leiste links statt breiter Seitennavigation.
  - Index-Ticker unter der Kopfzeile.
  - Statusleiste unten mit Börsenstatus und Speicherstand.
- **Shell (Smartphone):** Untere Leiste mit Übersicht, Märkte, Depot, Konten und Mehr.
- **Seiten:** Kennzahlenleiste oben, darunter Tabellen und Detailpanels im selben Raster.
- **Farben (Hex im Mockup):**

  | Rolle         | Wert                 |
  | ------------- | -------------------- |
  | Hintergrund   | `#0b0d10`            |
  | Panel         | `#121519`            |
  | Linien        | `#262b33`, `#1f242b` |
  | Text          | `#e9ecef`            |
  | Text gedämpft | `#9aa3ad`            |
  | Gewinn        | `#33d17a`            |
  | Verlust       | `#ff6b6b`            |
  | Akzent        | `#f2a93b`            |

- **Regeln:**
  - Der Akzent markiert nur Auswahl und Aktionen.
  - Grün und Rot stehen nur für Gewinn und Verlust.
  - Jede Aktion mit Kosten zeigt diese vorher (PS §10.1).

### Offen für AP 7.5

- Entworfen ist nur das dunkle Theme. Das helle Theme und die Farbpaare für Blau/Orange fehlen.
- Die Kontraste sind nicht gemessen. AP 7.5 verlangt ≥ 4,5:1 in beiden Themes.
- Abbildung auf die `--pgo-*`-Tokens in `src/styles.css`.
- Die Mockups wurden nicht im Browser auf Darstellungsfehler geprüft. Die Desktop-Seiten sind auf etwa 1000 px Höhe ausgelegt, das ist geschätzt.

## Entwürfe E–G (verworfen)

Jede Variante hat dieselben drei Dateien. Die Desktop-Seiten füllen das Browserfenster wie eine Anwendung und scrollen nur in den einzelnen Bereichen. Sie sind auf 1440 × 900 px ausgelegt und funktionieren ab 1280 × 800 px. Die Smartphone-Datei zeigt drei Bildschirme mit je 390 × 844 px, auf breiten Fenstern nebeneinander, auf dem Telefon untereinander.

| Datei                     | E „Editor“                                  | F „Charting“                              | G „Hybrid“                                                          |
| ------------------------- | ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `instrument-desktop.html` | Corvan Systems als Detailseite im Editor    | Kerzenchart von Corvan Systems mit Handel | Kerzenchart von Corvan Systems im Editor, Order in der Seitenleiste |
| `depot-desktop.html`      | Depot als Dokument, Befehlspalette geöffnet | Depot-Rendite gegen Benchmark, Positionen | Geteilter Editor: Depot-Rendite und Chart von Halvion AG            |
| `smartphone.html`         | Instrument, Depot, Explorer                 | Watchlist, Chart, Depot                   | Instrument, Depot, Seitenleiste Watchlist                           |

Bedienbar sind die Links zwischen den Seiten und das Fadenkreuz der Charts (Maus, nach Fokus auch Pfeiltasten), das die Legende mitführt. In `editor/depot-desktop.html` schließt `Esc` die Befehlspalette, `Strg K` schaltet sie um. Alle anderen Bedienelemente sind ohne Funktion.

### Abbildung der Struktur

| Fachliches Element     | E „Editor“ und G „Hybrid“ (VS Code)                    | F „Charting“ (TradingView)                                 |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Hauptbereiche          | Activity Bar links                                     | Symbolleiste rechts außen                                  |
| Spielzeit              | Zeitsteuerung in der Titelleiste, wie die Debug-Leiste | Uhr in der Kopfzeile, schwebende Steuerung wie beim Replay |
| Suche und Befehle      | Command Center und Befehlspalette                      | Symbolsuche in der Kopfzeile                               |
| Geöffnete Inhalte      | Editor-Tabs, in G auch geteilte Editorgruppen          | ein Chart je Ansicht                                       |
| Portfolio, Watchlist   | Primary Sidebar                                        | Widget-Spalte rechts                                       |
| Order-Ticket, Details  | Secondary Sidebar                                      | Widget-Spalte rechts                                       |
| Positionen, Orders     | Panel (E: Hinweise, Protokoll; G: Handelstabellen)     | Handelspanel unter dem Chart                               |
| Börsenstatus, Speicher | Status Bar                                             | Zeitraumleiste und Kopfzeile                               |
| Zeichenwerkzeuge       | G: schmale Leiste am Chart; E: keine                   | Leiste links                                               |

### Darstellung der Domäneninhalte

- **E „Editor“:** Das Instrument folgt dem Aufbau einer Erweiterungsseite: Kopf mit Aktionen, Reiter, Inhalt und Metadatenspalte. Der Kurs ist eine ruhige Linie. Das Depot ist ein Dokument mit Zeilennummern, Faltung, Minimap und CodeLens für Kauf und Verkauf. Der Gutter zeigt Gewinn und Verlust, die Klumpenwarnung ist eine Editor-Warnung und steht zusätzlich unter „Hinweise“.
- **F „Charting“ und G „Hybrid“:** Kerzen mit OHLC-Legende, Preisachse mit Marken, Orderlinie im Chart, Kauf- und Verkaufsknöpfe mit Geld und Brief, Watchlist-Spalten, Performance-Kacheln und Handelstabellen. G zeigt zusätzlich Kaufmarken und die Einstandslinie im Chart von Halvion AG.

### Gestaltung

| Rolle          | E „Editor“ | F „Charting“ und G „Hybrid“ |
| -------------- | ---------- | --------------------------- |
| Hintergrund    | `#1f1f1f`  | `#131722`                   |
| Seitenleisten  | `#181818`  | F `#131722`, G `#171b26`    |
| Linien         | `#2b2b2b`  | `#2a2e39`, G `#262a35`      |
| Text           | `#d6d6d6`  | `#e1e4ea`                   |
| Text gedämpft  | `#a0a0a0`  | `#8f94a1`                   |
| Gewinn (Text)  | `#89d185`  | `#22ab94`                   |
| Verlust (Text) | `#f48771`  | `#f7626e`                   |
| Kerze steigend | –          | `#089981`                   |
| Kerze fallend  | –          | `#f23645`                   |
| Akzent         | `#0078d4`  | `#2962ff`                   |

- **Schrift:** Inter für die Oberfläche, in E zusätzlich JetBrains Mono für Dokument und Protokoll. Ziffern in Tabellen sind tabellarisch.
- **Icons:** `bootstrap-icons` wie in der App, als Inline-SVG. Logos, Namen und Original-Icons von VS Code und TradingView werden nicht verwendet.
- **Regeln:** Grün und Rot stehen nur für Gewinn und Verlust. Das Order-Ticket zeigt Kosten und Restguthaben vor der Aktion (PS §10.1).

### Über die Spezifikation hinaus

Diese Elemente gehören zum Vorbild, sind aber in der Produktspezifikation nicht oder erst später vorgesehen. Vor einer Übernahme wäre das zu entscheiden.

- Zeichenwerkzeuge (F, G) und die Reiter „Konsole“ und „Hinweise“ (E) sind nicht spezifiziert.
- RSI und Handelsvolumen (US-CH-04) sowie Kursalarme (US-HD-11) sind erst für M10 geplant.

### Geprüft und offen

- **Geprüft in Chrome:** alle neun Seiten bei 1440 × 900 und 1280 × 800 px beziehungsweise 390 × 844 und 1300 × 920 px, ohne Skriptfehler, fehlende Icons, tote Links und ungewollte Seiten-Scrollbalken. Das Fadenkreuz und die Befehlspalette wurden ausgelöst.
- **Kontrast gemessen:** Die Haupttextfarben und Chart-Marken erreichen auf ihren Flächen mindestens 4,5:1. Nicht jede einzelne Kombination wurde gemessen.
- **Nicht geprüft:** Firefox, Safari und echte Geräte.
- **Offen:** Es gibt nur ein dunkles Theme, keine Farbpaare für Blau/Orange und keine Abbildung auf die `--pgo-*`-Tokens. Märkte, Konten, Orders und Steuern haben in E–G keine eigene Seite. Ihre Einträge in der Navigation haben kein Ziel, nur „Märkte“ führt in E auf die Instrumentseite.

## Entwurf H „Werkbank“ (gewählt)

H wird so umgesetzt, wie die drei Dateien ihn zeigen. H verbindet A und G: Der Desktop behält die Arbeitsfläche von G, Erscheinungsbild und Navigation kommen aus A. Die Mobilansicht ist neu entworfen und übernimmt nicht die Struktur des Desktops.

| Datei                     | Inhalt                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `instrument-desktop.html` | Corvan Systems: Kurskopf und Kerzenchart im Editor, Order und Details in der rechten Leiste       |
| `depot-desktop.html`      | Depot-Rendite im Editor, links Portfolio, rechts Allokation                                       |
| `smartphone.html`         | Übersicht, Märkte, Instrument, Order, Depot, Konten, Mehr, Orders, Spielzeit als neun Bildschirme |

### Was woher kommt

| Element                                                                      | Herkunft |
| ---------------------------------------------------------------------------- | -------- |
| Farben, IBM Plex Sans und Mono, Haarlinien, keine Rundungen                  | A        |
| Bereiche mit Beschriftung: Übersicht, Märkte, Depot, Konten, Orders, Steuern | A        |
| Große Spielzeit in der Kopfzeile, Index-Ticker, Börsenstatus in der Fußzeile | A        |
| Kurskopf, Order-Ticket mit Kosten, untere Leiste auf dem Smartphone          | A        |
| Seitenleisten, Editor-Tabs, Panel, Befehlssuche                              | G        |
| Kerzenchart mit OHLC-Legende, Preisachsen-Marken, Orderlinie, Kaufmarken     | G        |
| Handelstabellen im Panel                                                     | G        |

Bewusst weggelassen: der geteilte Editor, die Zeichenwerkzeuge und die Schnellhandel-Knöpfe im Chart. Der Editor zeigt immer nur einen Inhalt, weitere stehen als Tabs bereit. Die Zeichenwerkzeuge sind nicht spezifiziert. Geld und Brief stehen schon im Kurskopf, und der Kauf läuft über das Ticket mit Kostenanzeige.

### Mobilansicht

Ziel ist eine Aufgabe je Bildschirm. Gegenüber G ändert sich:

- **Eine Kopfzeile statt vier Leisten.** Titel, Uhrzeit, Pause und Meldungen stehen in einer Zeile. Editor-Tabs, Zeitleiste, Statusleiste und Ticker entfallen.
- **Die Arbeitsfläche wird aufgelöst.**

  | Desktop              | Smartphone                                       |
  | -------------------- | ------------------------------------------------ |
  | Bereichsleiste       | untere Leiste mit vier Bereichen und „Mehr“      |
  | Primäre Seitenleiste | eigener Bildschirm „Märkte“                      |
  | Editor               | Inhalt des Bildschirms                           |
  | Sekundäre Leiste     | Order als Sheet, Details als aufklappbare Zeilen |
  | Panel                | Reiter im Depot, eigener Bildschirm „Orders“     |
  | Statusleiste         | Börsenstatus in „Märkte“, „Mehr“ und „Spielzeit“ |
  | Zeitsteuerung        | Sheet hinter der Uhr, Pause bleibt sichtbar      |

- **Klare Rangfolge auf der Instrumentseite:** Kurs, Chart, offene Order, sechs Kennzahlen, dann Kaufen und Verkaufen. OHLC-Werte erscheinen erst beim Berühren des Charts. Auf dem Smartphone entfallen Volumen und EMA.
- **Bedienbarkeit:** Alle Bedienelemente sind mindestens 44 px hoch. Ausgefülltes Orange trägt nur die Hauptaktion.

### Bedienbar im Mockup

- **Desktop:** Seitenleisten und Panel ein- und ausblenden, Panel-Reiter, Zeitraum 1M, 6M und 1J, Volumen, aufklappbare Abschnitte, Pause, Geschwindigkeit, Fadenkreuz.
- **Smartphone:** Navigation zwischen allen Bildschirmen, Reiter, Zeitraum 1M, 6M und 1J (1J mit Wochenkerzen), Order-Sheet, Spielzeit-Sheet, aufklappbare Details, Fadenkreuz per Ziehen. Auf breiten Fenstern stehen alle Bildschirme nebeneinander, unter 440 px läuft die Datei wie eine App.
- **Order-Ticket:** Die Stückzahl rechnet Kosten und Restguthaben neu. Ab 6 Stück reicht das Guthaben nicht, die Aktion wird gesperrt.
- **Ohne Funktion:** Ordertypen, Suche, Darstellungsart des Charts, die übrigen Zeiträume und alle Aktionen, die den Spielstand ändern würden.

### Farben der Chart-Reihen

Kerzen und Gewinn/Verlust nutzen `#33d17a` und `#ff6b6b` aus A. Der Akzent `#f2a93b` bleibt Auswahl, Aktionen und Orderlinie vorbehalten. Für Reihen kommen deshalb `#4a86ff` (SMA 20, Depot) und `#c653b8` (EMA 50, Benchmark) dazu. Das Paar besteht die Palettenprüfung auf `#0b0d10`, auch für Farbfehlsichtigkeit.

### Geprüft und offen

- **Geprüft in Chrome:** Desktop bei 1280 × 800, 1440 × 900 und 1920 × 1080 px, auch mit ausgeblendeten Bereichen. Smartphone mit Touch-Emulation bei 360 × 640, 390 × 844 und 430 × 932 px. Keine Skriptfehler, tote Links, ungewollten Seiten-Scrollbalken oder abgeschnittenen Leisten.
- **Kontrast gemessen:** Text und Chart-Marken erreichen auf ihren Flächen mindestens 4,5:1.
- **Nicht geprüft:** Firefox, Safari und echte Geräte.
- **Offen:** Querformat und Tablet sind nicht entworfen, unter 1240 px Breite scrollt der Desktop. Es gibt nur ein dunkles Theme. Übersicht, Konten, Orders und Steuern haben am Desktop keine eigene Seite. Für Volumen im Chart gilt derselbe Vorbehalt wie bei E–G (US-CH-04, M10).

## Spielstand

Alle Seiten zeigen denselben, aufeinander abgestimmten Spielstand: Mo., 20.10.2031, 10:42. Depot, Konten, Orders und Übersicht rechnen sich gegenseitig auf. Die Zahlen stehen in [`spieldaten.md`](spieldaten.md). Namen von Firmen, Banken, Börsen und Indizes sind erfunden.
