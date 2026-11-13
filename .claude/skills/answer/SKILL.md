---
name: answer
description: >-
  Beantwortet eine Frage des Nutzers, ohne etwas zu ändern und ohne einen Plan zu erstellen.
  Nur auf ausdrücklichen Aufruf mit /answer <Frage>.
argument-hint: <Frage>
disable-model-invocation: true
---

# Nur antworten

Beantworte diese Frage:

$ARGUMENTS

## Regeln

- **Nichts ändern:** kein Edit, Write oder NotebookEdit, keine Befehle mit Seiteneffekten
  (installieren, bauen, formatieren, `git add`/`commit`/`checkout`, Dateien anlegen oder löschen),
  keine Artifacts, Dokumente oder Memories, keine Sub-Agents, die etwas ändern.
- **Kein Plan:** keinen Plan erstellen und keine Plan-Datei schreiben, kein ExitPlanMode,
  keine Aufgabenliste. Das gilt auch im Plan-Modus: dort direkt im Chat antworten.
- **Lesen ist erlaubt,** wenn die Antwort davon abhängt: Dateien lesen, suchen, `git log`/`diff`/
  `status`, Doku in `docs/`. Nur so viel, wie die Antwort braucht.
- **Keine Rückfragen,** außer die Frage ist ohne Klärung nicht sinnvoll zu beantworten.
- **Antwort:** direkt und knapp, in der Sprache der Frage. Belege mit `datei:zeile`, wo es hilft.
  Würde die Antwort eine Änderung nahelegen, beschreibe sie, setze sie aber nicht um.
