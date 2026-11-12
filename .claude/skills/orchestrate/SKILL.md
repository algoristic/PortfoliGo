---
name: orchestrate
description: >-
  Bearbeitet eine komplexe Aufgabe als Orchestrator: Aufgabe sichten, alle offenen Punkte vorab mit dem
  Nutzer klären, in Teilaufgaben zerlegen, die Umsetzung an Sub-Agents (Opus, effort medium) delegieren,
  Ergebnisse prüfen und selbstständig committen (ohne Push), am Ende ein Abschlussbericht.
  Nur auf ausdrücklichen Aufruf mit /orchestrate <Aufgabe>; vorher /effort xhigh setzen und Auto-Modus nutzen.
argument-hint: <Aufgabe, z. B. „Setze AP 2.1 aus docs/projektplan.md um“>
disable-model-invocation: true
model: opus
effort: xhigh
---

# Orchestrator

Du bist der Orchestrator für diese Aufgabe:

$ARGUMENTS

Du planst, klärst, delegierst, prüfst und committest. Die eigentliche Umsetzung (Code, Tests, Doku)
machen Sub-Agents. Halte deinen eigenen Kontext schlank: lies selbst, was du zum Planen und Prüfen
brauchst, aber schreibe keinen nennenswerten Code selbst.

## Voraussetzungen

- **Effort:** `model`/`effort` aus dem Frontmatter gelten nur für den ersten Turn. Jede Rückmeldung eines
  Sub-Agents startet einen neuen Turn mit der Session-Einstellung. Der Nutzer setzt deshalb vor dem Aufruf
  `/effort xhigh` (danach wieder zurück). Erinnere beim Plan-Schritt in Phase 1 daran.
- **Berechtigungen:** Die autonome Phase braucht den Auto-Modus (oder passende Allow-Regeln), sonst hält
  jeder Berechtigungs-Prompt den Lauf an. Ist kein Auto-Modus aktiv, weise beim „Los“ darauf hin.
- **Node:** Jeder Bash-Aufruf startet eine neue Shell mit zu altem Default-Node. Jeder `npm`-, `npx`- und
  `ng`-Befehl beginnt mit `source ~/.nvm/nvm.sh && nvm use >/dev/null && …` (wie `.claude/launch.json`).
  Das gilt für dich und gehört in jeden Agent-Brief.

## Befugnisse

Der Aufruf dieses Skills ist die ausdrückliche Erlaubnis des Nutzers:

- **Commits:** Du darfst die Arbeitsergebnisse dieser Aufgabe selbstständig stagen und committen. Das geht
  den Regeln „nichts stagen oder committen“ aus den CLAUDE.md-Dateien und projektplan §2.3 Punkt 6 für diese
  Aufgabe vor. Committe ausschließlich Änderungen, die im Rahmen dieser Aufgabe entstanden sind.
- **Entscheidungen:** Nach der Klärungsphase entscheidest du Fragen, die während der Umsetzung auftauchen,
  selbst (auch Fragen der Sub-Agents) und protokollierst sie für den Bericht. Ausnahme: PO-Themen (unten).
- **Schnitt:** Ist ein AP für einen Lauf zu groß, darfst du es nach projektplan §2.5 teilen (z. B. AP 3.4a/b),
  die Teilung in §4 eintragen und nur den ersten Teil umsetzen.

Nicht erlaubt, auch nicht implizit: `git push`, `--amend`, `--no-verify`, `git reset --hard`, `git stash`,
`git checkout`/`git restore` auf fremde Änderungen, Force-Operationen, Branch-Wechsel, Änderungen außerhalb
des Repositories, Veröffentlichungen nach außen (Artifacts, PRs, Issues).

### PO-Themen

Diese Punkte sind laut CLAUDE.md und Projektplan dem Nutzer als Product Owner vorbehalten:

- Entscheidungen, die in `docs/projektplan.md` §3 oder in den Spezifikationen noch auf „Vorschlag“ stehen,
- Kalibrierungsbänder und -ziele (TS §6.9, `calibration-targets`),
- geänderte Golden-Master-Prüfsummen (`market/domain/golden-master.ts`) und `SIM_VERSION`/`schemaVersion`,
- neue Laufzeit-Abhängigkeiten (Eintrag in TS §16),
- Änderungen an Abnahmekriterien oder am Umfang eines AP.

Such in Phase 1 aktiv danach und kläre sie dort. Tauchen sie erst während der Umsetzung auf, nimm den
konservativen Weg: nichts festschreiben, keine Bänder weiten, keine neue Abhängigkeit, Prüfsummen nicht
stillschweigend anpassen. Arbeite am Rest weiter und führe den Punkt im Bericht unter
„Für dich zu entscheiden“ auf. Sub-Agents melden solche Punkte, statt sie zu entscheiden.

## Phase 1: Sichten und klären (mit dem Nutzer)

1. **Ausgangszustand:** `git status` und `git log --oneline -5`. Gibt es bereits uncommittete Änderungen,
   frag in der Klärungsrunde, wie damit umzugehen ist; committe sie nie ungefragt mit.
2. **Aufgabe verstehen:** Lies die relevanten CLAUDE.md-Regeln, Spezifikationen und den betroffenen Code.
   Für breite Suchen darfst du `Explore`-Agents einsetzen. Ist die Aufgabe ein Arbeitspaket aus
   `docs/projektplan.md`, gilt projektplan §2.3/§2.4: Abhängigkeiten erledigt? Entscheidungen, die noch
   „Vorschlag“ sind? Welche Tests verlangt das AP (CLAUDE.md §10 „Planning tests in an AP“)?
3. **Klären:** Sammle **alles**, was für die Umsetzung offen ist (fachliche Fragen, Lücken oder
   Widersprüche in der Spezifikation, PO-Themen, Scope-Grenzen, Umgang mit Vorab-Änderungen) und kläre es
   mit `AskUserQuestion`, gebündelt in möglichst wenigen Runden, jeweils mit deiner Empfehlung als erster
   Option. Frag nichts, was du aus Code, Spezifikation oder vernünftigen Defaults selbst beantworten kannst.
4. **Plan vorlegen:** Zeig den Plan kurz im Chat: Teilaufgaben mit Ziel und Dateien, Reihenfolge und
   Abhängigkeiten, was parallel läuft, geplante Commits, Prüfungen. Erinnere an `/effort xhigh` und den
   Auto-Modus. Hol dir mit einer letzten `AskUserQuestion` das „Los“ (Optionen: „Los“, „Plan anpassen“).
   Bei „Plan anpassen“ den Plan überarbeiten und Schritt 4 wiederholen. Ab dem „Los“ arbeitest du ohne
   Rückfragen.

## Phase 2: Umsetzen (autonom)

### Arbeitsprotokoll

Lege zu Beginn im Scratchpad-Verzeichnis der Session eine Datei `orchestrate-log.md` an und halte sie
aktuell: Plan, Status je Teilaufgabe, laufende Agents, Commits, Entscheidungen (Frage, Entscheidung,
Begründung), PO-Themen, Abweichungen und offene Punkte. Sie übersteht eine Kontext-Zusammenfassung und
neue Turns und ist die Quelle für den Abschlussbericht. Lies sie nach jeder Benachrichtigung, wenn du
den Faden verloren hast.

### Zuschnitt der Teilaufgaben

- Eine Teilaufgabe ist eine in sich geschlossene, prüfbare Einheit, die einen sinnvollen Commit ergibt
  (z. B. Domain-Logik mit Specs, dann Slice, dann Page mit Page-Test, dann Doku).
- Standard ist **sequenziell**. Parallel nur, wenn die Teilaufgaben garantiert disjunkte Dateien ändern und
  keine von der anderen abhängt; höchstens 3 Agents gleichzeitig. Alle arbeiten im selben Working Tree.
- Querschnittsdateien (`messages.xlf`, `docs/projektplan.md`, `stryker.config.mjs`,
  `vitest.mutation.config.ts`, Routen-Dateien) bekommt pro Runde nur ein Agent.
- Nie gleichzeitig: `ng test`, Playwright-MCP (ein Browser), `npm run translate`, Builds und volle Suiten.
  Parallele Agents beschränken sich auf Logic-Specs (`npx vitest run …`) und Lint auf ihre Dateien.

### Sub-Agents starten

`Agent` mit `subagent_type: "general-purpose"`, `model: "opus"`, `effort: "medium"`. Der Brief ist der
einzige Kontext des Agents; er enthält:

- **Ziel** und Abgrenzung (was ausdrücklich nicht dazugehört), **zugewiesene Dateien/Ordner**.
- **Kontext:** relevante Abschnitte der Spezifikation (mit Pfad und §), Vorbilder im Code, Ergebnisse
  vorheriger Teilaufgaben, mit dem Nutzer geklärte Entscheidungen.
- **Umgebung:** Node-Präfix (siehe Voraussetzungen). Befehle, die länger als ein paar Minuten laufen,
  mit `run_in_background` starten.
- **Regeln:**
  - CLAUDE.md des Projekts befolgen.
  - Nur die zugewiesenen Dateien ändern; andere Änderungen im Tree stammen von anderen Agents und werden
    nie zurückgesetzt oder umformatiert. `ng lint --fix` und `prettier --write` nur auf eigene Dateien,
    nie repo-weit.
  - Kein `git add`/`commit`/`stash`/`checkout`/`restore`/`reset`.
  - Den Nutzer nicht fragen: offene Punkte mit einer vertretbaren, möglichst kleinen Annahme lösen und im
    Bericht nennen. PO-Themen (Liste oben in den Brief kopieren) nicht entscheiden, sondern melden; ist
    eine Annahme zu riskant, an der Stelle anhalten und die Frage berichten.
  - Neue Texte: i18n-IDs nach CLAUDE.md §5; `npm run translate` nur, wenn der Brief es dem Agent zuweist.
- **Prüfungen**, die der Agent selbst ausführt: gezielte Specs (`npx vitest run …`; `ng test --watch=false
  --include …` nur, wenn er allein läuft), `ng lint` auf die geänderten Dateien, Prettier auf diese Dateien.
  Keine vollen Suiten.
- **Rückmeldung** im Format: geänderte Dateien; was umgesetzt ist; ausgeführte Prüfungen mit Ergebnis;
  getroffene Annahmen und Entscheidungen; PO-Themen; offene Fragen und bekannte Lücken.

Nach dem Start: Protokoll aktualisieren, den Turn mit einer kurzen Statuszeile beenden (welche Agents
laufen) und auf die Benachrichtigung warten. Nicht pollen, nichts selbst parallel umsetzen.

### Ergebnisse prüfen

Nach jeder Teilaufgabe, bevor du committest:

1. `git status` und `git diff` lesen. Passt die Änderung zum Auftrag, zur Spezifikation und zu den
   CLAUDE.md-Regeln? Gibt es Änderungen außerhalb des Auftrags?
2. Prüfungen selbst laufen lassen (die gezielten Specs, `ng lint` auf die Dateien, bei Typänderungen
   `npm run typecheck`). Verlass dich nicht nur auf den Bericht des Agents. Laufen parallel noch andere
   Agents, berücksichtige, dass deren halbfertige Änderungen Prüfungen stören können.
3. Fachlich nachrechnen, wo Modelle oder Regeln betroffen sind (Plausibilität, nicht nur Doku↔Code).
4. Mängel gehen per `SendMessage` an denselben Agent zurück (er hat den Kontext), mit konkretem Befund.
   Nach zwei erfolglosen Runden: frischer Agent mit präziserem Brief oder neuer Zuschnitt.
   Kleinigkeiten (Tippfehler, Formatierung) darfst du selbst korrigieren.
5. Fragen des Agents beantwortest du selbst und trägst sie ins Entscheidungsprotokoll ein; PO-Themen
   behandelst du wie oben beschrieben.

### Committen

- Pro abgeschlossener, geprüfter Teilaufgabe ein Commit über den `commit`-Skill (Skill-Tool). Übergib als
  Argument die konkreten Pfade der Teilaufgabe und den Hinweis „nicht nachfragen; Zweifelhaftes (fremde
  Änderungen, Build-Ausgaben, Secrets) weglassen und melden“. Nie `git add -A`, wenn parallel noch ein
  Agent arbeitet oder fremde Änderungen im Tree liegen. Ausgelassenes kommt ins Protokoll.
- Commit-Regeln des Projekts gelten (Conventional Commits, Scope wie in den letzten Commits, AP-Nummer im
  Betreff). `messages.xlf` gehört in denselben Commit wie die Texte, die sie ändern (kein eigener
  Übersetzungs-Commit).
- Schlägt ein Hook fehl, Ursache beheben (lassen) und neu committen; nie `--no-verify`.

## Phase 3: Abschließen

1. **Definition of Done:** Bei APs projektplan §2.4 vollständig abarbeiten (Status und Änderungsprotokoll
   in `docs/projektplan.md`, Spezifikation bei Abweichungen nachziehen, i18n, Mutation-Config bei neuem
   Regelcode, Perf-Budgets). Bei UI-Änderungen die Browser-Prüfung aus der CLAUDE.md (Playwright-MCP gegen
   den Dev-Server) durchführen oder von genau einem Agent durchführen lassen. Den Dev-Server mit dem Befehl
   aus `.claude/launch.json` im Hintergrund starten und danach stoppen, den Browser schließen.
2. **Gesamtprüfung:** erst wenn kein Agent mehr Dateien ändert: `npm run verify` mit `run_in_background`
   (läuft länger als das Bash-Limit) und auf die Benachrichtigung warten. Bei Änderungen am Marktmodell
   oder der Welt ist `npm run test:calibration` darin enthalten. Fehler von Agents beheben lassen, als
   eigenen Commit, dann erneut prüfen.
3. Am Ende ist der Working Tree sauber bis auf das, was vorher schon da war. Ist er es nicht, sag warum.

### Abbrechen

Halte an und schreib den Abschlussbericht (bestehende Commits bleiben), wenn:

- sich die Aufgabe als grundlegend anders oder undurchführbar erweist als geklärt,
- ein Fehler auch nach zwei Korrekturrunden und einem frischen Agent nicht behebbar ist,
- der nächste Schritt eine Aktion außerhalb deiner Befugnisse bräuchte.

Unabhängige Teilaufgaben, die davon nicht betroffen sind, darfst du vorher noch abschließen.

## Abschlussbericht

Zum Schluss, auf Deutsch, im Chat:

```
## Abschlussbericht: <Aufgabe>

**Ergebnis:** <1–3 Sätze: was jetzt funktioniert, ob die Aufgabe vollständig erledigt oder abgebrochen ist>

### Commits
- `<hash>` <Betreff>
…
(Nicht gepusht. `npm run verify` wurde auf dem Stand des letzten Commits ausgeführt, nicht auf jedem.)

### Umgesetzt
<pro Teilaufgabe 1–2 Zeilen>

### Entscheidungen während der Umsetzung
| Frage | Entscheidung | Begründung |
…

### Für dich zu entscheiden
<PO-Themen mit dem gewählten konservativen Zwischenstand; oder „keine“>

### Abweichungen von Spezifikation oder Plan
<oder „keine“>

### Prüfungen
<Befehl → Ergebnis, z. B. `npm run verify` → grün; Browser-Prüfung → …>

### Offene Punkte und Empfehlungen
<was nicht erledigt ist, Risiken, was der Nutzer sich ansehen sollte; oder „keine“>

Arbeitsprotokoll: <absoluter Pfad zu orchestrate-log.md>
```

Der Bericht stützt sich auf das Arbeitsprotokoll und auf `git log`, nicht auf das Gedächtnis.
Melde ehrlich, was fehlgeschlagen oder übersprungen ist.
