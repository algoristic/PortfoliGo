# PortfoliGo

Wir entwickeln eine Web-App, mit der man im Browser ein Börsenplanspiel spielen kann: PortfoliGo.

## Technischer Rahmen

Die gesamte App funktioniert Frontend-seitig; es gibt kein Backend.

Die App wird mit Angular und Tailwind CSS entwickelt. Bis auf das Angular CDK kommen keine weiteren Frameworks zum Einsatz. (Lass uns an dieser Stelle einmal den Einsatz von Tools wie Capacitor diskutieren, die Zugriff auf native Funktionen des Geräts, bspw. für Notifications auf einem Smartphone, erlauben.)

Einfache Einstellungen des Nutzers werden im localStorage gespeichert, größere Daten, wie bspw. die Nachweise über die durchgeführten Transaktionen, in der IndexedDB.

Der Anwender kann die Spieldaten eines Spielers jederzeit als base64-kodierte JSON exportieren oder eine solche Datei als neuen Spieler importieren.

## Fachlicher Rahmen

### Spieler

Ein Anwender erstellt einen Spieler. (Ein Anwender soll mehrere Spieler auf demselben Gerät haben können.)

Der Spieler bekommt ein Startkapital und ein monatliches Einkommen - beides wird beim Erstellen des Spielers festgelegt.

### Zeit

Im Spiel verläuft die Zeit in Ticks. Die Geschwindigkeit stellt der Anwender ein und kann sie jederzeit anpassen. Bei der Dauer der Ticks bin ich mir noch nicht ganz sicher. Es könnte aber bspw. bedeuten, dass der Anwender einstellen kann, dass die Zeit im Spiel analog zur Realität verläuft, er aber auch einstellen kann, dass pro Sekunde in der Realität eine Stunde im Spiel vergeht (1h/s) und es eine Skala gibt: 1h/s, 2h/s, 4h/s, 1d/s etc.

Schließt der Anwender das Spiel so wird das Spiel beim nächsten Start so nachberechnet, als wäre die Zeit analog zur Realität weitergelaufen (1s/s).

Der Anwender kann jederzeit die Zeit im Spiel komplett stoppen und erst bei Bedarf wieder starten.

### Spielprinzip / Simulation

Wir stellen den Werteverlauf eines Portfolios im Laufe der Zeit dar.

Der Spieler startet, wie erwähnt, mit einem Startkapital. Monatlich fließt Einkommen in diesen Kapitaltopf. (Offener Punkt: wir müssten für eine realistische Simulation und um einen Anreiz für Investitionen auch den reellen Wertverlust des Bargeldes durch Inflation simulieren. Das sollte aber nicht im ersten Entwurf landen - es sollte für einen spätere Ausbaustufe nach hinten gestellt werden.)

Der Spieler hat sein Geld nun bei einer Bank - er kann aber auch Konten bei anderen Banken aufmachen und dorthin Geld verschieben.

Jeden Monat entstehen dem Spieler Kosten, die vom Konto abgezogen werden: das wären bspw. die Kontoführungsgebühren aber auch Lebenshaltungskosten, die natürlich immer etwas schwanken. (Bei der Simulation von Lebenshaltungskosten machen wir es am Anfang auch nicht zu kompliziert.)

Ebenfalls für eine spätere Ausbaustufe reserviert: Im Laufe des Spieles soll es verschiedene, zufallsgesteuerte Events geben oder Upgrades, die der Spieler freispielen und kaufen kann. Die Events könnten soweit gehen, dass es bspw. unvorhergesehene Kosten gibt, weil bspw. das Auto des Spielers eine Reparatur benötigt und die Upgrades könnten so Dinge sein, wie ein teureres (aber weniger reparaturintensives) Auto, eine teurere Wohnung usw.

#### Kern des Spiels

Bei den Banken hat der Spieler die Möglichkeit ein oder mehrere Depots zu eröffnen. (Jeweils kostenfrei oder mit Gebühren - alle Modelle, die es da so gibt.)

Mit seinem Geld kann der Spieler Assets aus verschiedenen Klassen kaufen:

- über das Depot
  - Aktien
  - ETFs/ETCs
  - CFDs
  - Anleihen
  - Commodities
  - ...
- über sein Barvermögen
  - Edelmetalle
  - ...

Zu diesen Assets gibt es einen Werteverlauf, einen Kurs. Die Gesamtmenge aller Anlagen des Spielers, das Portfolio, hat also einen Gesamtwert, der jederzeit berechnet werden kann. Der Spieler kann seine Assets jederzeit verkaufen, wobei reale Marktbedingungen herrschen: der Trader bekommt einen Spread beim Verkauf, Gold wird nach einem Jahr Haltezeit steuerfrei, Aktien schütten Dividenden aus, Wertpapierverkäufe werden pauschal mit 25% Abgeltungssteuer versehen, ETFs und Fonds verursachen prozentuale Kosten und können ebenfalls ausschüttend oder thesaurierend sein und so weiter und so fort...

Alles: Banken und ihre Namen, Assets, die Kurse, einfach alles wird auf Basis eines Seeds, der beim Erstellen des Spielers festgelegt wird, erzeugt. Das bedeutet, dass, unabhängig von den Entscheidungen des Spielers, die gesamte Simulation um ihn herum bei einem zweiten Spieler mit dem gleichen Seed völlig identisch ablaufen würde.

#### Kern der Simulation

Wie oben bereits erwähnt wird alles zufällig generiert - es gibt generierte Namen, Ticker-Symbole, Kurse etc.

Aber: es werden keine komplett zufälligen Kurse generiert. Vielmehr simulieren wir einen vollständigen Markt mit verschiedensten Einflussfaktoren: so gehören bspw. die Aktien von Unternehmen zu unterschiedlichen Branchen, innerhalb derer eine positive oder negative Entwicklung stattfinden kann. (So könnte bspw. die Technologiebranche blühen und sich der Energiemarkt generell positiv entwickeln aber Konzerne, die im Bereich fossile Energieträger arbeiten, von einer negativen Kursentwicklung betroffen sein.) Ein weiterer Einflussfaktor wäre die globale Region (also amerikanischer Markt, asiatischer Markt, europäischer Markt usw.). Hier bin ich offen für weitere Vorschläge, sodass ein diverser und realistischer Markt entsteht, der unter verschiedensten Gesichtspunkten geclustert werden kann.

### Weitere (unstrukturierte) Ideen

Es gibt einen Newsticker, der einen über Marktentwicklungen informiert.

Prestiges, wie aus Idle-Games, kommen in Form von Erben - die dann auf Basis des bisherigen Spiels (nach Abzug einer Erbschaftssteuer) mit verbesserten Startbedingungen starten.
