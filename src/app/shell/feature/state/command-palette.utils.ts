import { SpeedId, SPEEDS } from '@app/clock/domain/models/speed.model';
import { speedLabel } from '@app/clock/ui/labels/speed-labels';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { instrumentKindLabel } from '@app/market/ui/labels/taxonomy-labels';
import { PalettePage } from '@app/shell/domain/models/command.model';

import {
  CommandPaletteDialogData,
  CommandPaletteEntry,
} from '../dialog-command-palette/dialog-command-palette.model';

/** What the palette needs to know when it opens. */
export interface CommandPaletteContext {
  paused: boolean | null;
  speed: SpeedId | null;
  jumping: boolean;
  openAccountCount: number;
  instruments: readonly Instrument[];
}

interface PageEntry {
  page: PalettePage;
  icon: string;
  label: string;
  keywords: string;
}

/**
 * Entries of the palette (PS US-UI-05): the actions first, then the pages, the speeds and the
 * change of player; instruments with their purchase only for a query. Actions the game can't take
 * right now are left out (a jump during a jump, a transfer with fewer than two open accounts).
 */
export function commandPaletteData(context: CommandPaletteContext): CommandPaletteDialogData {
  return {
    commands: [
      ...actionEntries(context),
      ...pageEntries(),
      ...speedEntries(context.speed),
      switchPlayerEntry(),
    ],
    instruments: instrumentEntries(context.instruments),
  };
}

function actionEntries(context: CommandPaletteContext): CommandPaletteEntry[] {
  const entries: CommandPaletteEntry[] = [];
  if (context.paused !== null) {
    entries.push({
      id: 'toggle-pause',
      group: 'action',
      label: context.paused
        ? $localize`:@@featureShell-commandPalette-resume:Weiter`
        : $localize`:@@featureShell-commandPalette-pause:Pause`,
      hint: null,
      icon: context.paused ? 'play-fill' : 'pause-fill',
      keywords: words(
        $localize`:@@featureShell-commandPalette-pauseKeywords:Pause Weiter Spielzeit Uhr anhalten fortsetzen`,
      ),
      command: { kind: 'toggle-pause' },
    });
  }
  if (context.paused !== null && !context.jumping) {
    entries.push({
      id: 'jump',
      group: 'action',
      label: $localize`:@@featureShell-commandPalette-jump:Vorspulen …`,
      hint: null,
      icon: 'fast-forward',
      keywords: words(
        $localize`:@@featureShell-commandPalette-jumpKeywords:Sprung Zeit überspringen Monatsanfang Börsenöffnung`,
      ),
      command: { kind: 'jump' },
    });
  }
  if (context.openAccountCount >= 2) {
    entries.push({
      id: 'transfer',
      group: 'action',
      label: $localize`:@@featureShell-commandPalette-transfer:Überweisen …`,
      hint: null,
      icon: 'arrow-left-right',
      keywords: words(
        $localize`:@@featureShell-commandPalette-transferKeywords:Überweisung Geld Konto`,
      ),
      command: { kind: 'transfer' },
    });
  }
  entries.push(
    {
      id: 'open-account',
      group: 'action',
      label: $localize`:@@featureShell-commandPalette-openAccount:Konto eröffnen …`,
      hint: null,
      icon: 'plus-circle',
      keywords: words(
        $localize`:@@featureShell-commandPalette-openAccountKeywords:Depot Girokonto Tagesgeld neu`,
      ),
      command: { kind: 'open-account' },
    },
    {
      id: 'export',
      group: 'action',
      label: $localize`:@@featureShell-commandPalette-export:Spielstand exportieren …`,
      hint: null,
      icon: 'box-arrow-up',
      keywords: words(
        $localize`:@@featureShell-commandPalette-exportKeywords:Export sichern Sicherung Backup`,
      ),
      command: { kind: 'export' },
    },
  );
  return entries;
}

function pageEntries(): CommandPaletteEntry[] {
  const pages: PageEntry[] = [
    {
      page: 'dashboard',
      icon: 'grid-1x2',
      label: $localize`:@@featureShell-commandPalette-dashboard:Übersicht`,
      keywords: $localize`:@@featureShell-commandPalette-dashboardKeywords:Dashboard Start Gesamtvermögen Rendite`,
    },
    {
      page: 'markets',
      icon: 'graph-up',
      label: $localize`:@@featureShell-commandPalette-markets:Märkte`,
      keywords: $localize`:@@featureShell-commandPalette-marketsKeywords:Börse Indizes Kurse`,
    },
    {
      page: 'markets/screener',
      icon: 'funnel',
      label: $localize`:@@featureShell-commandPalette-screener:Screener`,
      keywords: $localize`:@@featureShell-commandPalette-screenerKeywords:Aktien ETFs suchen filtern`,
    },
    {
      page: 'markets/watchlist',
      icon: 'star',
      label: $localize`:@@featureShell-commandPalette-watchlist:Watchlist`,
      keywords: $localize`:@@featureShell-commandPalette-watchlistKeywords:Beobachtungsliste Merkliste`,
    },
    {
      page: 'portfolio',
      icon: 'briefcase',
      label: $localize`:@@featureShell-commandPalette-portfolio:Depot`,
      keywords: $localize`:@@featureShell-commandPalette-portfolioKeywords:Portfolio Positionen Wertpapiere`,
    },
    {
      page: 'accounts',
      icon: 'bank',
      label: $localize`:@@featureShell-commandPalette-accounts:Konten`,
      keywords: $localize`:@@featureShell-commandPalette-accountsKeywords:Girokonto Tagesgeld Daueraufträge Monatsübersicht Erträge Kosten`,
    },
    {
      page: 'banks',
      icon: 'building',
      label: $localize`:@@featureShell-commandPalette-banks:Bankenvergleich`,
      keywords: $localize`:@@featureShell-commandPalette-banksKeywords:Banken Konditionen Gebühren`,
    },
    {
      page: 'orders',
      icon: 'list-check',
      label: $localize`:@@featureShell-commandPalette-orders:Orders`,
      keywords: $localize`:@@featureShell-commandPalette-ordersKeywords:Orderbuch Sparpläne Historie`,
    },
    {
      page: 'taxes',
      icon: 'receipt',
      label: $localize`:@@featureShell-commandPalette-taxes:Steuern`,
      keywords: $localize`:@@featureShell-commandPalette-taxesKeywords:Sparerpauschbetrag Verlusttopf Abgeltungsteuer`,
    },
    {
      page: 'notifications',
      icon: 'bell',
      label: $localize`:@@featureShell-commandPalette-notifications:Benachrichtigungen`,
      keywords: $localize`:@@featureShell-commandPalette-notificationsKeywords:Meldungen Nachrichten`,
    },
    {
      page: 'settings',
      icon: 'gear',
      label: $localize`:@@featureShell-commandPalette-settings:Einstellungen`,
      keywords: $localize`:@@featureShell-commandPalette-settingsKeywords:Tastenkürzel Farben Hintergrund Auto-Pause Seed`,
    },
    {
      page: 'help',
      icon: 'book',
      label: $localize`:@@featureShell-commandPalette-help:Glossar`,
      keywords: $localize`:@@featureShell-commandPalette-helpKeywords:Hilfe Begriffe Erklärungen`,
    },
    {
      page: 'about',
      icon: 'info-circle',
      label: $localize`:@@featureShell-commandPalette-about:Über PortfoliGo`,
      keywords: $localize`:@@featureShell-commandPalette-aboutKeywords:Lizenzen Version Rechtliches Hinweis`,
    },
  ];
  return pages.map(({ page, icon, label, keywords }) => ({
    id: `page-${page.replace('/', '-')}`,
    group: 'page',
    label,
    hint: null,
    icon,
    keywords: words(keywords),
    command: { kind: 'navigate', page },
  }));
}

function speedEntries(current: SpeedId | null): CommandPaletteEntry[] {
  return SPEEDS.map(({ id }) => ({
    id: `speed-${id}`,
    group: 'action',
    label: $localize`:@@featureShell-commandPalette-speed:Geschwindigkeit ${speedLabel(id)}:speed:`,
    hint: id === current ? $localize`:@@featureShell-commandPalette-speedCurrent:aktuell` : null,
    icon: 'speedometer2',
    keywords: words(
      $localize`:@@featureShell-commandPalette-speedKeywords:Tempo schneller langsamer`,
    ),
    command: { kind: 'speed', speed: id },
  }));
}

function switchPlayerEntry(): CommandPaletteEntry {
  return {
    id: 'switch-player',
    group: 'action',
    label: $localize`:@@featureShell-commandPalette-switchPlayer:Spieler wechseln`,
    hint: null,
    icon: 'people',
    keywords: words(
      $localize`:@@featureShell-commandPalette-switchPlayerKeywords:Spielerauswahl beenden`,
    ),
    command: { kind: 'switch-player' },
  };
}

function instrumentEntries(instruments: readonly Instrument[]): CommandPaletteEntry[] {
  const buyKeywords = words(
    $localize`:@@featureShell-commandPalette-buyKeywords:Kaufen Order Ticket`,
  );
  const views = instruments.map((instrument) => ({
    instrument,
    keywords: [instrument.ticker, ...(instrument.isin === null ? [] : [instrument.isin])],
    hint: `${instrument.ticker} · ${instrumentKindLabel(instrument.kind)}`,
  }));
  const opens = views.map(({ instrument, keywords, hint }): CommandPaletteEntry => ({
    id: `instrument-${instrument.id}`,
    group: 'instrument',
    label: instrument.name,
    hint,
    icon: 'graph-up-arrow',
    keywords,
    command: { kind: 'instrument', instrumentId: instrument.id },
  }));
  // Indices can't be bought (TS §7.5); purchases come after the pages of the instruments.
  const buys = views
    .filter(({ instrument }) => instrument.kind !== 'index')
    .map(({ instrument, keywords }): CommandPaletteEntry => ({
      id: `buy-${instrument.id}`,
      group: 'action',
      label: $localize`:@@featureShell-commandPalette-buy:${instrument.name}:name: kaufen …`,
      hint: instrument.ticker,
      icon: 'bag-plus',
      keywords: [...buyKeywords, ...keywords],
      command: { kind: 'buy', instrumentId: instrument.id },
    }));
  return [...opens, ...buys];
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}
