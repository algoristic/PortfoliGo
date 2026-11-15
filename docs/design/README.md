# Design-Mockups

Statische HTML-Mockups für den UI-Overhaul in M7, als Vorlage für AP 7.5 (`docs/projektplan.md`). Gewählt ist Variante A „Terminal“. Die übrigen Entwürfe wurden verworfen: B–D sowie die Terminal-Varianten A2–A4.

Die Mockups sind eine Vorlage, kein übernehmbarer Code. Farben stehen als Hex-Werte direkt im Markup, Texte haben keine i18n-IDs, und es gibt keine Logik. In der App gelten weiter die Regeln aus `CLAUDE.md` §3–§5.

## Öffnen

`terminal/index.html` im Browser öffnen, ein Build ist nicht nötig. Die Schriften kommen von Google Fonts. Ohne Netz greift die Systemschrift.

Die Navigation verlinkt die Seiten untereinander. „Märkte“ führt auf die Instrumentseite, weil es keine eigene Märkte-Seite gibt. Steuern, Einstellungen und die „Alle …“-Links haben kein Ziel.

## Seiten

| Seite           | Desktop (1440 px)         | Smartphone (390 × 844 px)    | Inhalt                                                                                                                           |
| --------------- | ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Übersicht       | `uebersicht-desktop.html` | `uebersicht-smartphone.html` | Gesamtvermögen mit Kennzahlen und Verlauf gegen die Benchmark, Depot, Watchlist, Termine, offene Orders, Protokoll               |
| Depot           | `depot-desktop.html`      | `depot-smartphone.html`      | Depotwert, Positionen mit Kauf und Verkauf, Allokation nach Sektor, Region und Klasse, Wertentwicklung, Sparplan                 |
| Konten & Banken | `konten-desktop.html`     | `konten-smartphone.html`     | Bargeld und Dispo, Konten mit Reservierungen, Monatsübersicht, Kontoauszug Girokonto, Daueraufträge, Bankenvergleich             |
| Orders          | `orders-desktop.html`     | `orders-smartphone.html`     | Offene Orders mit Abstand und Reservierung, Historie mit Filter, Orderdetail mit Kosten                                          |
| Instrument      | `instrument-desktop.html` | `instrument-smartphone.html` | Corvan Systems nach PS US-MK-03: Kurskopf, Kerzenchart mit Limitlinie, Order-Ticket, Kennzahlen, Performance, Dividenden, Profil |

Auf dem Smartphone liegen Orders unter „Mehr“ in der unteren Leiste. Im Mockup erreicht man sie über die offene Order auf der Instrumentseite.

## Gestaltung

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

## Offen für AP 7.5

- Entworfen ist nur das dunkle Theme. Das helle Theme und die Farbpaare für Blau/Orange fehlen.
- Die Kontraste sind nicht gemessen. AP 7.5 verlangt ≥ 4,5:1 in beiden Themes.
- Abbildung auf die `--pgo-*`-Tokens in `src/styles.css`.
- Die Mockups wurden nicht im Browser auf Darstellungsfehler geprüft. Die Desktop-Seiten sind auf etwa 1000 px Höhe ausgelegt, das ist geschätzt.

## Spielstand

Alle Seiten zeigen denselben, aufeinander abgestimmten Spielstand: Mo., 20.10.2031, 10:42. Depot, Konten, Orders und Übersicht rechnen sich gegenseitig auf. Die Zahlen stehen in [`spieldaten.md`](spieldaten.md). Namen von Firmen, Banken, Börsen und Indizes sind erfunden.
