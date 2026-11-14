import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import { TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { SIM_VERSION } from '@app/engine/domain/version';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { EXCHANGES } from '@app/world/domain/taxonomy';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, press, queryByTestId, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseEuros } from '../../../../testing/parse';
import { installViewport } from '../../../../testing/viewport';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** Tick of a game time given in UTC: game minutes since 01.01.2020, 00:00 (TS §4.2). */
function tickAt(utcMs: number): number {
  return ((utcMs - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE) * TICKS_PER_MINUTE;
}

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};
const BEN: NewPlayer = { ...ANNA, name: 'Ben', seed: 'silber-fuchs-12' };

/** A new player starts paused at the game start, Monday 01.04.2030, 00:00 (PS US-ZT-01, E-02). */
const GAME_START_TEXT = 'Mo., 01.04.2030, 00:00';

describe('ShellPage', () => {
  let locks: FakePlayerLocks;
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let restorePlatform: () => void;

  beforeEach(() => {
    // the game area opens on the dashboard with its performance chart
    restorePlatform = installChartPlatform();
    localStorage.clear();
    locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
  });

  afterEach(() => restorePlatform());

  /** Opens the app like a new tab of the same browser (shared locks and database). */
  async function openApp(url = '/players', tab = engine): Promise<void> {
    harness = await renderRoute(url, [
      provideInProcessEngineWorker(tab),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
  }

  /** Closes the tab: the worker ends without unloading the player (no `pagehide`). */
  function closeApp(): void {
    TestBed.resetTestingModule();
  }

  async function createPlayer(player: NewPlayer = ANNA): Promise<string> {
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(player));
    return profile.id;
  }

  async function navigate(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    await settle(harness.fixture);
  }

  /** Opens a new player's game; the first clock event follows the first loop passes. */
  async function openGame(player: NewPlayer = ANNA): Promise<string> {
    await openApp();
    const playerId = await createPlayer(player);
    await navigate(`/game/${playerId}`);
    await run(200);
    return playerId;
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  /** Moves the wall clock of the worker; the game runs in the loop passes on the way. */
  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function pressKey(key: string, target: HTMLElement = document.body): Promise<void> {
    await act(() => press(target, key));
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  function current(testId: string): string | null {
    return byTestId(page, testId).getAttribute('aria-current');
  }

  function clock(): string {
    return textOf(byTestId(page, 'shell.header.clock'));
  }

  function overlayHeading(): string | null {
    const heading = queryByTestId(page, 'shell.session-overlay.heading');
    return heading === null ? null : textOf(heading);
  }

  function toastTexts(): string[] {
    return [...document.body.querySelectorAll('[data-testid^="toast."] p')].map(textOf);
  }

  describe('on phones', () => {
    beforeEach(async () => {
      await openGame();
    });

    it('opens the dashboard with the bottom navigation', () => {
      expect(url()).toMatch(/^\/game\/p-[0-9a-f]+\/dashboard$/);
      expect(document.title).toBe('Übersicht · PortfoliGo');
      expect(current('shell.bottom-nav.dashboard')).toBe('page');
      expect(queryByTestId(page, 'shell.side-nav.dashboard')).toBeNull();
      expect(queryByTestId(page, 'shell.header.search')).toBeNull();
    });

    it('navigates with the bottom navigation', async () => {
      await act(() => click(byTestId(page, 'shell.bottom-nav.markets')));
      expect(url()).toMatch(/\/markets$/);
      expect(document.title).toBe('Märkte · PortfoliGo');
      expect(current('shell.bottom-nav.markets')).toBe('page');
      expect(current('shell.bottom-nav.dashboard')).toBeNull();
    });

    it('navigates to the other areas through the more menu', async () => {
      await act(() => click(byTestId(page, 'shell.bottom-nav.more')));
      await act(() => click(byTestId(page, 'shell.bottom-nav.more.taxes')));
      expect(url()).toMatch(/\/taxes$/);
      expect(document.title).toBe('Steuern · PortfoliGo');
      await act(() => click(byTestId(page, 'shell.bottom-nav.more')));
      expect(current('shell.bottom-nav.more.taxes')).toBe('page');
      expect(current('shell.bottom-nav.more.settings')).toBeNull();
    });

    it('switches the player through the player menu', async () => {
      await act(() => click(byTestId(page, 'shell.header.player-menu')));
      await act(() => click(byTestId(page, 'shell.header.player-menu.switch-player')));
      expect(url()).toBe('/players');
      expect(queryByTestId(page, 'players.list.create')).not.toBeNull();
    });

    it('opens the settings through the player menu', async () => {
      await act(() => click(byTestId(page, 'shell.header.player-menu')));
      await act(() => click(byTestId(page, 'shell.header.player-menu.settings')));
      expect(url()).toMatch(/\/settings$/);
      expect(current('shell.header.player-menu.settings')).toBe('page');
    });

    it('offers the export only as a disabled entry', async () => {
      await act(() => click(byTestId(page, 'shell.header.player-menu')));
      const exportItem = byTestId(page, 'shell.header.player-menu.export');
      expect(exportItem.getAttribute('aria-disabled')).toBe('true');
      await act(() => click(exportItem));
      expect(url()).toMatch(/\/dashboard$/);
    });

    it('moves the focus to the content with the skip link', async () => {
      await act(() => click(byTestId(page, 'shell.skip-to-content')));
      expect(document.activeElement).toBe(byTestId(page, 'shell.content'));
    });
  });

  describe('on desktops', () => {
    let restoreViewport: () => void;

    beforeEach(async () => {
      restoreViewport = installViewport(1024);
      await openGame();
    });

    afterEach(() => restoreViewport());

    it('shows the side navigation and the full header instead of the bottom navigation', () => {
      expect(current('shell.side-nav.dashboard')).toBe('page');
      expect(queryByTestId(page, 'shell.bottom-nav.dashboard')).toBeNull();
      expect(queryByTestId(page, 'shell.header.search')).not.toBeNull();
      expect(queryByTestId(page, 'shell.header.net-worth')).not.toBeNull();
    });

    it('navigates with the side navigation', async () => {
      await act(() => click(byTestId(page, 'shell.side-nav.notifications')));
      expect(url()).toMatch(/\/notifications$/);
      expect(document.title).toBe('Benachrichtigungen · PortfoliGo');
      expect(current('shell.side-nav.notifications')).toBe('page');
      expect(current('shell.side-nav.dashboard')).toBeNull();
    });
  });

  describe('game session', () => {
    it('initialises a new player behind the overlay and starts it paused at the game start', async () => {
      await openApp();
      const playerId = await createPlayer();
      // The navigation ends before the engine answers; the harness would wait for the answer.
      await TestBed.inject(Router).navigateByUrl(`/game/${playerId}`);
      harness.fixture.detectChanges();
      expect(overlayHeading()).toBe('Spiel wird geladen');
      expect(textOf(byTestId(page, 'shell.session-status'))).toBe('');

      await settle(harness.fixture);
      await run(200);
      expect(overlayHeading()).toBeNull();
      expect(textOf(byTestId(page, 'shell.session-status'))).toBe('Das Spiel ist bereit.');
      expect(clock()).toBe(GAME_START_TEXT);
      // TS §11.10: the overlay held the focus; it moves to the content like the skip link.
      expect(document.activeElement).toBe(byTestId(page, 'shell.content'));

      await run(10_000);
      expect(clock()).toBe(GAME_START_TEXT);
    });

    it('runs at the chosen speed and applies speed changes at once', async () => {
      await openGame();

      // TS §3.4: 1 min/s (the start speed) runs one game minute per second.
      await pressKey(' ');
      await run(1_500);
      expect(clock()).toBe('Mo., 01.04.2030, 00:01');

      // `+`: 10 min/s from now on, so 1.05 s later ten more minutes.
      await pressKey('+');
      await run(1_050);
      await pressKey(' ');
      await run(200);
      expect(clock()).toBe('Mo., 01.04.2030, 00:11');

      await run(5_000);
      expect(clock()).toBe('Mo., 01.04.2030, 00:11');

      // `−` back to 1 min/s.
      await pressKey('-');
      await pressKey(' ');
      await run(2_500);
      await pressKey(' ');
      await run(200);
      expect(clock()).toBe('Mo., 01.04.2030, 00:13');
    });

    it('ignores the shortcuts while a control has the focus', async () => {
      await openGame();
      const link = byTestId(page, 'shell.header.notifications');
      link.focus();

      await pressKey(' ', link);
      await pressKey('+', link);
      await run(3_000);
      expect(clock()).toBe(GAME_START_TEXT);

      link.blur();
      await pressKey(' ');
      await run(1_500);
      expect(clock()).toBe('Mo., 01.04.2030, 00:01');
    });

    it('keeps the pause after a reload', async () => {
      const playerId = await openGame();
      await pressKey(' ');
      await run(2_500);
      await pressKey(' ');
      await run(200);
      expect(clock()).toBe('Mo., 01.04.2030, 00:02');
      closeApp();

      engine = new InProcessEngine({
        storage: 'indexed-db',
        locks,
        startMs: engine.now() + MS_PER_HOUR,
      });
      await openApp(`/game/${playerId}`);
      await run(200);
      expect(overlayHeading()).toBeNull();
      expect(clock()).toBe('Mo., 01.04.2030, 00:02');
      await run(5_000);
      expect(clock()).toBe('Mo., 01.04.2030, 00:02');
    });

    it('catches up the time since the last visit behind the overlay', async () => {
      const playerId = await openGame();
      await pressKey(' ');
      await run(1_500);
      closeApp();

      // Two hours later in real time: the running game catches up 120 game minutes (TS §3.7).
      engine = new InProcessEngine({
        storage: 'indexed-db',
        locks,
        startMs: engine.now() + 2 * MS_PER_HOUR,
      });
      await openApp(`/game/${playerId}`);
      expect(overlayHeading()).toBe('Nachberechnung');
      expect(textOf(byTestId(page, 'shell.session-overlay.progress'))).toBe('0 %');
      expect(textOf(byTestId(page, 'shell.session-status'))).toBe('');

      await run(200);
      expect(overlayHeading()).toBeNull();
      expect(textOf(byTestId(page, 'shell.session-status'))).toBe('Das Spiel ist bereit.');
      expect(clock()).toBe('Mo., 01.04.2030, 02:00');
    });

    it('tells that the player is open in another tab', async () => {
      await openApp();
      const playerId = await createPlayer();
      const otherTab = await locks.acquire(playerId);
      expect(otherTab).not.toBeNull();

      await navigate(`/game/${playerId}`);
      expect(overlayHeading()).toBe('Spieler bereits geöffnet');
      expect(document.activeElement).toBe(byTestId(page, 'shell.session-overlay'));
      expect(textOf(byTestId(page, 'shell.session-overlay'))).toContain(
        'Dieser Spieler ist bereits in einem anderen Tab geöffnet.',
      );

      await act(() => click(byTestId(page, 'shell.session-overlay.players')));
      expect(url()).toBe('/players');
    });

    it('sends an outdated player back to the player selection', async () => {
      await openApp();
      const database = await openPortfoligoDb();
      await database.put('players', {
        id: 'p-old',
        name: 'Alt',
        seed: 'kupfer-falke-731',
        seedKey: [1, 2, 3, 4],
        start: ANNA.start,
        simVersion: SIM_VERSION - 1,
        createdAt: Date.UTC(2026, 9, 1),
      });
      database.close();

      await navigate('/game/p-old');
      expect(url()).toBe('/players');
      expect(toastTexts()).toContain(
        'Dieser Spieler stammt aus einer älteren Version von PortfoliGo und kann nur noch gelöscht werden.',
      );
    });

    it('sends an unknown player back to the player selection', async () => {
      await openApp('/game/p-missing');
      expect(url()).toBe('/players');
      expect(toastTexts()).toContain('Diesen Spieler gibt es nicht.');
    });

    it('saves the tick of the last clock event at pagehide', async () => {
      const playerId = await openGame();
      await pressKey(' ');
      await run(1_500);
      expect(clock()).toBe('Mo., 01.04.2030, 00:01');

      window.dispatchEvent(new Event('pagehide'));
      expect(JSON.parse(localStorage.getItem('pgo.lastTick') ?? 'null')).toEqual({
        v: 1,
        data: { [playerId]: tickAt(Date.UTC(2030, 3, 1, 0, 1)) },
      });
    });

    it('loads a player at least up to the saved tick', async () => {
      await openApp();
      const playerId = await createPlayer();
      localStorage.setItem(
        'pgo.lastTick',
        JSON.stringify({ v: 1, data: { [playerId]: tickAt(Date.UTC(2030, 3, 1, 0, 30)) } }),
      );

      await navigate(`/game/${playerId}`);
      await run(200);
      expect(clock()).toBe('Mo., 01.04.2030, 00:30');
      await run(5_000);
      expect(clock()).toBe('Mo., 01.04.2030, 00:30');
    });

    it('unloads the player when another one is opened through the URL', async () => {
      const anna = await openGame(ANNA);
      await pressKey(' ');
      await run(1_500);
      expect(clock()).toBe('Mo., 01.04.2030, 00:01');
      const ben = await createPlayer(BEN);

      await navigate(`/game/${ben}/markets`);
      await run(200);
      expect(url()).toBe(`/game/${ben}/markets`);
      expect(clock()).toBe(GAME_START_TEXT);
      expect(locks.held).toEqual([`pgo:player:${ben}`]);

      await navigate(`/game/${anna}`);
      await run(200);
      expect(clock()).toBe('Mo., 01.04.2030, 00:01');
    });
  });
  describe('clock controls', () => {
    let restoreViewport: () => void;

    beforeEach(() => {
      restoreViewport = installViewport(1024);
    });

    afterEach(() => restoreViewport());

    function body<T extends HTMLElement = HTMLElement>(testId: string): T {
      return byTestId<T>(document.body, testId);
    }

    async function chooseSpeed(speed: string): Promise<void> {
      await act(() => click(byTestId(page, 'shell.header.speed')));
      await act(() => click(byTestId(page, `shell.header.speed.${speed}`)));
    }

    async function togglePause(): Promise<void> {
      await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    }

    function region(regionId: string): string {
      return textOf(byTestId(page, `shell.header.markets.${regionId}`));
    }

    async function openJumpDialog(): Promise<void> {
      await act(() => click(byTestId(page, 'shell.header.jump-button')));
    }

    async function enterJumpDate(date: string, time: string): Promise<void> {
      await act(() => click(body('clock.jump-dialog.date-kind')));
      await act(() => typeText(body<HTMLInputElement>('clock.jump-dialog.date'), date));
      await act(() => typeText(body<HTMLInputElement>('clock.jump-dialog.time'), time));
      await act(() => click(body('clock.jump-dialog.submit')));
    }

    it('shows the game time, the speed and the pause at the game start', async () => {
      await openGame();
      expect(clock()).toBe(GAME_START_TEXT);
      expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert');
      // The start speed of a new player is 1 min/s (TS §3.4).
      expect(textOf(byTestId(page, 'shell.header.speed'))).toBe('1 min/s');
      expect(byTestId(page, 'shell.header.toggle-pause').getAttribute('aria-label')).toBe(
        'Weiter (Leertaste)',
      );
      expect(byTestId(page, 'shell.header.toggle-pause').getAttribute('aria-keyshortcuts')).toBe(
        'Space',
      );
    });

    it('resumes, changes the speed at once and pauses with the controls', async () => {
      await openGame();

      await togglePause();
      expect(queryByTestId(page, 'shell.header.paused')).toBeNull();
      await run(1_500);
      expect(clock()).toBe('Mo., 01.04.2030, 00:01');

      // TS §3.4: 10 min/s runs ten game minutes per second from the change on (passes every
      // 16 ms, so 1.05 s cover exactly ten minutes).
      await chooseSpeed('10min');
      expect(textOf(byTestId(page, 'shell.header.speed'))).toBe('10 min/s');
      await run(1_050);
      await togglePause();
      await run(200);
      expect(clock()).toBe('Mo., 01.04.2030, 00:11');
      expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert');

      await act(() => click(byTestId(page, 'shell.header.faster')));
      await run(200);
      expect(textOf(byTestId(page, 'shell.header.speed'))).toBe('1 h/s');
      await act(() => click(byTestId(page, 'shell.header.speed')));
      expect(byTestId(page, 'shell.header.speed.1h').getAttribute('aria-checked')).toBe('true');
      expect(byTestId(page, 'shell.header.speed.10min').getAttribute('aria-checked')).toBe('false');

      await run(5_000);
      expect(clock()).toBe('Mo., 01.04.2030, 00:11');
    });

    it('offers all speeds and stops at the slowest and the fastest', async () => {
      await openGame();
      await act(() => click(byTestId(page, 'shell.header.speed')));
      const labels = [...page.querySelectorAll('[data-testid^="shell.header.speed."]')]
        .filter((item) => item.getAttribute('role') === 'menuitemradio')
        .map(textOf);
      // TS §3.4, PS US-ZT-02
      expect(labels).toEqual([
        'Echtzeit',
        '1 min/s',
        '10 min/s',
        '1 h/s',
        '2 h/s',
        '4 h/s',
        '1 d/s',
        '1 w/s',
      ]);
      await act(() => click(byTestId(page, 'shell.header.speed.realtime')));
      await run(200);
      expect(byTestId<HTMLButtonElement>(page, 'shell.header.slower').disabled).toBe(true);
      await chooseSpeed('1w');
      await run(200);
      expect(byTestId<HTMLButtonElement>(page, 'shell.header.faster').disabled).toBe(true);
      expect(byTestId<HTMLButtonElement>(page, 'shell.header.slower').disabled).toBe(false);
    });

    it('shows the market status per region at the game start and later in the day', async () => {
      await openGame();
      // TS §3.3: Monday 00:00, everything is closed; Asia-Pacific opens first.
      expect(region('asia-pacific')).toContain('Asien-Pazifik: öffnet Mo., 01:00');
      expect(region('europe')).toContain('Europa: öffnet Mo., 09:00');
      expect(region('north-america')).toContain('Nordamerika: öffnet Mo., 15:30');
      expect(region('emerging-markets')).toContain('Schwellenländer: öffnet Mo., 04:45');

      await chooseSpeed('1h');
      await togglePause();
      await run(9_000);
      await togglePause();
      await run(200);
      expect(clock()).toBe('Mo., 01.04.2030, 09:00');
      // 09:00: Europe and India are open, Asia-Pacific has closed until Tuesday.
      expect(region('asia-pacific')).toContain('Asien-Pazifik: öffnet Di., 01:00');
      expect(region('europe')).toContain('Europa: offen bis Mo., 17:30');
      expect(region('north-america')).toContain('Nordamerika: öffnet Mo., 15:30');
      expect(region('emerging-markets')).toContain('Schwellenländer: offen bis Mo., 11:00');
    });

    it('lists all exchanges with status and next opening or closing', async () => {
      await openGame();
      await act(() => click(byTestId(page, 'shell.header.markets')));
      expect(byTestId(page, 'shell.header.markets').getAttribute('aria-expanded')).toBe('true');
      const rows = document.body.querySelectorAll(
        '[data-testid="shell.header.exchanges"] li[data-testid^="shell.header.exchanges."]',
      );
      expect(rows).toHaveLength(EXCHANGES.length);
      const mainhafen = EXCHANGES.find((exchange) => exchange.id === 'exc-de');
      const row = textOf(body('shell.header.exchanges.exc-de'));
      expect(row).toContain(mainhafen?.name);
      expect(row).toContain('Europa');
      expect(row).toContain('geschlossen');
      expect(row).toContain('öffnet Mo., 09:00');
      // TS §3.3: India 04:45–11:00.
      expect(textOf(body('shell.header.exchanges.exc-in'))).toContain('öffnet Mo., 04:45');

      await act(() => click(body('shell.header.exchanges.close')));
      expect(queryByTestId(document.body, 'shell.header.exchanges')).toBeNull();
      expect(byTestId(page, 'shell.header.markets').getAttribute('aria-expanded')).toBe('false');
    });

    it('jumps to the start of the next month and stays paused', async () => {
      await openGame();
      await openJumpDialog();
      // TS §3.7: from Monday 01.04.2030, 00:00.
      expect(textOf(body('clock.jump-dialog.next-open-time'))).toBe('Mo., 01.04.2030, 01:00');
      expect(textOf(body('clock.jump-dialog.next-month-time'))).toBe('Mi., 01.05.2030, 00:00');
      await act(() => click(body('clock.jump-dialog.next-month')));
      await act(() => click(body('clock.jump-dialog.submit')));
      expect(queryByTestId(document.body, 'clock.jump-dialog')).toBeNull();

      await run(200);
      expect(clock()).toBe('Mi., 01.05.2030, 00:00');
      expect(queryByTestId(page, 'shell.header.jump')).toBeNull();
      expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert');
      await run(5_000);
      expect(clock()).toBe('Mi., 01.05.2030, 00:00');
    });

    it('accepts validity animations of the date inputs before the dialog first renders', async () => {
      // WebKit starts the validity animations of `FormField` (Angular forms) for date and time
      // inputs in its next rendering step, possibly before the dialog's first change detection.
      await openGame();
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent): void => {
        errors.push(event.error);
      };
      window.addEventListener('error', onError);
      try {
        click(byTestId(page, 'shell.header.jump-button'));
        for (const testId of ['clock.jump-dialog.date', 'clock.jump-dialog.time']) {
          const animation = new Event('animationstart');
          Object.defineProperty(animation, 'animationName', { value: 'ng-valid' });
          body(testId).dispatchEvent(animation);
        }
        await settle(harness.fixture);
      } finally {
        window.removeEventListener('error', onError);
      }
      expect(errors).toEqual([]);

      await act(() => click(body('clock.jump-dialog.next-month')));
      await act(() => click(body('clock.jump-dialog.submit')));
      await run(200);
      expect(clock()).toBe('Mi., 01.05.2030, 00:00');
    });

    it('jumps to a date at most one year ahead', async () => {
      await openGame();
      await openJumpDialog();
      // PS US-ZT-05: at most one year ahead, so 01.04.2031, 00:00 at the latest (TS §3.7).
      await enterJumpDate('2031-04-01', '00:01');
      expect(textOf(body('clock.jump-dialog.date-error'))).toBe(
        'Du kannst höchstens ein Jahr vorspulen.',
      );
      await enterJumpDate('2030-04-01', '00:00');
      expect(textOf(body('clock.jump-dialog.date-error'))).toBe(
        'Der Zeitpunkt muss nach der aktuellen Spielzeit liegen.',
      );

      await enterJumpDate('2030-04-03', '12:30');
      expect(queryByTestId(document.body, 'clock.jump-dialog')).toBeNull();
      await run(200);
      expect(clock()).toBe('Mi., 03.04.2030, 12:30');
    });

    it('closes the jump dialog without jumping', async () => {
      await openGame();
      await openJumpDialog();
      await act(() => click(body('clock.jump-dialog.decline')));
      expect(queryByTestId(document.body, 'clock.jump-dialog')).toBeNull();
      await run(200);
      expect(clock()).toBe(GAME_START_TEXT);
    });

    it('shows the progress of a jump, locks the controls and cancels it', async () => {
      // One task tick per pass, so the jump takes several passes (TS §3.7).
      engine = new InProcessEngine({ storage: 'indexed-db', locks, config: { passBudgetMs: 0 } });
      await openGame();
      byTestId(page, 'shell.header.jump-button').focus();
      await openJumpDialog();
      await act(() => click(body('clock.jump-dialog.next-month')));
      await act(() => click(body('clock.jump-dialog.submit')));
      engine.timeline.step();
      engine.timeline.step();
      await engine.idle();
      await settle(harness.fixture);

      expect(textOf(byTestId(page, 'shell.header.jump'))).toContain(
        'Vorspulen bis Mi., 01.05.2030, 00:00',
      );
      expect(textOf(byTestId(page, 'shell.header.jump-progress'))).toMatch(/^\d+ %$/);
      expect(queryByTestId(page, 'shell.header.toggle-pause')).toBeNull();
      // TS §11.10: the jump button is gone, so the focus moves to „Abbrechen“ and back afterwards.
      expect(document.activeElement).toBe(byTestId(page, 'shell.header.cancel-jump'));

      await act(() => click(byTestId(page, 'shell.header.cancel-jump')));
      await run(200);
      expect(queryByTestId(page, 'shell.header.jump')).toBeNull();
      expect(clock()).toMatch(/^[A-Z][a-z]\., 0\d\.04\.2030, \d\d:\d\d$/);
      expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert');
      expect(byTestId<HTMLButtonElement>(page, 'shell.header.toggle-pause').disabled).toBe(false);
      expect(document.activeElement).toBe(byTestId(page, 'shell.header.toggle-pause'));
    });
  });

  describe('net worth', () => {
    let restoreViewport: () => void;

    beforeEach(() => {
      restoreViewport = installViewport(1024);
    });

    afterEach(() => restoreViewport());

    function netWorth(): number {
      return parseEuros(textOf(byTestId(page, 'shell.header.net-worth')));
    }

    it('shows the start capital after loading and less by the living costs after the bank run', async () => {
      await openGame();
      // US-SP-01: the start capital of 10.000 € is booked on the home bank's current account.
      expect(netWorth()).toBe(10_000);

      // TS §7.4: the bank run at 06:00 of the first bank working day debits the living costs of
      // April, base 1.800 € with a deviation of at most ±15 %.
      await act(() => click(byTestId(page, 'shell.header.speed')));
      await act(() => click(byTestId(page, 'shell.header.speed.1h')));
      await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
      await run(7_000);
      await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
      await run(200);
      expect(clock()).toMatch(/^Mo\., 01\.04\.2030, 0[6-9]:\d\d$/);
      const livingCosts = 10_000 - netWorth();
      expect(livingCosts).toBeGreaterThanOrEqual(1_800 * 0.85);
      expect(livingCosts).toBeLessThanOrEqual(1_800 * 1.15);
    });

    it('shows the net worth of a loaded player in the player list', async () => {
      const playerId = await openGame();
      await act(() => click(byTestId(page, 'shell.header.player-menu')));
      await act(() => click(byTestId(page, 'shell.header.player-menu.switch-player')));
      expect(url()).toBe('/players');
      expect(parseEuros(textOf(byTestId(page, `players.list.${playerId}.net-worth`)))).toBe(10_000);
    });
  });

  describe('clock controls on phones', () => {
    it('keeps pause, speed and jump in the compact header', async () => {
      await openGame();
      expect(queryByTestId(page, 'shell.header.faster')).toBeNull();
      expect(queryByTestId(page, 'shell.header.jump-button')).toBeNull();
      expect(textOf(byTestId(page, 'shell.header.markets.europe'))).toContain(
        'Europa: öffnet Mo., 09:00',
      );

      await act(() => click(byTestId(page, 'shell.header.speed')));
      await act(() => click(byTestId(page, 'shell.header.speed.jump')));
      await act(() => click(byTestId(document.body, 'clock.jump-dialog.next-open')));
      await act(() => click(byTestId(document.body, 'clock.jump-dialog.submit')));
      await run(200);
      // TS §3.7: the next opening after Monday 00:00 is Asia-Pacific at 01:00.
      expect(clock()).toBe('Mo., 01.04.2030, 01:00');
    });
  });
});
