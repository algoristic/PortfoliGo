# AP 7.2 – WASM-Machbarkeit: Bericht Lauf Opus 5.5

Geprüfter Stand: 099601b (Rechenkern wie c1e2514) · Datum: 15.11.2026

Arbeitsordner (Skripte, Prototypen, Rohdaten): `/tmp/claude-1000/-home-marco-PortfoliGo/00032e5b-f648-418a-9798-a74b00fb33bb/scratchpad/wasm/opus/` (im Folgenden `W/`).

## Zusammenfassung

Ich habe die Minutenkurse aller 274 Serien eines Handelstags portiert, einmal nach Rust (`extern "C"`) und einmal nach AssemblyScript. Der Port umfasst `DayCurves` mit Faktor- und Aktienbrücken, Indizes, Performance-Indizes und ETFs, dazu MurmurHash3/`StreamFamily`, sfc32, die Polarmethode sowie `detExp`/`detLog`. Er läuft **bitgleich** mit dem Original: 0 Abweichungen in 37,75 Mio. Minutenwerten über alle 262 Markttage 2020. Die Golden-Master-Prüfsumme `minutes` lässt sich aus den WASM-Kurven reproduzieren. Das gilt in Node, Chromium 158 und Firefox 159.

Der Gewinn ist ein **konstanter Faktor von rund 2,1–2,8**, abhängig von Engine und Drosselung. Der Hoch/Tief-Tag braucht in Node 10,8 ms mit JS, 5,0 ms mit Rust und 4,8 ms mit AS. In Chromium mit vierfacher Drosselung sind es 53,2 ms gegenüber 20,6 bzw. 19,0 ms. Die Kosten über die Grenze sind vernachlässigbar (rund 1 µs je Tag für das Kopieren der Stützpunkte). Das Modul ist 5–21 kB gzip groß und gehört zum Worker, nicht zum initialen Bundle.

Die Hotspots bestehen zu 75–97 % aus reiner Rechenarbeit (Brücken, Normalverteilung, `detLog`/`detExp`, Stromerzeugung). Nur der Stapelbetrieb mit Aktienorders ist zu gut einem Drittel Verwaltung je Tick. In der Standardwelt halten alle Budgets ohne WASM.

Für N2 mit 10.000 Aktien bleibt der Faktor bei 2,2: Hoch/Tief kostet 248 ms je Tag mit JS und 110 ms mit WASM. Das reicht nicht. Nur die Bedarfsrechnung aus TS §5.8 senkt den Aufwand um Größenordnungen.

**Empfehlung:** keine Portierung jetzt. Neu zu prüfen ist sie beim Start von N2 nach den Maßnahmen aus §5.8, mit festen Schwellen (unten), und dann bevorzugt als schmaler Rust-Kern für die Minutenkurse.

## Hotspot-Profil

**Messung:** Standardwelt, Seed `golden-1` bzw. `perf-engine` (wie die Perf-Suite), Node 22.22.3 (V8), dieser Rechner (32 Kerne, ohne andere Last).

- Zeiten sind der Median aus 3–5 Läufen nach dem Aufwärmen, mit Spanne. Skript: `W/profile/hotspots.ts`.
- Die Profile stammen aus `node --cpu-prof` (Abtastung alle 200 µs). Ausgewertet sind Selbstzeiten mit `W/profile/aggregate.mjs`, die Rohprofile liegen in `W/profile/prof/*/`, die Auswertung in `W/profile/prof/*.txt`.
- `detExp` und `priceFromLog` sind von V8 in die aufrufenden Schleifen inlined (`#sessionPrefix`, `#indicativeInstrument`); sfc32 und `nextFloat53` sind in `normal` inlined.

| Hotspot                                       | Szenario                                                                                   | Zeit gesamt (Median, Spanne)                                                                                                                                       | rechenintensiv / portierbar         | Verwaltung                                                                                                                    | wichtigste Funktionen (Selbstzeit)                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tagesschritt                                  | `advanceMarket` 2020, 262 Markttage                                                        | 30,0 ms (29,7–30,8) = **0,115 ms je Markttag**; Vorlauf 10 Jahre inkl. Welt 332 ms (330–333); `recomputeSupportDays` 2020 30,6 ms                                  | rund 90 %                           | GC 4 %, Rest Aufrufe                                                                                                          | `StreamFamily.create`+`digest`+`copyFrom` 35 % (rund 250 Ströme je Tag), `normal`+`detLog` 30 %, `stepInstrument` 9 %, `stepIndices` 5 %, `decayWeight` 4 % |
| Brücken und Minutenkurse                      | `DayCurves.seriesCurve` aller Serien, 60 Tage                                              | alle 274 Serien **9,3 ms je Tag**; davon Aktien 6,4 ms (darin Faktorbrücken 2,3 ms), Indizes +0,75 ms, ETFs +2,1 ms; Eröffnung/Schluss aus `SupportValues` 0,62 ms | 95–97 %                             | GC 1–5 %                                                                                                                      | `#sessionPrefix` 21 %, `normal` 20 %, `detLog` 19 %, `#indicativeInstrument` 16 %, `indexCurve` 7,5 %                                                       |
| Live mit Kerzen                               | `engine.perf.spec`-Szenario: ein Spieljahr in Frames bei 1 w/s mit Tageskerzen (Hoch/Tief) | 3,22 s (3,22–3,29) = **6,2 % eines Kerns** bei 1 w/s                                                                                                               | rund 88 %                           | GC 5 %, Engine/Planer rund 3 %, Kerzen-Abfrage 2 %                                                                            | wie Minutenkurse                                                                                                                                            |
| Stapelbetrieb ohne Orders                     | `runUntil` ein Spieljahr                                                                   | 46 ms (42–50)                                                                                                                                                      | rund 65 % (Tagesschritt rund 30 ms) | Rest: Planer, Bank-Lauf, Tagesreihen                                                                                          | Tagesschritt                                                                                                                                                |
| Stapelbetrieb mit 20 Aktienorders             | ebenso                                                                                     | 0,66 s (0,64–0,67)                                                                                                                                                 | **rund 52 %**                       | **rund 33 %** (`priceAt` 9 %, `#dayCurves` 8 %, `#seriesOf` 6 %, `runUntil` 5 %, `needsTick`/`#check`/`#setTick` 4 %), GC 6 % | `normal` 16 %, `detLog` 14 %, `#sessionPrefix` 8 %                                                                                                          |
| Stapelbetrieb mit 10 ETF- und 10 Aktienorders | ebenso                                                                                     | 2,15 s (2,15–2,17)                                                                                                                                                 | rund 76 %                           | rund 13 %, GC 6 %                                                                                                             | `#indicativeInstrument` 21 %, `#sessionPrefix` 16 %, `normal` 15 %, `detLog` 14 %                                                                           |
| Hoch/Tief-Auftrag                             | `createHighLowFill` über 2020 (262 Tage, inkl. Nachrechnen der Stützpunkte)                | 2,54 s (2,54–2,55) = **9,7 ms je Markttag**                                                                                                                        | rund 97 %                           | GC 1,3 %                                                                                                                      | wie Minutenkurse; Min/Max-Schleife 3,6 %                                                                                                                    |

**Einordnung gegen TS §14.3:**

- Die Werte liegen etwas unter den dort genannten 13 ms je Handelstag und rund 4 s für das Live-Jahr. Die Messungen dieses Rechners sind heute schneller.
- In Chromium 158 ist dasselbe JS langsamer als in Node: 12,6 ms statt 10,8 ms je Hoch/Tief-Tag.
- Gedrosselt gilt laut eigener Messung in der Seite der Faktor 4,2: 53,2 ms je Tag.

**Verwaltung im Worker** (Nachrichten, IndexedDB, Projektionen): Ich habe sie nicht selbst profiliert. TS §14.3 nennt aus J10 rund 4 % eines Kerns für die Engine bei 1 w/s ohne Minutenverläufe. Dieser Teil ist nicht portierbar. Er wird durch WASM eher größer, weil zusätzliche Grenzübergänge entstehen.

**Was davon sich abgrenzen und portieren lässt:**

- **Gut:** Minutenkurse und Brücken, also `DayCurves` und `SupportValues` samt Strömen und Verteilungen. Hoch/Tief und der Live-Teil sind fast reine Rechenarbeit auf Typed Arrays.
- **Mittel:** der Tagesschritt. Er ist ebenfalls Rechenarbeit, hängt aber an Dividenden-, Index- und ETF-Logik, Kalendern und der Historie (rund 3.700 Zeilen).
- **Schlecht:** die Orderprüfung je Tick im Stapelbetrieb, also `priceAt`, Cache-Lookups und `#seriesOf`. Das ist Verwaltung über JS-Objekte.

**Standardwelt in Zahlen (Node, JS):**

| Vorgang                            | Rechnung                      | Ergebnis                                                                      |
| ---------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| Vorlauf Hoch/Tief, 10 Jahre        | rund 2.610 Markttage × 9,7 ms | rund 25 s Rechenzeit, mit 10 % Anteil rund 4,2 min Wanduhr                    |
| Vorlauf Hoch/Tief gedrosselt       | 2.610 × 53 ms                 | rund 139 s, mit 10 % Anteil rund 23 min                                       |
| Live 1 w/s mit allen Minutenkursen | 5 Markttage/s × 12,6 ms       | ungedrosselt rund 6 % eines Kerns                                             |
| Live 1 w/s gedrosselt              | 5 Markttage/s × 53 ms         | rund 27 % eines Kerns, nur Minutenkurse; deshalb die Rückfallebene aus AP 2.5 |

**Hochrechnung N2**, gemessen mit `W/bench/n2.ts`. Ich habe die Standardwelt synthetisch vergrößert: Unternehmen vervielfacht mit neuen IDs und damit neuen Strömen. Indizes und ETFs sind unverändert, es bleiben 49 Faktoren und 12 Stützpunkte. Rohdaten: `W/data/n2.txt`.

| Aktien | Tagesschritt je Markttag (JS) | alle Minutenkurse/Hoch-Tief je Tag: JS | Rust             | AS               | WASM-Speicher Rust/AS |
| ------ | ----------------------------- | -------------------------------------- | ---------------- | ---------------- | --------------------- |
| 200    | 0,18 ms*                      | 9,5 ms                                 | 5,1 ms           | 4,9 ms           | 6/6 MiB               |
| 1.000  | 0,48 ms                       | 28,8 ms                                | 13,7 ms          | 13,5 ms          | 17/24 MiB             |
| 2.000  | 0,86 ms                       | 52,7 ms                                | 24,5 ms          | 24,9 ms          | 32/47 MiB             |
| 10.000 | 4,37 ms                       | 248 ms (247–250)                       | 110 ms (108–111) | 113 ms (113–113) | 149/228 MiB           |

\* Nur 43 Tage (Jan./Feb.), deshalb mit mehr Aufwärmanteil als die 0,115 ms oben. Alle Größen sind linear in der Zahl der Aktien. Bei 10.000 Aktien prüfe ich die Bitgleichheit stichprobenartig: 0 Abweichungen beim Hoch aller 10.074 Serien eines Tags.

Bei 10.000 Aktien folgt daraus:

- **Vorlauf, Tagesschritte von 10 Jahren:** rund 11,4 s mit JS, Budget 2 s. Mit WASM wären es geschätzt 4–5 s (Tagesschritt nicht portiert; Schätzung aus den Mikromessungen: Stromerzeugung Faktor 5, `normal` Faktor 1,5–2,7).
- **Vorlauf Hoch/Tief:** rund 11 min Rechenzeit mit JS, rund 5 min mit WASM. Mit 10 % Anteil sind das 1,8 h bzw. 48 min Wanduhr, gedrosselt das Vierfache.
- **Live mit allen Minutenkursen bei 1 d/s:** rund 18 % eines Kerns mit JS, rund 8 % mit WASM. Bei 1 w/s sind es 124 % bzw. 55 %.

Beides verfehlt die Budgets der Standardwelt auch mit WASM. Nur die Maßnahmen aus §5.8 machen N2 machbar: Minutenkurse nur für beobachtete Instrumente, Hoch/Tief bei Bedarf, genäherte breite Indizes. Mit 50 statt 10.000 Live-Instrumenten sinkt der Aufwand um den Faktor rund 200. WASM bringt danach nur noch einen Faktor 2 auf einen kleinen Rest.

## Toolchains

Rust habe ich mit `extern "C"` gemessen: eine Crate ohne Abhängigkeiten, `cdylib`, `opt-level=3`, LTO und `panic=abort`. wasm-bindgen und wasm-pack bewerte ich nur auf dem Papier, weil der C-Linker für Proc-Makros fehlt. Die wasm-bindgen-CLI 0.2.130 erzeugt für das reine `extern "C"`-Modul nur einen Lader ohne typisierte Bindungen. AssemblyScript ist Version 0.28.20 mit `-O3 --runtime stub --noAssert` und roher Speicherarbeit über `load`/`store`.

| Kriterium                                    | Rust (`extern "C"` gemessen; wasm-bindgen auf dem Papier)                                                                                                                                                                                                                                                                                                                                          | AssemblyScript                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leistung (Hoch/Tief je Tag, Faktor gegen JS) | Node 5,0 ms (2,2×), Chromium 5,1 ms (2,5×), Chromium 4× 20,6 ms (2,6×). `normal` im Prototyp 20 ns gegen 11 ns bei AS, vermutlich wegen Bounds-Checks und Struct-Zugriffen; mit `get_unchecked` optimierbar                                                                                                                                                                                        | Node 4,8 ms (2,3×), Chromium 4,6 ms (2,7×), Chromium 4× 19,0 ms (2,8×). Etwas schneller als Rust, weil roh und ohne Prüfungen                                                                                                                                                                            |
| Determinismus von Gleitkomma und Math        | bitgleich mit JS (0/37,75 Mio. Werte, 0/400.000 `detExp`/`detLog`). Rust fusioniert nie automatisch zu FMA und optimiert ohne Fast-Math. `f64::exp`/`ln` kämen aus dem einkompilierten libm, wären also auch über Engines gleich, aber **nicht** gleich `detExp`. Deshalb ist der fdlibm-Port nötig, solange JS dieselben Werte rechnen muss                                                       | bitgleich, gleiche Zahlen. `Math.sqrt` wird zu `f64.sqrt` (exakt), `Math.exp` wäre NativeMath (deterministisch, aber ≠ `detExp`). Gleiche Folgerung                                                                                                                                                      |
| Bundle-Größe                                 | 49,5 kB roh / 20,5 kB gzip (`opt-level=3`), 37,7 / 16,5 kB mit `opt-level="z"`; enthält Allocator (dlmalloc) und Panic-Pfade. Mit wasm-bindgen käme JS-Glue von einigen kB hinzu                                                                                                                                                                                                                   | 11,0 kB roh / 5,0 kB gzip                                                                                                                                                                                                                                                                                |
| Ergonomie                                    | starke Typen; Wrapping-Arithmetik explizit (`wrapping_mul`, `rotate_left`), was für Hash und sfc32 gut lesbar ist. Der Borrow-Checker reibt bei Caches (`mem::take`). `extern "C"` heißt Zeiger von Hand marshallen (Parameterblock mit 37 Zeigern, `W/bench/wasm-day-curves.ts`). wasm-bindgen gäbe typisierte Funktionen und Typed-Array-Views, braucht aber Proc-Makros, also einen Host-Linker | TS-Syntax, aber andere Semantik (i32/u32/f64, keine Closures, Laufzeit „stub“ ohne Freigabe). Für Leistung braucht es `load`/`store` oder `unchecked()`, also eine eigene, schlecht lesbare Codebasis. Die ESLint-Regeln des Projekts greifen nicht. Der Port des TS-Codes ging sehr direkt (610 Zeilen) |
| Typed Arrays, gemeinsamer Speicher           | lineares Memory, Views `new Float64Array(memory.buffer, ptr, n)` ohne Kopie. Views werden bei `memory.grow` ungültig. Threads bzw. `SharedArrayBuffer` bräuchten COOP/COEP-Header beim Hosting (Deployment per SFTP, statisch)                                                                                                                                                                     | gleich                                                                                                                                                                                                                                                                                                   |
| Reife und Wartung                            | Compiler stabil; `wasm32-unknown-unknown` Tier 2. wasm-bindgen 0.2.x lange stabil. Nach meinem Kenntnisstand wurde die Arbeitsgruppe rustwasm 2025 aufgelöst und wasm-bindgen in eigener Organisation weitergeführt, wasm-pack weniger aktiv (nicht geprüft)                                                                                                                                       | vor 1.0, kleines Kernteam, Bruchänderungen zwischen Minor-Versionen in der Vergangenheit; Abhängigkeit nur über npm                                                                                                                                                                                      |
| Build in der CI                              | `rustup` mit Ziel `wasm32-unknown-unknown` (Action oder Container), rund 1 min Einrichtung; ohne Abhängigkeiten kein C-Linker nötig. wasm-bindgen braucht `cc` (auf `ubuntu-latest` vorhanden, lokal hier nicht). Neue Werkzeugkette auch lokal (`rustup`)                                                                                                                                         | npm-devDependency, läuft im vorhandenen Node-Setup und im Playwright-Container ohne neue Werkzeugkette                                                                                                                                                                                                   |
| Testwerkzeuge                                | `cargo test` nativ und schnell (gleiche IEEE-Arithmetik, `detExp` portiert); `wasm-bindgen-test` für WASM; Golden Master über die Grenze per Vitest, das das `.wasm` lädt (wie mein Harness)                                                                                                                                                                                                       | Tests praktisch nur über JS/Vitest gegen das kompilierte Modul; eigene AS-Testframeworks wenig verbreitet                                                                                                                                                                                                |
| Mutationstests                               | Stryker deckt Rust nicht ab. `cargo-mutants` existiert, als eigenes Werkzeug mit eigener Schwelle                                                                                                                                                                                                                                                                                                  | Stryker kann AS nicht sinnvoll mutieren (jeder Mutant bräuchte einen `asc`-Build); kein gängiges Werkzeug                                                                                                                                                                                                |

## Prototyp und Messwerte

**Portiert:** die Minutenkurse und Hoch/Tief aller Serien eines Handelstags, also der Kern von `createHighLowFill`, des Live-Teils und der Kerzen-Abfragen. Im Einzelnen:

- `DayCurves`: `factorCurve`, `#sessionPrefix`, `indexCurve`, Performance-Index mit `withReinvestment`, `#indicativeInstrument`, `#indicativeLevels`, `#etfCurve`, jeweils mit derselben Bereichs-Cache-Logik (`CurveRanges`);
- `fillBridge`;
- MurmurHash3 x86_128 inkrementell mit `StreamFamily.create`;
- sfc32 mit 12 verworfenen Ausgaben;
- `normal` (Polarmethode mit gemerktem Zweitwert, einschließlich `0 + 1 · x`);
- `detExp` und `detLog`.

**Nicht portiert:** Tagesschritt, Historie und `PriceSource`. Die Brückentabellen werden aus JS übergeben.

Code:

- Rust: `W/rust/src/lib.rs` mit `Cargo.toml`, Build `cargo build --release --target wasm32-unknown-unknown`.
- AssemblyScript: `W/as/assembly/index.ts`, Build `npx asc assembly/index.ts -O3 --runtime stub --noAssert --converge -o build/daycurves.wasm`.
- JS-Seite: `W/bench/wasm-day-curves.ts` kopiert das Layout einmal und je Tag die Stützpunkte.
- Benchmark: `W/bench/bench.ts` mit `node-main.ts`, `browser-main.ts`, `run-browser.mjs`, `serve.mjs`, `build.mjs`.

**Eingaben:** Seed `golden-1`, Standardwelt (200 Aktien, 49 Faktoren, 22 Indizes, 30 ETFs, 274 Serien, 12 Stützpunkte). Die Stützpunkte aller 262 Markttage 2020 stammen aus `advanceMarket`. Gemessen werden die ersten 60 Tage, angegeben ist die Zeit je Tag. Original ist `DayCurves` aus dem Repo, mit esbuild gebündelt.

**Läufe:**

- **Node:** je Modul 3 Prozesse × 7 Läufe nach 2 Aufwärmläufen. In der Tabelle steht der Median der Prozess-Mediane, die Spanne ist Minimum bis Maximum über alle Läufe. Rohdaten: `W/data/node-main*-[123].json`, Zusammenfassung `W/data/node-summary.txt`.
- **Chromium:** Chromium 158.0.8127.18 aus Playwright 1.65, headless, eigene Seite `W/web/index.html` mit `?mode=time`. Je Einstellung 2 Seitenläufe × 5 Läufe nach 2 Aufwärmläufen. Die Drosselung kommt aus `Emulation.setCPUThrottlingRate` 4 über CDP, die Messung läuft in der Seite. Rohdaten: `W/data/browser-chromium-t{1,4}-{1,2}.json`, Zusammenfassung `W/data/browser-summary.txt`.

| Variante                                                                      | Node ohne Drosselung: Median (Spanne) | Chromium ohne Drosselung       | Chromium mit 4× Drosselung     | Grenzkosten                                                                                                          | Bitgleichheit mit JS                                                                                                                               | `.wasm` roh/gzip                             |
| ----------------------------------------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| JS (Repo), Hoch/Tief je Tag                                                   | 10,77 ms (10,64–10,91)                | 12,60 ms (12,51–12,72)         | 53,4 ms (52,9–54,1)            | –                                                                                                                    | Referenz                                                                                                                                           | – (Worker-Chunk heute 246 kB / 79,6 kB gzip) |
| JS, nur alle Kurven je Tag                                                    | 10,33 ms (10,18–10,57)                | 12,3 ms                        | 52,0 ms                        | –                                                                                                                    | –                                                                                                                                                  | –                                            |
| JS mit Typed-Array statt `DataView` in `det-math` (`W/alt/det-math-typed.ts`) | 10,66 ms (10,35–11,07)                | –                              | –                              | –                                                                                                                    | –                                                                                                                                                  | kein Gewinn                                  |
| Rust, Hoch/Tief je Tag (Kopie hinein + Rechnen + Lesen)                       | **4,99 ms (4,91–5,08), 2,16×**        | **5,08 ms (5,04–5,19), 2,48×** | **20,8 ms (20,4–21,0), 2,57×** | Kopie hinein 0,001 ms/Tag (gedrosselt 0,004); alle Kurven als Kopie heraus +0,07 ms (Chromium +0,6, gedrosselt +2,2) | 0 Abweichungen in 37.752.628 Werten und 262 × 274 Hoch/Tief; Prüfsumme aller Kurven `231c5e16…` gleich; `minutes` = `7b11a6b1…` (GOLDEN_CHECKSUMS) | 49,5 kB / 20,5 kB (`z`: 37,7 / 16,5)         |
| AssemblyScript, ebenso                                                        | **4,79 ms (4,70–4,89), 2,25×**        | **4,59 ms (4,54–4,65), 2,74×** | **19,0 ms (18,9–19,2), 2,81×** | gleich (0,001 ms hinein; heraus +0,05 ms, Chromium +0,5, gedrosselt +2,0)                                            | wie Rust                                                                                                                                           | 11,0 kB / 5,0 kB                             |

**Bausteine** (ns je Aufruf; Node / Chromium / Chromium 4×):

| Baustein              | JS                     | Rust               | AS                 |
| --------------------- | ---------------------- | ------------------ | ------------------ |
| `detExp`              | 12,4 / 4,2–7,6 / 18–37 | 3,4 / 3,3 / 13,6   | 3,4 / 3,3 / 13,6   |
| `detLog`              | 29,2 / 27 / 110        | 5,5 / 5,2 / 21,5   | 5,5 / 5,3 / 21,7   |
| `normal`              | 30,3 / 57 / 240        | 20,0 / 19,7 / 80,5 | 11,2 / 11,4 / 46,5 |
| `StreamFamily.create` | 225 / 440 / 1.800      | 44 / 43 / 174      | 50 / 46 / 190      |

Der Vorteil kommt vor allem aus `detLog`, `normal` und der Stromerzeugung (Faktor 5–10). Die eigentlichen Brückenschleifen gewinnen nur wenig.

**Laden und Speicher:**

| Engine                           | Kompilieren + Instanziieren                              | Layout initialisieren  |
| -------------------------------- | -------------------------------------------------------- | ---------------------- |
| Node                             | Rust 0,4 + 0,1 ms, AS 0,2 + 0,1 ms                       | 2,5–3,8 ms             |
| Chromium, `instantiateStreaming` | Rust 4,8–5,9 ms, AS 2,8–3,3 ms; gedrosselt 17 bzw. 13 ms | 3 ms, gedrosselt 11 ms |
| Firefox 159                      | Rust 19 ms, AS 9 ms                                      | –                      |

Der Speicher liegt in der Standardwelt bei 4,8 MiB (Rust) bzw. 6,1 MiB (AS). Der Prototyp hält je Aktie volle Tagespuffer mit 1.441 Minuten; deshalb braucht er bei 10.000 Aktien 149 bzw. 228 MiB. Ein echter Port bräuchte Puffer in Sitzungslänge oder einen LRU-Cache wie JS.

**Bitgleichheit über Engines** (`?mode=verify`, `W/data/browser-verify-{chromium,firefox}.json`): Chromium 158 und Firefox 159 liefern dieselben 0 Abweichungen und dieselbe `minutes`-Prüfsumme wie Node. WebKit ließ sich lokal nicht starten, weil Systembibliotheken fehlen und sudo nicht verfügbar ist.

## Bewertung

**Determinismus.**

- Der Port ist bitgleich, auch über V8 und SpiderMonkey. Die Golden-Master-Prüfsumme `minutes` entsteht unverändert aus den WASM-Kurven.
- Die übrigen fünf Prüfsummen (Welt, Tagesschritt, Indizes, ETFs, Spielstart) berührt der Prototyp nicht. Bei einem Port des Tagesschritts wären sie mit derselben Methode zu prüfen.
- `detExp` und `detLog` müssen portiert werden, sonst weicht WASM im letzten Bit vom JS-Pfad ab. Das libm von Rust bzw. NativeMath von AS wären zwar über die Engines deterministisch, aber nicht bitgleich zu fdlibm 5.3.
- WASM ist für transzendente Funktionen sogar robuster als JS, weil die Mathematik einkompiliert ist. Restrisiken sind NaN-Bitmuster (die Prüfsumme hasht NaN kanonisch), Relaxed SIMD (nicht verwenden) und Engine-Fehler.
- Der Selbsttest nach TS §4.6 bliebe gleich: Der Labor-Worker lädt das Modul, `computeGoldenChecksums` rechnet über den WASM-Pfad, `e2e/determinism.e2e.ts` vergleicht in Chromium, Firefox und WebKit. Zusätzlich müsste ein Differenztest WASM gegen die TS-Referenz über Zufallsseeds laufen.
- **Urteil:** Determinismus ist machbar und kein Hindernis.

**Bundle.**

- Das Modul ist 5 kB (AS) bis 16–21 kB (Rust) gzip groß. Es wird vom Worker geladen und zählt nicht zum initialen Bundle (Budget 300 kB, Stand 191,5 kB).
- Für den Offline-Betrieb muss `ngsw-config.json` `*.wasm` vorab laden. Heute erfasst die Konfiguration nur `/*.js` und `/*.css`. Alternativ lässt sich das Modul base64 ins Worker-Bundle einbetten (+33 %).
- **Urteil:** unkritisch.

**Einbindung in den Worker.**

- Kompilieren und Instanziieren kosten 3–19 ms, gedrosselt bis 17 ms in Chromium, plus 3–11 ms für das Layout. Das ist klein gegen das Spielstart-Budget.
- Die Schnittstelle ist synchron je Tag. Die Kopie der Stützpunkte (rund 24 kB je Tag) kostet rund 1 µs. Ergebnisse liest man als Views ohne Kopie; eine Kopie aller Kurven würde 0,05–0,6 ms je Tag kosten.
- Snapshots bleiben unberührt, die Kurven sind reiner Cache.
- **Aufwand 1, asynchroner Start:** Der Worker startet heute synchron (`engine.worker.ts`). Mit WASM muss das Modul vor dem ersten Kommando geladen sein, entweder per `await` vor `EngineHost` oder synchron mit `new WebAssembly.Module` aus eingebetteten Bytes.
- **Aufwand 2, Logik-Tests:** Die Tests unter Node brauchen das gebaute `.wasm`, also einen Build-Schritt vor `vitest`.
- **Aufwand 3, Speicher:** Die Speicherverwaltung muss Sitzungslängen und LRU wie in JS abbilden. Bei N2 sind die Puffer sonst 150–230 MiB groß.
- **Urteil:** machbar, mit mittlerem Integrationsaufwand.

**CI.**

- AssemblyScript ist eine npm-Abhängigkeit und braucht keine neue Werkzeugkette.
- Rust braucht `rustup` und das Ziel `wasm32-unknown-unknown` in allen Jobs, die bauen oder testen: Gate, Verify und Playwright-Container. Das kostet rund 1 min Einrichtung je Job plus Cache. wasm-bindgen braucht zusätzlich einen C-Linker; auf `ubuntu-latest` ist er da, auf diesem Entwicklungsrechner nicht.
- Für die lokale Entwicklung kommt eine zweite Werkzeugkette hinzu (die §11-Tabelle in `CLAUDE.md`, `nvm` plus `rustup`).
- **Urteil:** lösbar. Bei Rust ist es ein spürbarer Dauerposten.

**Tests und Mutationstests in zwei Sprachen.**

- Die portierten Dateien (`day-curve.ts`, `bridge-logic.ts`, `det-math.ts`, `random-stream.ts`, `distributions.ts`, `market-step.ts`) stehen heute **nicht** in den Stryker-Shards. Sie sind durch Golden Master und Eigenschaften geschützt. Dass Stryker Rust bzw. AS nicht abdeckt, verliert für diese Dateien also wenig.
- Neu ist die Doppelpflege: Entweder bleibt die TS-Implementierung als Referenz mit einem Differenztest über die Sprachgrenze, dann wird jede Modelländerung zweimal gebaut. Oder TS entfällt, dann ist der Golden Master das einzige Orakel und die Eigenschaften aus `market-properties.spec.ts` laufen gegen WASM.
- Für Rust gäbe es `cargo-mutants` mit eigener Schwelle, für AS gibt es nichts.
- **Urteil:** das größte Dauerrisiko, besonders weil M8 und M9 das Marktmodell stark erweitern: Währungen, Zinsen, Anleihen, Rohstoffe (TS §6.10).

**Aufwand (Größenordnung).**

| Umfang                                                | Code                 | Prototyp                                       | Port mit Tests, Build, CI, Einbindung |
| ----------------------------------------------------- | -------------------- | ---------------------------------------------- | ------------------------------------- |
| schmaler Kern Minutenkurse                            | rund 1.400 TS-Zeilen | rund ein Arbeitstag, 600–700 Zeilen je Sprache | 2–4 Wochen (ein bis zwei APs)         |
| Marktmodell mit Tagesschritt, Historie, `PriceSource` | rund 3.700 TS-Zeilen | –                                              | 6–10 Wochen                           |

Dazu kommt für jedes spätere Modell-AP der Mehraufwand der zweiten Sprache, geschätzt 20–40 % je AP.

**Risiko.**

- Hoch für einen Port jetzt: Drift zwischen den Sprachen, das Modell ändert sich in Stufe 2 noch stark, zweite Werkzeugkette, kleinere Prüfabdeckung, Fehlersuche über die Grenze.
- Gering für einen späten, schmalen Kern nach Stabilisierung des Modells.
- AS hat zusätzlich das Reiferisiko vor 1.0.

**Alternativen ohne WASM** (Vergleich mit Faktor 2,2–2,8):

- **Mehrere Worker** (`W/bench/parallel.ts`, `W/data/parallel.txt`): Hoch/Tief über 262 Tage braucht 2,65 s mit einem Worker, 1,40 s mit zwei und 0,80 s mit vier Workern (3,3×, inkl. Setup je Worker). Die Tage sind unabhängig, und das Modell bleibt unangetastet. Die Last des Engine-Workers sinkt, die Gesamtrechenzeit (Energie) nicht. Auf Telefonen mit 4–8 Kernen bringt das für den Hintergrundauftrag mehr als WASM.
- **Bedarfsrechnung nach TS §5.8:** Minutenkurse nur für beobachtete, gehaltene und per Order betroffene Instrumente, Hoch/Tief bei Abruf, breite Indizes genähert. Bei N2 ist das ein Faktor rund 200 und damit **der** Hebel; WASM ist dagegen eine Konstante.
- **Mikro-Optimierung in JS:** Typed Arrays statt `DataView` in `det-math` brachten nichts (10,66 gegen 10,77 ms).
- **Algorithmische Änderungen:** Ziggurat statt Polarmethode oder Brücken mit weniger Normalverteilungen könnten die Hälfte der Kosten (`normal`+`detLog` rund 40 %) treffen. Sie ändern aber die Ströme und damit `SIM_VERSION`; nicht gemessen.
- **SIMD in JS:** gibt es nicht. WASM-SIMD hilft bei Indexsummen und indikativen Werten (rund 10 % Anteil), nicht bei den sequenziellen Brücken; nicht gemessen.

**Gesamturteil:** WASM ist technisch machbar und deterministisch. Es bringt einen ehrlichen, aber begrenzten Faktor 2–2,8 auf die reine Rechenarbeit. In der Standardwelt fehlt der Bedarf: Alle Budgets halten, und der Live-Teil bei 1 w/s hat seine Rückfallebene. Bei N2 löst WASM das Skalierungsproblem nicht, das löst §5.8.

## Empfehlung

**Vorschlag für eine Entscheidung in TS §16 (E-xx „WebAssembly für den Rechenkern“):** Der Rechenkern bleibt TypeScript; in Stufe 2 wird nichts portiert.

**Erste Maßnahmen gegen Last** sind, in dieser Reihenfolge:

1. die Bedarfsrechnung aus TS §5.8 (bei N2 Pflicht);
2. der Hoch/Tief-Auftrag in einem eigenen Worker, falls der Hintergrundauftrag auf Mobilgeräten zu langsam ist;
3. erst danach WASM.

**Neu zu prüfen beim Start von N2** (nach den Maßnahmen aus §5.8) oder wenn ein Mobil-Budget aus E-27 auf Geräten gerissen wird, und nur wenn alle drei Bedingungen gelten:

- (a) Ein Budget aus §14.3 bzw. das N2-Budget wird um mehr als 30 %, aber höchstens um den Faktor 2,5 verfehlt. Bei mehr hilft WASM allein nicht.
- (b) Im Profil des betroffenen Szenarios liegen mindestens 70 % der Zeit in abgrenzbaren Rechenkernen: Brücken, `normal`, `detExp`/`detLog`, Stromerzeugung, gegebenenfalls Tagesschritt.
- (c) Das Marktmodell ist für mindestens einen Meilenstein stabil, also frühestens nach M9.

**Dann:** Port nur des Kerns der Minutenkurse (`DayCurves`/`SupportValues` samt Strömen, Verteilungen und `detExp`/`detLog`) als eigenes AP.

- **Toolchain:** bevorzugt Rust `extern "C"`, wegen Reife, `cargo test` und `cargo-mutants`. Schnell genug sind beide Toolchains. AssemblyScript ist die Alternative, wenn keine zweite Werkzeugkette in die CI soll.
- **TS-Implementierung:** bleibt als Referenz, mit Differenztest über die Sprachgrenze.
- **Golden Master:** wird zusätzlich gegen den WASM-Pfad geprüft.
- **Selbsttest:** im Labor-Worker in allen drei Engines.
- **Ziel:** mindestens Faktor 2 im gedrosselten Chromium.

## Grenzen

- **WebKit:** ließ sich lokal nicht starten (fehlende Systembibliotheken, kein sudo). Die Bitgleichheit ist nur für V8 (Node, Chromium 158) und SpiderMonkey (Firefox 159) belegt. Safari unter iOS ist ungeprüft.
- **wasm-bindgen und wasm-pack:** nur auf dem Papier bewertet, weil der C-Linker für Proc-Makros fehlt. Nur die wasm-bindgen-CLI lief auf dem reinen Modul.
- **Tagesschritt, Historie und `PriceSource`:** nicht portiert. Ihr WASM-Gewinn ist aus den Mikromessungen geschätzt.
- **Echte Telefone und gedrosselter Worker:** nicht gemessen. Gemessen ist nur die Seite mit vierfacher CPU-Drosselung in Chromium, wie vorgegeben.
- **Verwaltung im Worker:** `postMessage`, IndexedDB und Projektionen habe ich nicht selbst profiliert. Ich stütze mich auf J10 in TS §14.3.
- **N2:** nur über eine synthetisch vervielfachte Standardwelt (49 Faktoren, 22 Indizes) hochgerechnet. Die echte N2-Welt hätte rund 120 Faktoren, mehr Stützpunkte und mehr Indizes.
- **Rust-Prototyp:** nicht auf Größe und Geschwindigkeit optimiert. Es fehlen `wasm-opt` (nicht installiert) und `get_unchecked`; `normal` ist langsamer als bei AS.
- **Wartungsstand von wasm-bindgen und wasm-pack:** aus meinem Wissen, nicht im Netz geprüft.
- **Abweichung der JS-Messwerte:** Die Zeiten des Originals schwanken zwischen den Skripten um rund 10 %: 9,3 ms je Tag in `hotspots.ts`, 10,3–10,8 ms im Benchmark-Bundle. Verglichen wird immer im selben Prozess.
