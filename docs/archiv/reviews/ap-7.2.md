# AP 7.2 – WASM-Machbarkeit: Gegenüberstellung und gemeinsame Einschätzung

> Geprüfter Stand: `c1e2514` (Rechenkern; beide Läufe auf `099601b`, Rechenkern unverändert) · Läufe: Opus 5.5 (`effort: high`), Fable 5.2 (`effort: medium`) · Gegenüberstellung: 15.11.2026
> Rohberichte: [Lauf Opus](./ap-7.2/lauf-opus.md) · [Lauf Fable](./ap-7.2/lauf-fable.md)

Arbeitsordner der Gegenüberstellung (Skripte, Shims, Rohdaten): `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/wasm/synthese/` (im Folgenden `Y/`). Alle Messungen laufen auf dem Entwicklungsrechner ohne andere Last, mit Node 22.22.3 und Rust 1.100.0.

## Ergebnis

WebAssembly ist für den Rechenkern machbar und bitgleich. Beide Läufe belegen das für die Minutenkurse. Die Nachprüfung belegt es zusätzlich für alle sechs Golden-Master-Prüfsummen: Stromerzeugung und `detExp`/`detLog` laufen dabei in WASM. Der Gewinn ist ein konstanter Faktor, rund 2,2–2,8 auf den Kurven-Kern und 1,6 auf den Tagesschritt. In der Standardwelt hängt kein Budget allein an WASM. Einzige Ausnahme ist „Import bis spielbar“ im Browser (3,48 s gegen 3 s, vom PO schon als Abweichung geführt): Mit WASM für die Stromerzeugung fiele er nach Hochrechnung auf rund 2,4 s. Das ist ein einmaliger Vorgang, die Überschreitung beträgt 0,5 s, und WASM verschiebt die Grenze nur von rund 40 auf rund 70 Spieljahre. Für N2 entscheidet die Bedarfsrechnung aus TS §5.8, nicht die Sprache. **Empfehlung:** keine Portierung in Stufe 2; neu prüfen beim Start von N2 mit festgelegter Weltgröße und nach der Bedarfsrechnung (Vorschlag E-41 unten). Die Schwelle des PO („deutlich spürbar“) erreicht WASM heute nicht.

## Gegenüberstellung

### Hotspots

| Punkt                                 | Lauf Opus                                                                                                         | Lauf Fable                                                         | Verhältnis                    | Abwägung                                                                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kurven-Kern (Brücken, Minutenkurse)   | 9,3 ms je Tag für 274 Serien, 95–97 % Rechenarbeit; `#sessionPrefix`, `normal`, `detLog`, `#indicativeInstrument` | 9,4 ms je Tag, rund 95 %; dieselben Funktionen                     | übereinstimmend               | gut abgrenzbar, reine Rechenarbeit auf Typed Arrays                                                                                                                                                               |
| Tagesschritt: Anteil portierbar       | rund 90 % Rechenarbeit                                                                                            | rund 50–65 % (Hash, sfc32, Normalverteilung, Logarithmus)          | Widerspruch in der Abgrenzung | Opus zählt die Modelllogik mit, Fable nur die Primitive. Nachgemessen: Primitive 63 % des Historienlaufs; mit WASM für diese Primitive 1,64-mal schneller (unten). Fables Abgrenzung trifft den portierbaren Teil |
| Stapelbetrieb mit Orders              | mit 20 Aktienorders gut ein Drittel Verwaltung                                                                    | „überwiegend Kurven“; mit ETF-Orders rund 70 % Rechenarbeit        | übereinstimmend, Opus genauer | Orderprüfung je Tick (`priceAt`, Caches) ist nicht portierbar                                                                                                                                                     |
| Hoch/Tief, Live, Vorlauf (Zeiten, JS) | Hoch/Tief 9,7 ms je Tag, Live-Jahr 3,22 s (6,2 %), Vorlauf 332 ms                                                 | Hoch/Tief 9,9 ms je Tag, Live-Jahr 3,216 s (6,2 %), Vorlauf 337 ms | übereinstimmend               | Werte liegen unter denen von TS §14.3 (13 ms je Tag), der Rechner misst heute schneller                                                                                                                           |
| Verwaltung im Worker                  | nicht profiliert, J10 rund 4 %                                                                                    | nicht profiliert, J10 rund 4 %                                     | übereinstimmend               | nicht portierbar, mit WASM eher mehr Grenzübergänge                                                                                                                                                               |

### Faktoren in Node und mit Drosselung

| Punkt                      | Lauf Opus                                                    | Lauf Fable                                 | Verhältnis              | Abwägung                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Umfang des Prototyps       | alle 274 Serien (Aktien, Indizes, Performance-Indizes, ETFs) | nur die 200 Aktien samt Faktorbrücken      | verschieden             | Opus' Port ist vollständiger; die Faktoren sind deshalb nicht exakt vergleichbar                                                                                              |
| Node                       | Rust 2,16×, AS 2,25×                                         | Rust 2,2–2,3×, AS 2,5×                     | übereinstimmend         | nachgemessen: Rust 2,15×, AS 2,23× (Opus-Prototyp); Rust 2,31×, AS 2,56× (Fable-Prototyp)                                                                                     |
| Chromium ungedrosselt / 4× | Rust 2,48× / 2,57×, AS 2,74× / 2,81×                         | Rust 2,8× / 2,9×, AS 3,3–3,4× / 3,45×      | abweichend um rund 15 % | Das JS-Original ist in Fables Messung in Chromium 1,5-mal langsamer als in Node, bei Opus 1,17-mal; der WASM-Teil ist in beiden gleich schnell. Nicht im Browser nachgemessen |
| Grenzkosten                | rund 1 µs je Tag hinein, Kurven heraus 0,05–0,6 ms           | unter 2 % der Rechenzeit, Aufruf rund 5 ns | übereinstimmend         | vernachlässigbar für einen Aufruf je Tag, auch feinkörnig tragbar (nachgemessen unten)                                                                                        |
| Rust gegen AS              | AS etwas schneller (`normal` 11 gegen 20 ns)                 | AS 10–17 % schneller                       | übereinstimmend         | Ursache bei Rust: Bounds-Checks, kein `get_unchecked`; kein Unterschied von Belang                                                                                            |

### Bitgleichheit

| Punkt             | Lauf Opus                                                            | Lauf Fable                                                                    | Verhältnis      | Abwägung                                                                                             |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Minutenkurse      | 0 Abweichungen in 37,75 Mio. Werten, Node, Chromium 158, Firefox 159 | 0 Abweichungen in 22,1 Mio. Werten, ebenso                                    | übereinstimmend | nachgemessen in Node: beide 0 Abweichungen                                                           |
| `detExp`/`detLog` | 0 in 400.000 Eingaben                                                | 0 in 8.000.022 Eingaben (Zufallsbits, Randfälle)                              | übereinstimmend | Fables Stichprobe ist deutlich breiter                                                               |
| Golden Master     | Prüfsumme `minutes` aus WASM reproduziert                            | nicht über WASM gerechnet                                                     | nur Opus        | nachgemessen: alle sechs Prüfsummen gleich, mit Stromerzeugung und `detExp`/`detLog` in WASM (unten) |
| Fallstricke       | NaN-Bitmuster, Relaxed SIMD, libm statt fdlibm                       | dazu `f64::max` gegen `Math.max` bei NaN, `0 + 1 · x`, Reihenfolge der Summen | ergänzend       | beide Listen zusammen sind die Checkliste für einen Port                                             |
| WebKit, iOS       | nicht geprüft                                                        | nicht geprüft                                                                 | übereinstimmend | offene Lücke, Bedingung jeder späteren Portierung                                                    |

### Größe

| Punkt            | Lauf Opus                                | Lauf Fable                  | Verhältnis          | Abwägung                                                                                        |
| ---------------- | ---------------------------------------- | --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| Rust             | 49,5 kB roh, 20,5 kB gzip (`z`: 16,5 kB) | 27,5 kB roh, 11,6 kB gzip   | abweichend, erklärt | nachgebaut, bitgleiche Dateien; Unterschied aus dem Umfang (1.029 gegen 509 Zeilen)             |
| AssemblyScript   | 11,0 kB roh, 5,0 kB gzip                 | 5,5 kB roh, 2,8 kB gzip     | abweichend, erklärt | ebenso                                                                                          |
| Initiales Bundle | zählt nicht; Stand 191,5 kB              | zählt nicht; Stand 225,9 kB | Stand abweichend    | Fable hat den aktuellen Stand (TS §14.3, nach AP 6.8a). Das Modul gehört zum Worker; unkritisch |

### N2

| Punkt                                     | Lauf Opus                                  | Lauf Fable                          | Verhältnis                       | Abwägung                                                                                                             |
| ----------------------------------------- | ------------------------------------------ | ----------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Methode                                   | Standardwelt synthetisch auf 10.000 Aktien | lineare Hochrechnung aus 200 Aktien | verschieden                      | Opus misst, Fable rechnet die festen Faktorbrücken je Aktie mit hoch                                                 |
| Kurven aller Aktien je Tag                | 244 ms JS, 110 ms Rust                     | 310–360 ms JS, 125–155 ms WASM      | abweichend                       | nachgemessen: 21,9 µs je Aktie und Tag, also 219 ms + 2,1 ms Faktoren; Fable liegt rund 50 % zu hoch                 |
| 1 w/s ohne Bedarfsrechnung                | 124 % JS, 55 % WASM                        | 155–180 % JS, 62–78 % WASM          | Urteil gleich, Zahlen abweichend | nachgerechnet rund 116 % JS und 54 % WASM; Budget 15 % in beiden Fällen gerissen                                     |
| 1 w/s mit Bedarfsrechnung                 | „Faktor rund 200“, ohne Zahl               | rund 0,9 % plus Faktorbrücken       | übereinstimmend, beide zu grob   | nachgerechnet rund 6,3 % ohne exakte Indizes; die Leit- und Sektorindizes, die §5.8 exakt lässt, entscheiden (unten) |
| Vorlauf 10 Jahre (Tagesschritte)          | 11,4 s JS, geschätzt 4–5 s WASM            | rund 15 s JS, geschätzt 8–9 s       | abweichend                       | nachgemessen 8,9 s JS und 5,1 s mit WASM-Primitiven; beide Läufe zu hoch, Budget 2 s in beiden Fällen gerissen       |
| Hoch/Tief des Vorlaufs                    | 11 min JS, 5 min WASM                      | 13,5–15,7 min JS, 5,4–6,8 min WASM  | Urteil gleich                    | nachgerechnet rund 10 min und 4,7 min Rechenzeit                                                                     |
| Spielstart und Import mit Bedarfsrechnung | nicht beziffert                            | nicht beziffert                     | Lücke in beiden                  | nachgerechnet (unten)                                                                                                |

### Alternativen

| Punkt                          | Lauf Opus                                                | Lauf Fable                                         | Verhältnis                   | Abwägung                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Bedarfsrechnung (§5.8)         | der Hebel für N2                                         | der Hebel für N2                                   | übereinstimmend              | bestätigt, aber mit festen Kosten für Faktoren und exakte Indizes                                                                            |
| Mehrere Worker                 | 1,9× (2), 3,3× (4) für Hoch/Tief nach Tagen              | 1,7× (2), 2,2× (4, streut), 4,2× (8) nach Aktien   | übereinstimmend in der Größe | nachgemessen: Opus 1,85× / 3,0× / 3,6× (2/4/8), Fable 1,73× / 2,76× / 4,4×; mit vier Workern so viel wie WASM, ohne zweite Sprache           |
| JS umstrukturieren             | Typed Arrays statt `DataView` in `det-math`: kein Gewinn | flaches JS: 0,9–1,06×                              | übereinstimmend              | zusätzlich nachgemessen: `StreamFamily.create` ohne Zuweisungen in JS bringt 1,6 % (unten); der WASM-Vorteil ist kein Strukturproblem von JS |
| Anderes Verfahren für `normal` | größter Hebel, neue `SIM_VERSION`                        | ebenso                                             | übereinstimmend              | Modelländerung, nur mit einer ohnehin fälligen neuen `SIM_VERSION`                                                                           |
| SIMD                           | nicht gemessen, rund 10 % Anteil                         | nicht gemessen, höchstens Faktor 2 auf ein Drittel | übereinstimmend              | kein eigener Weg                                                                                                                             |

### Empfehlung

| Punkt                | Lauf Opus                                                                                                         | Lauf Fable                                                                                                                     | Verhältnis                        | Abwägung                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jetzt                | keine Portierung                                                                                                  | keine Portierung                                                                                                               | übereinstimmend                   | bestätigt                                                                                                                                                                                      |
| Budgets Standardwelt | „alle halten ohne WASM“                                                                                           | alle halten, gerissen nur „Import bis spielbar“ im Browser                                                                     | Widerspruch                       | Fable trifft TS §14.3 genauer; dort sind zwei Budgets gerissen (unten)                                                                                                                         |
| Schwelle für N2      | (a) Budget um mehr als 30 %, höchstens Faktor 2,5 gerissen, (b) ≥ 70 % abgrenzbare Rechenkerne, (c) Modell stabil | (1) Budget um mehr als Faktor 1,5 gerissen, Kern ≥ 60 %, (2) Selbsttest bitgleich inkl. WebKit und iOS, (3) Modell eingefroren | ähnlich, beide rechnerisch falsch | Nach Amdahl hält WASM bei 70 % Anteil und Faktor 2,2–2,8 höchstens eine Überschreitung um 1,6–1,8; Fables Schwelle schließt jeden haltbaren Fall aus, Opus' Obergrenze 2,5 ist zu hoch (unten) |
| Toolchain            | Rust `extern "C"` (Reife, `cargo test`, `cargo-mutants`)                                                          | AssemblyScript für einen kleinen Zahlen-Kern, Rust für mehr                                                                    | Widerspruch                       | beide schnell genug; Rust für die Dauer (stabil, Testwerkzeuge), AS nur ohne neue Werkzeugkette in der CI. Festlegung im Port-AP                                                               |
| Erste Maßnahmen      | Bedarfsrechnung, eigener Worker für Hoch/Tief, dann WASM                                                          | Bedarfsrechnung; beim Vorlauf Faktorhistorie vorziehen, Marktzustand je Seed                                                   | ergänzend                         | beide Reihenfolgen übernommen                                                                                                                                                                  |

## Nachgeprüft

### 1. Faktoren und Bitgleichheit in Node

Beide Prototypen habe ich unverändert neu gebaut (`Y/rust-opus`, `Y/rust-fable`, `cargo build --release --offline`). Die `.wasm`-Dateien sind byte-gleich mit denen der Läufe. Beide Node-Benchmarks liefen erneut (`Y/opus-node-rerun.txt`, `Y/fable-node-rerun.txt`):

| Prototyp                                   | JS       | Rust            | AS              | Bitgleich                                     |
| ------------------------------------------ | -------- | --------------- | --------------- | --------------------------------------------- |
| Opus, Hoch/Tief aller 274 Serien je Tag    | 9,46 ms  | 4,40 ms (2,15×) | 4,22 ms (2,23×) | 0 in 37,75 Mio.; `minutes` = Golden Master    |
| Fable, 200 Aktien samt Hoch/Tief, ein Jahr | 1.644 ms | 711 ms (2,31×)  | 642 ms (2,56×)  | 0 in 22,1 Mio.; `detExp`/`detLog` 0 in 8 Mio. |

**Folgerung:** Die Faktoren der Läufe sind reproduzierbar. Die Chromium-Werte habe ich nicht nachgemessen (der Rahmen schließt Playwright aus). Die Abweichung zwischen den Läufen erklärt sich aus dem Umfang der Ports.

### 2. Golden Master und Tagesschritt mit WASM-Primitiven

Beide Läufe haben den Tagesschritt nicht portiert und seinen Gewinn nur geschätzt. Ich habe ihn als Hybrid gemessen:

- **Aufbau:** Ein drittes Rust-Modul (`Y/rust-hybrid`, 21 kB) übernimmt MurmurHash3, sfc32 und `detExp`/`detLog` wörtlich aus dem Opus-Port. Es exportiert feinkörnig `create(prefix, n, suffix)`, also den Startzustand eines Stroms nach den 12 verworfenen Ausgaben, sowie `log_one` und `exp_one`.
- **Einbindung:** Ein esbuild-Plugin (`Y/build-hybrid.mjs`) ersetzt beim Bündeln `det-math` und `StreamFamily` durch Shims (`Y/shim/`). Der übrige Repo-Code bleibt unverändert, auch `normal` und der ganze Tagesschritt.
- **Golden Master:** Mit dem Hybrid sind **alle sechs Prüfsummen** von `computeGoldenChecksums` gleich `GOLDEN_CHECKSUMS` (Welt, Kurse, Minuten, Indizes, ETFs, Spielstart; `Y/golden.ts`).

Historienlauf des Imports (Epoche bis 03.04.2080 wie in `player-import.perf.spec.ts`, `Y/import-run.ts`, Median aus 5 Läufen, Marktprüfsumme am Ende jeweils gleich `7066a06a…`):

| Variante                                                  | Zeit     | Faktor |
| --------------------------------------------------------- | -------- | ------ |
| JS (Repo)                                                 | 1.745 ms | –      |
| JS, `StreamFamily.create` ohne Zuweisungen (`Y/shim-js/`) | 1.718 ms | 1,02   |
| WASM nur `detExp`/`detLog`                                | 1.557 ms | 1,12   |
| WASM nur Stromerzeugung                                   | 1.249 ms | 1,40   |
| WASM Stromerzeugung und `detExp`/`detLog`                 | 1.066 ms | 1,64   |

Profil des JS-Laufs (`Y/import-profile.txt`, Selbstzeit): `create` 21 %, `normal` 17 %, `detLog` 12 %, `digest` 9 %, `idioTargetAt` 7 %, `stepInstrument` 6 %, `stepFactors` 6 %, `stepIndices` 5 %, GC 4 %.

**Folgerung:** Der Tagesschritt gewinnt mit einem schmalen Port der Primitive den Faktor 1,6. Dieser Code ist seit E-03 stabil und ändert sich mit M8–M10 nicht. Das Vorgehen über Shims belegt Bitgleichheit über den ganzen Golden Master. Eine Optimierung in reinem JS bringt nichts.

### 3. N2: Last bei 1 w/s, Spielstart und Vorlauf

**Methode:** `Y/n2-check.ts` mit der Welt wie im Opus-Lauf (Unternehmen vervielfacht, 49 Faktoren, Indizes und ETFs unverändert), JS und Hybrid. Gemessen sind der ganze Vorlauf von 2.673 Markttagen sowie je Markttag die ganztägigen Faktorkurven und die Aktienkurven (Median über 20 Tage).

| Aktien | Vorlauf JS | Vorlauf Hybrid | Faktorkurven je Tag (49)    | je Aktie und Tag (Kurve) |
| ------ | ---------- | -------------- | --------------------------- | ------------------------ |
| 200    | 0,30 s     | 0,18 s         | 2,10 ms (42,9 µs je Faktor) | 21,4 µs                  |
| 2.000  | 1,90 s     | –              | 2,06 ms                     | 21,8 µs                  |
| 10.000 | 8,94 s     | 5,10 s         | 2,08 ms                     | 21,9 µs (Hybrid 19,0 µs) |

Daraus folgen 0,89 ms Vorlauf je Aktie (Hybrid 0,50 ms) und rund 0,12 s feste Kosten für Faktoren, Indizes und ETFs. 1 w/s entspricht 5,02 Markttagen je Sekunde. Für die echte N2-Welt rechne ich mit 120 Faktoren (TS §3.2), also 5,1 ms Faktorkurven je Tag. Als Verwaltung der Engine setze ich 1,5 % an (Live-Jahr der Standardwelt 6,2 % minus 5,02 × 9,4 ms Kurven).

**Engine bei 1 w/s (Budget 15 %, mobil 50 % nach E-27):**

| Fall                                                    | JS                            | WASM (Kurven-Kern 2,2×, Primitive im Tagesschritt) |
| ------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| alle 10.000 Aktien minutengenau                         | rund 116 % (mobil rund 460 %) | rund 54 % (mobil rund 215 %)                       |
| Bedarfsrechnung: 50 Instrumente, 120 Faktoren ganztägig | rund 6,3 % (mobil rund 25 %)  | rund 3,9 % (mobil rund 16 %)                       |
| je zusätzliche Aktie in exakten Indizes                 | +0,011 %                      | +0,005 %                                           |
| Grenze für Aktien in exakten Indizes: 15 % / mobil 50 % | rund 790 / rund 570           | rund 2.200 / rund 1.700                            |

Ohne Bedarfsrechnung hält die Engine 15 % also nicht, auch nicht mit WASM. Mit Bedarfsrechnung hält sie das Budget ohne WASM, solange die nach §5.8 exakt gerechneten Leit- und Sektorindizes zusammen höchstens rund 600–800 verschiedene Aktien umfassen. Beide Läufe haben nur mit „50 Instrumenten, Faktor 200“ gerechnet und diese festen Anteile übersehen. Nur in einem Fenster zwischen rund 600 und 2.000 exakt gerechneten Aktien wäre WASM ein spürbarer Vorteil. Das ist eine Frage des N2-Zuschnitts, die vor einer Sprachentscheidung zu klären ist.

**Spielstart (Budget 2 s, mobil 6 s) und Vorlauf von 10 Jahren:**

| Fall                                                      | JS                                                                          | mit WASM-Primitiven                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| ohne Bedarfsrechnung: Vorlauf aller 10.000 Aktien         | 8,9 s, mit Welt (rund 0,5 s, §5.8) rund 9,4 s; mobil rund 38 s              | 5,1 s, mit Welt rund 5,6 s; mobil rund 22 s |
| mit Bedarfsrechnung: Welt, Faktorhistorie, 50 Instrumente | rund 0,85 s (Faktoranteil auf 120 Faktoren hochgerechnet); mobil rund 3,4 s | rund 0,75 s                                 |
| je zusätzlich nötige Aktie (z. B. exakte Indizes)         | +0,89 ms; Grenze 2 s bei rund 1.300, mobil 6 s bei rund 700                 | +0,50 ms                                    |
| Hoch/Tief des Vorlaufs, alle Aktien                       | rund 10 min Rechenzeit, mit 10 % Anteil rund 100 min Wanduhr                | rund 4,7 min, rund 47 min                   |
| Hoch/Tief des Vorlaufs, 50 Instrumente                    | rund 17 s Rechenzeit, rund 3 min Wanduhr                                    | rund 1,3 min Wanduhr                        |
| Import, Historienlauf 60 Jahre, alle Aktien               | rund 52 s (Budget 3 s)                                                      | rund 30 s                                   |

Ohne Bedarfsrechnung reißen Spielstart und Import ihr Budget auch mit WASM um ein Vielfaches. Mit Bedarfsrechnung hält der Spielstart ohne WASM. Die Weltgenerierung von rund 0,5 s ist eine Schätzung aus §5.8 und nicht gemessen. Der Import in N2 braucht in jedem Fall eine eigene Lösung (§5.8: Marktzustand je Seed zwischenspeichern, Import-Budget prüfen); kein Lauf hat ihn betrachtet.

**Nebenbefund zur Spezifikation:** §5.8 nennt für Hoch und Tief bei 10.000 Aktien „rund 0,65 s je Handelstag und rund eine halbe Stunde für den Vorlauf“ (linear aus 13 ms). Gemessen sind es rund 0,22 s je Handelstag und rund 10 min Rechenzeit. Das ist eine Doku-Korrektur, die das Urteil nicht ändert.

### 4. „Budgets der Standardwelt halten ohne WASM“ gegen TS §14.3

TS §14.3 (Abnahme AP 6.4) führt zwei Budgets als gerissen, beide mit Vermerk „PO“:

| Budget                                             | Stand §14.3                                                    | Wirkung von WASM                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import bis spielbar < 3 s (50 Spieljahre), Browser | 3,38–3,53 s, Median 3,48 s; Historienlauf im Worker rund 2,7 s | Hochrechnung mit dem Faktor aus 2. (Node, 1,64): Historienlauf rund 1,65 s, Import rund 2,4 s, Budget gehalten. Bei gleichen festen Kosten (rund 0,8 s) liegt die Grenze ohne WASM bei rund 40, mit WASM bei rund 70 Spieljahren. Mobil (×4) rund 13 s gegen rund 9 s, ohne Budget |
| Speicher je Spieler (aktiv, 5. bis 13. Spieljahr)  | rund 1,85 MB je Spieljahr gegen 1,5 MB                         | keine; WASM erhöht den Speicher des Workers                                                                                                                                                                                                                                        |

Dazu steht „Engine bei 1 w/s“ mit laufendem Kerzen-Auftrag bei 14–16 %, also an der Grenze. Der Auftrag ist auf 10 % der Wanduhr begrenzt. WASM verkürzt nur seine Dauer, die Last bleibt gleich.

**Folgerung:** Opus' Satz „In der Standardwelt halten alle Budgets ohne WASM“ stimmt nicht mit §14.3 überein. Fables Satz ist richtiger, übersieht aber den Speicher. Formal ist der Import das Beispiel der PO-Schwelle: ohne WASM gerissen, mit WASM nach Hochrechnung gehalten. Dagegen spricht viererlei:

1. Die Hochrechnung stammt aus Node und ist nicht im Browser gemessen.
2. Der Import ist ein seltener Vorgang, die Überschreitung beträgt 0,5 s. Der PO hat sie schon als Abweichung geführt.
3. WASM verschiebt die Grenze nur. Lange Spiele sind der Normalfall: bei 1 w/s rund 70 Spieljahre je Stunde.
4. Ohne zweite Sprache gibt es die Wege aus §10.4: Monatsbeginn-Zustände mit exportieren (E-10) oder den Historienlauf nach dem Spielstart im Hintergrund beenden. Beide lösen das Problem unabhängig von der Spieldauer.

Als „deutlich spürbar“ werte ich das nicht.

### 5. Schwellen für eine spätere Portierung

Ein Budget, das um den Faktor r gerissen ist, hält WASM nur, wenn r ≤ 1 / (1 − p + p / f) gilt. Dabei ist p der portierbare Anteil und f der WASM-Faktor.

- Mit p = 0,7 und f = 2,2–2,8 ergibt das r ≤ 1,6–1,8.
- Mit p = 0,6 ergibt es r ≤ 1,5–1,6.

Fables Bedingung „mehr als den Faktor 1,5 gerissen bei ≥ 60 % Anteil“ beschreibt deshalb gerade die Fälle, die WASM nicht mehr hält. Opus' Obergrenze 2,5 ist ebenso zu hoch. In E-41 steht deshalb die Amdahl-Grenze selbst.

## Gemeinsame Einschätzung je Kriterium

**Determinismus.**

- Gegeben, mit Disziplin. Beide Läufe belegen die Bitgleichheit der Minutenkurse in V8 (Node, Chromium) und SpiderMonkey (Firefox). Die Nachprüfung belegt alle sechs Prüfsummen, mit Stromerzeugung und `detExp`/`detLog` in WASM.
- `detExp`/`detLog` müssen als fdlibm-Port mitgehen; libm von Rust oder `NativeMath` von AS sind nicht bitgleich zu fdlibm 5.3.
- Zu beachten sind `f64::max` gegen `Math.max` bei NaN, `0 + 1 · x` in `normal`, die Reihenfolge der Summen, NaN-Bitmuster und Relaxed SIMD (nicht verwenden).
- Der Selbsttest nach TS §4.6 bliebe wirksam, wenn der Worker den WASM-Pfad rechnet. Solange beide Fassungen bestehen, kommt ein Differenztest TS gegen WASM hinzu.
- Offen: WebKit und iOS.

**Bundle.**

- Unkritisch. Das Modul ist 3–21 kB gzip groß und gehört zum Worker, nicht zum initialen Bundle (Stand 225,9 kB von 300 kB).
- Pflicht: `ngsw-config.json` erfasst heute nur `/*.js` und `/*.css`. Ohne Eintrag für `*.wasm` (oder Einbetten als Base64, +33 %) startet die PWA offline nicht.

**Worker.**

- Machbar, mit mittlerem Aufwand. Der Start des Workers wird asynchron, oder das Modul wird synchron aus eingebetteten Bytes übersetzt.
- Die Logik-Tests unter Node brauchen das gebaute `.wasm`.
- Die Speicherverwaltung muss Sitzungslängen und LRU wie in JS abbilden (der Opus-Prototyp braucht bei N2 150–230 MiB).
- Feinkörnige Aufrufe (rund 5 ns) sind tragbar; der Hybrid ruft je Strom und je `detLog` über die Grenze.
- Eine CSP gibt es im Repo nicht; eine künftige bräuchte `'wasm-unsafe-eval'`.

**CI.**

- AssemblyScript ist eine `devDependency` ohne neue Werkzeugkette.
- Rust braucht das Ziel `wasm32-unknown-unknown` mit festen Versionen (`rust-toolchain.toml`, `Cargo.lock`) und einen Cache in `build-latest.yml` und den Verify-Workflows. Dazu kommt `rustup` lokal.
- `extern "C"` ohne Abhängigkeiten braucht keinen C-Linker; das zeigen alle drei Rust-Module dieses AP.
- Das `.wasm` bleibt ein Build-Artefakt.

**Tests und Mutationstests in zwei Sprachen.**

- Das ist der eigentliche Preis. Die portierbaren Dateien stehen heute nicht in den Stryker-Shards (`stryker.config.mjs`: Modelle, Weltgenerierung und RNG sind durch Golden Master geschützt). Die Mutationsabdeckung ginge also nicht verloren.
- Verloren gingen die ESLint-Regel gegen nicht exakte `Math`-Funktionen und die Eigenschaftstests direkt an den Funktionen. Rust bräuchte ein eigenes Verbot von `f64::exp`/`ln`/`powf`.
- `cargo-mutants` gibt es für Rust, für AS gibt es nichts.
- Bleibt TS als Referenz, ist jede Modelländerung doppelt zu schreiben. Bei den Primitiven (Hash, sfc32, fdlibm) ist das wenig, beim Kurven-Kern und Tagesschritt viel, weil M8–M10 genau diesen Code ändern.

**Aufwand.**

| Umfang                                                         | Aufwand                          |
| -------------------------------------------------------------- | -------------------------------- |
| Primitive (Stromerzeugung, `detExp`/`detLog`, rund 400 Zeilen) | ein AP                           |
| Kurven-Kern (`DayCurves`, `SupportValues`)                     | 2–4 Wochen bzw. ein bis zwei APs |
| Tagesschritt und Marktmodell (rund 3.000–3.700 Zeilen)         | ein eigener Meilenstein          |

Dazu kommen 20–40 % Mehraufwand je späterem Modell-AP für Kurven-Kern und Tagesschritt (Schätzung Opus).

**Risiko.**

- Technisch gering: Bitgleichheit ist belegt, Größe und Grenzkosten sind klein.
- Organisatorisch hoch für Kurven-Kern und Tagesschritt: zweite Sprache, Drift zwischen den Fassungen, ein Fehler im letzten Bit sperrt Spieler über `SIM_VERSION`, und das Modell ändert sich in Stufe 2 stark.
- Gering bis mittel für die stabilen Primitive.
- AS trägt zusätzlich das Reiferisiko vor 1.0.

**Alternativen.**

- **Bedarfsrechnung nach §5.8:** der einzige strukturelle Hebel für N2. Ihre festen Kosten (Faktoren, exakte Indizes) sind vorher zu messen.
- **Mehrere Worker:** für Hoch und Tief im Hintergrund mit vier Workern so viel wie WASM (Faktor 2,8–3,0), ohne zweite Sprache; die Gesamtrechenzeit bleibt gleich.
- **Import:** Monatsbeginn-Zustände exportieren oder den Historienlauf im Hintergrund beenden.
- **Umstrukturierung in JS:** nachweislich ohne Gewinn.
- **Anderes Verfahren für `normal`:** nur zusammen mit einer ohnehin fälligen neuen `SIM_VERSION`.

## Empfehlung

Keine Portierung nach WebAssembly in Stufe 2. Begründung:

- WASM bringt einen konstanten Faktor von 1,6 (Tagesschritt) bis 2,8 (Kurven-Kern).
- In der Standardwelt hält es nur das Import-Budget, und das nur für eine Spieldauer bis rund 70 Jahre. Dafür gibt es Wege ohne zweite Sprache.
- In N2 entscheidet die Bedarfsrechnung. WASM hilft dort nur in einem schmalen Fenster, wenn die exakt gerechneten Indizes rund 600–2.000 Aktien umfassen.
- Die PO-Schwelle „deutlich spürbar“ ist nicht erreicht.

Neu zu prüfen ist die Frage beim Start von N2, nach festgelegter Weltgröße und umgesetzter Bedarfsrechnung, mit Messung der echten großen Welt. Erster Kandidat wäre dann der schmale Port der Primitive (stabiler Code, kleinstes Risiko), danach der Kurven-Kern.

Vorschlag für TS §16:

| ID   | Thema                     | Entscheidung bzw. Vorschlag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status    |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| E-41 | WebAssembly im Rechenkern | Der Rechenkern bleibt TypeScript; in Stufe 2 wird nichts nach WebAssembly portiert (AP 7.2: bitgleich machbar, alle sechs Golden-Master-Prüfsummen gleich; Faktor 2,2–2,8 auf den Kurven-Kern, 1,6 auf den Tagesschritt mit Stromerzeugung und `detExp`/`detLog` in WASM; in der Standardwelt hielte WASM nur „Import bis spielbar“ und nur bis rund 70 Spieljahre). Gegen Last zuerst die Bedarfsrechnung aus §5.8, für Hoch und Tief im Hintergrund mehrere Worker, beim Import die Wege aus §10.4. Neu geprüft wird beim Start von N2 nach festgelegter Weltgröße und umgesetzter Bedarfsrechnung, mit Messung der großen Welt. Portiert wird dann nur, wenn ein Budget aus §14.3 oder von N2 gerissen ist, der portierbare Anteil p im Profil und der gemessene Faktor f die Überschreitung r tragen (r ≤ 1 / (1 − p + p / f)), der Selbsttest mit WASM in Chromium, Firefox, WebKit und auf einem iOS-Gerät bitgleich mit `GOLDEN_CHECKSUMS` ist und der portierte Code für mindestens einen Meilenstein stabil bleibt; zuerst die Primitive (Stromerzeugung, `detExp`/`detLog`), danach der Kurven-Kern, nie die Modelllogik; Toolchain bevorzugt Rust mit `extern "C"`, TS bleibt Referenz mit Differenztest | Vorschlag |

## Grenzen

- **wasm-bindgen und wasm-pack:** nicht gemessen. Es gab keinen C-Linker für Proc-Makros, deshalb lief Rust in beiden Läufen und in der Nachprüfung nur über `extern "C"`. Die Bewertung von wasm-bindgen beruht auf dem Papier.
- **WebKit und iOS:** nicht geprüft. Die Bitgleichheit ist für V8 und SpiderMonkey belegt, der Golden Master mit WASM-Primitiven nur in Node (V8).
- **Browser:** In der Nachprüfung nicht gemessen; der Rahmen schließt Playwright aus. Die Chromium-Faktoren stammen aus den Läufen, die Wirkung auf den Import ist aus Node hochgerechnet. Die Drosselung betraf nur die Seite, nicht den Worker (TS §14.3), und ersetzt kein echtes Mobilgerät.
- **N2:** Die große Welt ist synthetisch: 49 Faktoren, 22 Indizes, 30 ETFs und 12 Stützpunkte bleiben unverändert. Der Anteil der Faktoren ist auf 120 hochgerechnet. Die Weltgenerierung von rund 0,5 s stammt aus §5.8, die Verwaltung der Engine (1,5 %) aus der Standardwelt. Die Zahl der Aktien in exakten Indizes ist offen und deshalb als Parameter angegeben.
- **Hybrid:** `normal` und die Modelllogik bleiben JS. Ein vollständiger Port des Tagesschritts wäre schneller, aber nicht gemessen.
- **Streuung:** Die JS-Zeiten schwanken zwischen Skripten und Läufen um 10–15 %. Verglichen wird stets im selben Prozess.
