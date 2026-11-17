import { GlossaryCategory, GlossaryTermId } from '@app/help/domain/models/glossary.model';

import { GlossaryText } from './glossary-texts.model';

// Texts of the glossary (PS US-UI-06) after the game's rules (TS §3, §6, §7, E-11, E-17); `keywords`
// are further search words. AP 6.8b translates them with the other texts.

export function glossaryText(id: GlossaryTermId): GlossaryText {
  switch (id) {
    case 'depot':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-depot-term:Depot`,
        keywords: $localize`:@@uiHelp-glossaryTexts-depot-keywords:Wertpapierdepot`,
        short: $localize`:@@uiHelp-glossaryTexts-depot-short:Das Konto für deine Wertpapiere bei einer Bank. Jedes Depot hat ein eigenes Verrechnungskonto, über das Käufe, Verkäufe und Erträge laufen.`,
        details: $localize`:@@uiHelp-glossaryTexts-depot-details:Du kannst bei jeder Bank beliebig viele Depots sofort und kostenlos eröffnen. Ein Depot lässt sich nur schließen, wenn es leer ist und keine offenen Orders oder Sparpläne hat.`,
      };
    case 'clearing-account':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-clearingAccount-term:Verrechnungskonto`,
        keywords: $localize`:@@uiHelp-glossaryTexts-clearingAccount-keywords:Abrechnungskonto`,
        short: $localize`:@@uiHelp-glossaryTexts-clearingAccount-short:Das Geldkonto eines Depots: Käufe werden davon bezahlt, Verkaufserlöse, Dividenden und Ausschüttungen gehen darauf.`,
        details: $localize`:@@uiHelp-glossaryTexts-clearingAccount-details:Es hat keinen Dispo. Ins Minus kommt es nur durch Belastungen der Bank wie Depotgebühr oder Zinsen, nie durch einen Kauf. Solange es im Minus ist, sind neue Kauforders gesperrt und es fallen Sollzinsen an. Guthaben verzinst die Bank je nach Konditionen monatlich.`,
      };
    case 'current-account':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-currentAccount-term:Girokonto`,
        keywords: $localize`:@@uiHelp-glossaryTexts-currentAccount-keywords:Konto`,
        short: $localize`:@@uiHelp-glossaryTexts-currentAccount-short:Das Konto für den Alltag: Hier gehen Gehalt und Lebenshaltungskosten ein und ab.`,
        details: $localize`:@@uiHelp-glossaryTexts-currentAccount-details:Ein Girokonto bringt keine Zinsen und kostet je nach Bank eine monatliche Kontoführungsgebühr; manche Banken erlassen sie ab einem Geldeingang von außen (Gehalt oder Startkapital). Broker bieten keine Girokonten an.`,
      };
    case 'savings-account':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-savingsAccount-term:Tagesgeld`,
        keywords: $localize`:@@uiHelp-glossaryTexts-savingsAccount-keywords:Tagesgeldkonto Zinsen`,
        short: $localize`:@@uiHelp-glossaryTexts-savingsAccount-short:Ein verzinstes Konto, auf das du jederzeit Geld überweisen und von dem du es jederzeit abziehen kannst.`,
        details: $localize`:@@uiHelp-glossaryTexts-savingsAccount-details:Die Zinsen auf das Guthaben zahlt die Bank je nach Konditionen monatlich oder vierteljährlich aus; sie zählen zu den Kapitalerträgen. Direktbanken zahlen meist mehr als Filialbanken.`,
      };
    case 'salary-account':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-salaryAccount-term:Gehaltskonto`,
        keywords: $localize`:@@uiHelp-glossaryTexts-salaryAccount-keywords:Gehalt Lebenshaltung`,
        short: $localize`:@@uiHelp-glossaryTexts-salaryAccount-short:Das Girokonto, auf dem dein Nettogehalt eingeht und von dem die Lebenshaltungskosten abgehen.`,
        details: $localize`:@@uiHelp-glossaryTexts-salaryAccount-details:Das Gehalt kommt am letzten, die Lebenshaltung geht am ersten Bankarbeitstag des Monats ab, jeweils um 06:00 Uhr. Du kannst das Gehaltskonto wechseln; der Dispo-Rahmen folgt den Gehaltseingängen.`,
      };
    case 'overdraft':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-overdraft-term:Dispo`,
        keywords: $localize`:@@uiHelp-glossaryTexts-overdraft-keywords:Dispositionskredit Dispo-Rahmen Dispozins`,
        short: $localize`:@@uiHelp-glossaryTexts-overdraft-short:Der Rahmen, um den du dein Girokonto überziehen darfst. Für den genutzten Betrag zahlst du Dispozinsen.`,
        details: $localize`:@@uiHelp-glossaryTexts-overdraft-details:Der Rahmen richtet sich nach den Gehaltseingängen bei der Bank in den letzten drei vollen Monaten und wird am ersten Bankarbeitstag jedes Monats angepasst. Er liegt auf dem Girokonto der Bank mit den meisten Gehaltseingängen. Die Zinsen werden taggenau berechnet und monatlich belastet.`,
      };
    case 'tolerated-overdraft':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-toleratedOverdraft-term:Geduldete Überziehung`,
        keywords: $localize`:@@uiHelp-glossaryTexts-toleratedOverdraft-keywords:Überziehung über den Dispo`,
        short: $localize`:@@uiHelp-glossaryTexts-toleratedOverdraft-short:Ein Minus über den Dispo-Rahmen hinaus. Es hat keine Obergrenze, kostet aber einen Zinsaufschlag.`,
        details: $localize`:@@uiHelp-glossaryTexts-toleratedOverdraft-details:Dazu kommt es nur durch Belastungen der Bank, etwa die Lebenshaltung; eigene Überweisungen und Daueraufträge gehen nur bis zum verfügbaren Betrag. Auf den Teil über dem Rahmen gilt der Dispozins plus Aufschlag. Das Spiel pausiert dann standardmäßig (Auto-Pause).`,
      };
    case 'standing-order':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-standingOrder-term:Dauerauftrag`,
        keywords: $localize`:@@uiHelp-glossaryTexts-standingOrder-keywords:Überweisung monatlich`,
        short: $localize`:@@uiHelp-glossaryTexts-standingOrder-short:Eine Überweisung, die jeden Monat am gleichen Tag automatisch zwischen zwei deiner Konten läuft.`,
        details: $localize`:@@uiHelp-glossaryTexts-standingOrder-details:Du wählst einen Tag zwischen 1 und 28; ist er kein Bankarbeitstag, läuft der Auftrag am nächsten. Er läuft um 06:00 Uhr nach Gehalt, Zinsen und Lebenshaltung. Reicht das verfügbare Geld nicht, fällt er für diesen Monat ganz aus.`,
      };
    case 'order-types':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-orderTypes-term:Orderarten`,
        keywords: $localize`:@@uiHelp-glossaryTexts-orderTypes-keywords:Ordertyp Orderart`,
        short: $localize`:@@uiHelp-glossaryTexts-orderTypes-short:Market kauft oder verkauft sofort, Limit nur zu einem Preis, den du festlegst, Stop erst ab einer Kursschwelle, Stop-Limit verbindet beides.`,
        details: $localize`:@@uiHelp-glossaryTexts-orderTypes-details:Orders kannst du jederzeit erteilen. Ausgeführt werden sie nur, solange die Börse des Instruments geöffnet ist; das Spiel prüft sie jede Spielminute. Teilausführungen gibt es nicht.`,
      };
    case 'market-order':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-marketOrder-term:Market-Order`,
        keywords: $localize`:@@uiHelp-glossaryTexts-marketOrder-keywords:Bestens Billigst`,
        short: $localize`:@@uiHelp-glossaryTexts-marketOrder-short:Wird sofort ausgeführt: ein Kauf zum Briefkurs, ein Verkauf zum Geldkurs. Bei geschlossener Börse zur nächsten Eröffnung.`,
        details: $localize`:@@uiHelp-glossaryTexts-marketOrder-details:Du weißt vorher nicht genau, zu welchem Kurs ausgeführt wird. Bei einem Kauf reserviert das Spiel deshalb den geschätzten Kurswert mit 5 % Puffer.`,
      };
    case 'limit-order':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-limitOrder-term:Limit-Order`,
        keywords: $localize`:@@uiHelp-glossaryTexts-limitOrder-keywords:Limit`,
        short: $localize`:@@uiHelp-glossaryTexts-limitOrder-short:Kauft nur, wenn der Briefkurs höchstens beim Limit liegt, und verkauft nur, wenn der Geldkurs mindestens das Limit erreicht.`,
        details: $localize`:@@uiHelp-glossaryTexts-limitOrder-details:Ausgeführt wird zum aktuellen Brief- bzw. Geldkurs, also zum Limit oder besser. Erreicht der Kurs das Limit nie, bleibt die Order bis zum Ende ihrer Gültigkeit offen.`,
      };
    case 'stop-order':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-stopOrder-term:Stop-Order`,
        keywords: $localize`:@@uiHelp-glossaryTexts-stopOrder-keywords:Stop-Loss Stop Buy`,
        short: $localize`:@@uiHelp-glossaryTexts-stopOrder-short:Wird zur Market-Order, sobald der Kurs die Stop-Schwelle erreicht: ein Kauf, wenn der Brief auf den Stop steigt, ein Verkauf, wenn der Geld auf den Stop fällt.`,
        details: $localize`:@@uiHelp-glossaryTexts-stopOrder-details:Ein Verkaufs-Stop begrenzt Verluste (Stop-Loss). Öffnet die Börse mit einer Kurslücke unter dem Stop, wird zum Eröffnungskurs verkauft, also auch deutlich unter dem Stop.`,
      };
    case 'stop-limit-order':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-stopLimitOrder-term:Stop-Limit-Order`,
        keywords: $localize`:@@uiHelp-glossaryTexts-stopLimitOrder-keywords:Stop Limit`,
        short: $localize`:@@uiHelp-glossaryTexts-stopLimitOrder-short:Wird beim Erreichen der Stop-Schwelle zu einer Limit-Order mit dem Limit, das du festgelegt hast.`,
        details: $localize`:@@uiHelp-glossaryTexts-stopLimitOrder-details:So schützt du dich vor einer Ausführung weit unter dem Stop. Dafür kann es passieren, dass die Order nach dem Auslösen gar nicht ausgeführt wird.`,
      };
    case 'validity':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-validity-term:Gültigkeit`,
        keywords: $localize`:@@uiHelp-glossaryTexts-validity-keywords:gültig bis Tagesende Widerruf`,
        short: $localize`:@@uiHelp-glossaryTexts-validity-short:Wie lange eine Order aktiv bleibt: bis Tagesende, bis zu einem Datum oder bis auf Widerruf.`,
        details: $localize`:@@uiHelp-glossaryTexts-validity-details:„Bis Tagesende“ endet mit dem nächsten Handelsschluss der Börse, „bis Datum“ um 24:00 Uhr des Datums. Auch „bis auf Widerruf“ endet spätestens nach einem Jahr. Danach verfällt die Order und die Reservierung wird frei.`,
      };
    case 'reservation':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-reservation-term:Reservierung`,
        keywords: $localize`:@@uiHelp-glossaryTexts-reservation-keywords:reserviert verfügbar`,
        short: $localize`:@@uiHelp-glossaryTexts-reservation-short:Geld, das eine offene Kauforder auf dem Verrechnungskonto vormerkt. Es steht für andere Zahlungen nicht mehr zur Verfügung.`,
        details: $localize`:@@uiHelp-glossaryTexts-reservation-details:Limit-Orders reservieren Limit mal Stück plus Kosten, Market- und Stop-Orders den geschätzten Kurswert mit 5 % Puffer plus Kosten, Betragsorders den Betrag. Wird die Order ausgeführt, storniert oder läuft sie ab, wird die Reservierung frei.`,
      };
    case 'spread':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-spread-term:Spread`,
        keywords: $localize`:@@uiHelp-glossaryTexts-spread-keywords:Geldkurs Briefkurs Geld Brief Bid Ask`,
        short: $localize`:@@uiHelp-glossaryTexts-spread-short:Der Abstand zwischen Brief (Kaufkurs) und Geld (Verkaufskurs). Wer kauft und gleich wieder verkauft, verliert ihn.`,
        details: $localize`:@@uiHelp-glossaryTexts-spread-details:Kleine, schwankende Werte haben einen größeren Spread als große, ruhige; ist die Börse des Basiswerts geschlossen, wird er breiter. Neobroker handeln über einen Market Maker und schlagen auf Geld und Brief einen kleinen Aufschlag auf. Positionen bewertet das Spiel zum Geldkurs.`,
      };
    case 'fractional-shares':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-fractionalShares-term:Bruchstücke`,
        keywords: $localize`:@@uiHelp-glossaryTexts-fractionalShares-keywords:Bruchteile Teilstücke`,
        short: $localize`:@@uiHelp-glossaryTexts-fractionalShares-short:Anteile einer Aktie oder eines ETFs unter einem ganzen Stück, zum Beispiel 0,25 Stück.`,
        details: $localize`:@@uiHelp-glossaryTexts-fractionalShares-details:Sparpläne kaufen immer Bruchstücke. Einzelne Orders mit Bruchstücken bieten nur die Neobroker an; verkaufen kannst du Bruchstücke bei jeder Bank.`,
      };
    case 'savings-plan':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-savingsPlan-term:Sparplan`,
        keywords: $localize`:@@uiHelp-glossaryTexts-savingsPlan-keywords:Sparrate`,
        short: $localize`:@@uiHelp-glossaryTexts-savingsPlan-short:Kauft jeden Monat am gewählten Tag automatisch für einen festen Betrag ein ETF oder eine Aktie.`,
        details: $localize`:@@uiHelp-glossaryTexts-savingsPlan-details:Ausgeführt wird zum Handelsbeginn der Börse am Ausführungstag (1 bis 28) oder am nächsten Handelstag, immer in Bruchstücken. Das Geld kommt vom Verrechnungskonto des Depots; reicht es nicht, fällt die Ausführung aus. Nicht jedes Wertpapier ist sparplanfähig.`,
      };
    case 'order-fee':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-orderFee-term:Ordergebühr und Börsenentgelt`,
        keywords: $localize`:@@uiHelp-glossaryTexts-orderFee-keywords:Orderentgelt Börsengebühr Kosten Transaktionskosten`,
        short: $localize`:@@uiHelp-glossaryTexts-orderFee-short:Die Kosten einer Order: das Orderentgelt der Bank (fest, prozentual oder beides) und ein festes Börsenentgelt.`,
        details: $localize`:@@uiHelp-glossaryTexts-orderFee-details:Die Kosten zeigt das Order-Ticket vor dem Absenden. Sie erhöhen beim Kauf die Anschaffungskosten und mindern beim Verkauf den Erlös. Sparpläne haben eigene Kosten und kein Börsenentgelt.`,
      };
    case 'custody-fee':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-custodyFee-term:Depotgebühr`,
        keywords: $localize`:@@uiHelp-glossaryTexts-custodyFee-keywords:Depotkosten`,
        short: $localize`:@@uiHelp-glossaryTexts-custodyFee-short:Eine jährliche Gebühr mancher Banken für das Führen des Depots, oft ein Prozentsatz des Depotwerts mit Mindestbetrag.`,
        details: $localize`:@@uiHelp-glossaryTexts-custodyFee-details:Sie wird vierteljährlich am ersten Bankarbeitstag für das abgelaufene Quartal vom Verrechnungskonto abgebucht, auch wenn es dadurch ins Minus geht. Viele Direktbanken und Broker verlangen keine.`,
      };
    case 'ter':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-ter-term:TER`,
        keywords: $localize`:@@uiHelp-glossaryTexts-ter-keywords:Total Expense Ratio Laufende Kosten Gesamtkostenquote`,
        short: $localize`:@@uiHelp-glossaryTexts-ter-short:Die laufenden Kosten eines ETFs pro Jahr in Prozent. Sie werden nicht abgebucht, sondern stecken im Kurs.`,
        details: $localize`:@@uiHelp-glossaryTexts-ter-details:Das Spiel zieht die TER Tag für Tag anteilig vom Fondswert ab. Ein ETF mit 0,2 % TER bleibt so im Jahr um etwa 0,2 % hinter seinem Index zurück.`,
      };
    case 'dividend':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-dividend-term:Dividende`,
        keywords: $localize`:@@uiHelp-glossaryTexts-dividend-keywords:Gewinnausschüttung Dividendenrendite`,
        short: $localize`:@@uiHelp-glossaryTexts-dividend-short:Ein Teil des Unternehmensgewinns, den eine Aktie an ihre Aktionäre auszahlt.`,
        details: $localize`:@@uiHelp-glossaryTexts-dividend-details:Die Dividende wird 20 Handelstage vor dem Ex-Tag angekündigt. Gutgeschrieben wird sie auf dem Verrechnungskonto, versteuert wie alle Kapitalerträge. Je nach Region zahlen Unternehmen jährlich, halbjährlich oder vierteljährlich.`,
      };
    case 'ex-date':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-exDate-term:Ex-Tag und Zahltag`,
        keywords: $localize`:@@uiHelp-glossaryTexts-exDate-keywords:Ex-Datum Stichtag Zahltag`,
        short: $localize`:@@uiHelp-glossaryTexts-exDate-short:Am Ex-Tag wird der Kurs um die Dividende abgeschlagen; die Dividende bekommt, wer die Aktie am Vortag zum Handelsschluss hielt. Gezahlt wird zwei Bankarbeitstage später.`,
        details: $localize`:@@uiHelp-glossaryTexts-exDate-details:Ein Kauf am Ex-Tag bekommt die Dividende also nicht mehr, ein Verkauf am Ex-Tag behält sie. Bruchstücke erhalten sie anteilig.`,
      };
    case 'etf':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-etf-term:ETF`,
        keywords: $localize`:@@uiHelp-glossaryTexts-etf-keywords:Exchange Traded Fund Indexfonds Fonds`,
        short: $localize`:@@uiHelp-glossaryTexts-etf-short:Ein börsengehandelter Fonds, der einen Index nachbildet. Mit einem Kauf legst du in alle Werte des Index zugleich an.`,
        details: $localize`:@@uiHelp-glossaryTexts-etf-details:Der Kurs folgt dem Index abzüglich der TER und einer kleinen Abweichung je nach Nachbildung. Außerhalb der Handelszeit zeigt das Spiel einen indikativen Wert.`,
      };
    case 'distribution':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-distribution-term:Ausschüttung und Thesaurierung`,
        keywords: $localize`:@@uiHelp-glossaryTexts-distribution-keywords:ausschüttend thesaurierend Ertragsverwendung`,
        short: $localize`:@@uiHelp-glossaryTexts-distribution-short:Ein ausschüttender ETF zahlt die Dividenden seiner Werte aus, ein thesaurierender legt sie sofort wieder an.`,
        details: $localize`:@@uiHelp-glossaryTexts-distribution-details:Vor Kosten und Steuern bringen beide fast dasselbe. Ausschüttungen landen auf dem Verrechnungskonto und werden sofort versteuert; ihre Höhe kündigt der Fonds nicht vorher an.`,
      };
    case 'index':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-index-term:Index`,
        keywords: $localize`:@@uiHelp-glossaryTexts-index-keywords:Kursindex Performanceindex Leitindex`,
        short: $localize`:@@uiHelp-glossaryTexts-index-short:Eine Kennzahl für die Entwicklung einer Gruppe von Aktien, gewichtet nach ihrem Börsenwert. Ein Kursindex zeigt nur die Kurse, ein Performanceindex rechnet die Dividenden wieder ein.`,
        details: $localize`:@@uiHelp-glossaryTexts-index-details:Die Gewichte einzelner Werte sind begrenzt, und die Zusammensetzung bleibt im Spiel fest. Einen Index selbst kannst du nicht kaufen, wohl aber einen ETF darauf.`,
      };
    case 'capital-gains-tax':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-capitalGainsTax-term:Abgeltungsteuer`,
        keywords: $localize`:@@uiHelp-glossaryTexts-capitalGainsTax-keywords:Kapitalertragsteuer Steuer`,
        short: $localize`:@@uiHelp-glossaryTexts-capitalGainsTax-short:Im Spiel gelten pauschal 25 % auf Kapitalerträge über dem Sparerpauschbetrag, ohne Solidaritätszuschlag und Kirchensteuer.`,
        details: $localize`:@@uiHelp-glossaryTexts-capitalGainsTax-details:Kapitalerträge sind Zinsen, Dividenden, Ausschüttungen und Kursgewinne abzüglich Kursverluste. Die Bank behält die Steuer bei jedem Ertrag sofort ein und erstattet sie sofort, wenn ein späterer Verlust sie mindert.`,
      };
    case 'saver-allowance':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-saverAllowance-term:Sparerpauschbetrag`,
        keywords: $localize`:@@uiHelp-glossaryTexts-saverAllowance-keywords:Freibetrag Freistellungsauftrag`,
        short: $localize`:@@uiHelp-glossaryTexts-saverAllowance-short:Bis 1.000 € Kapitalerträge im Jahr bleiben steuerfrei. Was du davon nicht nutzt, verfällt am Jahresende.`,
        details: $localize`:@@uiHelp-glossaryTexts-saverAllowance-details:Im Spiel gilt er automatisch für alle Banken zusammen, ein Freistellungsauftrag ist nicht nötig.`,
      };
    case 'loss-pot':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-lossPot-term:Verlusttopf`,
        keywords: $localize`:@@uiHelp-glossaryTexts-lossPot-keywords:Verlustvortrag Verlustverrechnung`,
        short: $localize`:@@uiHelp-glossaryTexts-lossPot-short:Verluste werden mit späteren Erträgen verrechnet. Bleibt das Jahr im Minus, wird der Verlust ins nächste Jahr vorgetragen.`,
        details: $localize`:@@uiHelp-glossaryTexts-lossPot-details:Vereinfacht gibt es im Spiel einen einzigen Topf für alle Erträge über alle Banken: Auch Aktienverluste mindern die Steuer auf Zinsen und Dividenden. Der Vortrag verfällt nicht.`,
      };
    case 'lot-fifo':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-lotFifo-term:Lot und FIFO`,
        keywords: $localize`:@@uiHelp-glossaryTexts-lotFifo-keywords:Lots First in first out Einstandskurs Anschaffungskosten`,
        short: $localize`:@@uiHelp-glossaryTexts-lotFifo-short:Jeder Kauf ist ein Lot mit eigenen Anschaffungskosten. Verkauft wird nach FIFO: die zuerst gekauften Stücke zuerst.`,
        details: $localize`:@@uiHelp-glossaryTexts-lotFifo-details:Die Anschaffungskosten enthalten die Kaufkosten, der Einstandskurs ist Anschaffungskosten durch Stück. Der realisierte Gewinn ist der Erlös nach Kosten minus die Anschaffungskosten der verkauften Stücke.`,
      };
    case 'net-worth':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-netWorth-term:Gesamtvermögen`,
        keywords: $localize`:@@uiHelp-glossaryTexts-netWorth-keywords:Vermögen`,
        short: $localize`:@@uiHelp-glossaryTexts-netWorth-short:Alle Kontostände (ein Minus zählt negativ) plus der Wert deiner Wertpapiere zum Geldkurs.`,
        details: $localize`:@@uiHelp-glossaryTexts-netWorth-details:Gehalt und Lebenshaltung verändern es genauso wie Kursbewegungen. Wie gut du angelegt hast, zeigt deshalb die zeitgewichtete Rendite.`,
      };
    case 'twr':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-twr-term:Zeitgewichtete Rendite`,
        keywords: $localize`:@@uiHelp-glossaryTexts-twr-keywords:TWR Rendite Performance`,
        short: $localize`:@@uiHelp-glossaryTexts-twr-short:Die Rendite deines Vermögens ohne den Einfluss von Gehalt und Lebenshaltung. Sie misst nur, wie sich dein angelegtes Geld entwickelt hat.`,
        details: $localize`:@@uiHelp-glossaryTexts-twr-details:Das Spiel rechnet für jeden Tag die Rendite und verkettet die Tage: Gehalt zählt ab Tagesbeginn mit, Lebenshaltung erst am Tagesende. Zinsen, Gebühren, Steuern und Dividenden zählen zur Rendite. Tage mit negativem Vermögen zählen nicht; fehlt so mindestens die Hälfte der Tage, zeigt das Spiel „–“. Aufs Jahr umgerechnet wird sie erst nach 365 Tagen.`,
      };
    case 'benchmark':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-benchmark-term:Benchmark`,
        keywords: $localize`:@@uiHelp-glossaryTexts-benchmark-keywords:Vergleich Vergleichsindex Ohne Anlegen`,
        short: $localize`:@@uiHelp-glossaryTexts-benchmark-short:Ein Vergleichsdepot, das alles Geld ohne Kosten und Steuern in den Welt-Performanceindex steckt. Daran siehst du, ob du besser warst als der Markt.`,
        details: $localize`:@@uiHelp-glossaryTexts-benchmark-details:Startkapital und jeder Nettozufluss werden zum Tagesschluss gekauft, Abflüsse dort verkauft. Ihre Rendite ist deshalb genau die des Index, solange das Vergleichsdepot Geld hat. Die zweite Vergleichsgröße „Ohne Anlegen“ zeigt, was du hättest, wenn alles auf dem Gehaltskonto geblieben wäre.`,
      };
    case 'volatility':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-volatility-term:Volatilität`,
        keywords: $localize`:@@uiHelp-glossaryTexts-volatility-keywords:Schwankung Risiko`,
        short: $localize`:@@uiHelp-glossaryTexts-volatility-short:Wie stark ein Kurs schwankt: die Standardabweichung der täglichen Renditen der letzten 252 Handelstage, auf ein Jahr hochgerechnet.`,
        details: $localize`:@@uiHelp-glossaryTexts-volatility-details:Höhere Volatilität heißt größere Ausschläge in beide Richtungen.`,
      };
    case 'beta':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-beta-term:Beta`,
        keywords: $localize`:@@uiHelp-glossaryTexts-beta-keywords:Marktrisiko`,
        short: $localize`:@@uiHelp-glossaryTexts-beta-short:Wie stark ein Wert im Schnitt mit dem Markt mitgeht. Beta 1 bewegt sich wie der Welt-Kursindex, 1,5 um die Hälfte stärker, 0,5 halb so stark.`,
        details: $localize`:@@uiHelp-glossaryTexts-beta-details:Berechnet aus den täglichen Renditen der letzten 252 Handelstage im Vergleich zum Welt-Kursindex.`,
      };
    case 'market-cap':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-marketCap-term:Marktkapitalisierung`,
        keywords: $localize`:@@uiHelp-glossaryTexts-marketCap-keywords:Börsenwert Marktwert`,
        short: $localize`:@@uiHelp-glossaryTexts-marketCap-short:Der Börsenwert eines Unternehmens: Anzahl der Aktien mal Kurs.`,
        details: $localize`:@@uiHelp-glossaryTexts-marketCap-details:Nach dem Börsenwert der frei handelbaren Aktien richten sich die Gewichte in den Indizes. ETFs zeigen stattdessen ihr Fondsvolumen.`,
      };
    case 'savings-rate':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-savingsRate-term:Sparquote`,
        keywords: $localize`:@@uiHelp-glossaryTexts-savingsRate-keywords:sparen Einnahmen Ausgaben`,
        short: $localize`:@@uiHelp-glossaryTexts-savingsRate-short:Der Anteil deiner Einnahmen in einem Monat, der nach allen Ausgaben übrig bleibt.`,
        details: $localize`:@@uiHelp-glossaryTexts-savingsRate-details:Einnahmen sind Einkommen, Zinsen und Dividenden, Ausgaben sind Lebenshaltung, Gebühren, Sollzinsen und Steuern. Überweisungen zwischen deinen Konten zählen nicht. Die Quote kann negativ sein.`,
      };
    case 'trading-hours':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-tradingHours-term:Handelszeiten`,
        keywords: $localize`:@@uiHelp-glossaryTexts-tradingHours-keywords:Börsenzeiten Börse geöffnet geschlossen`,
        short: $localize`:@@uiHelp-glossaryTexts-tradingHours-short:Börsen handeln nur zu festen Zeiten an Werktagen: Asien-Pazifik 01:00–07:00, Europa 09:00–17:30, Nordamerika 15:30–22:00 Uhr Spielzeit.`,
        details: $localize`:@@uiHelp-glossaryTexts-tradingHours-details:Schwellenländer haben je Börse eigene Zeiten. Am Wochenende ist alles geschlossen, Feiertage gibt es im Spiel nicht. Außerhalb der Handelszeit nimmt die Bank Orders an und führt sie zur nächsten Eröffnung aus.`,
      };
    case 'game-speed':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-gameSpeed-term:Spielgeschwindigkeit`,
        keywords: $localize`:@@uiHelp-glossaryTexts-gameSpeed-keywords:Geschwindigkeit Tempo schneller langsamer`,
        short: $localize`:@@uiHelp-glossaryTexts-gameSpeed-short:Wie schnell die Spielzeit läuft: von Echtzeit bis zu einer Woche pro Sekunde. Mit der Pause hält sie an.`,
        details: $localize`:@@uiHelp-glossaryTexts-gameSpeed-details:Das Spiel beginnt am Montag, 01.04.2030, pausiert. Bei hohen Geschwindigkeiten laufen Gehalt, Zinsen, Orders und Kurse genauso ab wie in Echtzeit, nur schneller.`,
      };
    case 'jump':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-jump-term:Vorspulen`,
        keywords: $localize`:@@uiHelp-glossaryTexts-jump-keywords:Sprung springen`,
        short: $localize`:@@uiHelp-glossaryTexts-jump-short:Lässt die Spielzeit im Schnelldurchlauf bis zur nächsten Börsenöffnung, zum nächsten Monatsanfang oder zu einem Datum laufen, höchstens ein Jahr.`,
        details: $localize`:@@uiHelp-glossaryTexts-jump-details:Alles wird dabei wie im normalen Spielverlauf verarbeitet. Du kannst das Vorspulen abbrechen; eine Auto-Pause beendet es.`,
      };
    case 'auto-pause':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-autoPause-term:Auto-Pause`,
        keywords: $localize`:@@uiHelp-glossaryTexts-autoPause-keywords:automatische Pause`,
        short: $localize`:@@uiHelp-glossaryTexts-autoPause-short:Das Spiel hält bei wichtigen Ereignissen von selbst an, standardmäßig, wenn der Dispo-Rahmen überschritten wird.`,
        details: $localize`:@@uiHelp-glossaryTexts-autoPause-details:In den Einstellungen legst du je Ereignis fest, ob es pausiert. Die Auto-Pause greift auch beim Vorspulen, nie aber bei der Nachberechnung nach dem Öffnen.`,
      };
    case 'background-modes':
      return {
        term: $localize`:@@uiHelp-glossaryTexts-backgroundModes-term:Verhalten im Hintergrund`,
        keywords: $localize`:@@uiHelp-glossaryTexts-backgroundModes-keywords:Hintergrund Hintergrundmodus Nachberechnung`,
        short: $localize`:@@uiHelp-glossaryTexts-backgroundModes-short:Was die Spielzeit tut, wenn du die App verlässt: in Echtzeit weiterlaufen, pausieren, mit der gewählten oder einer eigenen Geschwindigkeit weiterlaufen.`,
        details: $localize`:@@uiHelp-glossaryTexts-backgroundModes-details:Ist die App geschlossen, läuft die Zeit außer im Modus „Pausieren“ in Echtzeit weiter und wird beim nächsten Öffnen nachberechnet. Optional pausiert das Spiel nach einer Frist im Hintergrund.`,
      };
  }
}

export function glossaryCategoryLabel(category: GlossaryCategory): string {
  switch (category) {
    case 'accounts':
      return $localize`:@@uiHelp-glossaryTexts-category-accounts:Konten`;
    case 'orders':
      return $localize`:@@uiHelp-glossaryTexts-category-orders:Orders und Handel`;
    case 'costs':
      return $localize`:@@uiHelp-glossaryTexts-category-costs:Kosten`;
    case 'income':
      return $localize`:@@uiHelp-glossaryTexts-category-income:Erträge, ETFs und Indizes`;
    case 'taxes':
      return $localize`:@@uiHelp-glossaryTexts-category-taxes:Steuern`;
    case 'performance':
      return $localize`:@@uiHelp-glossaryTexts-category-performance:Vermögen und Kennzahlen`;
    case 'time':
      return $localize`:@@uiHelp-glossaryTexts-category-time:Spielzeit`;
  }
}
