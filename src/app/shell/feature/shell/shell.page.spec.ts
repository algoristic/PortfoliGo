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

import { byTestId, click, press, queryByTestId, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
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

  beforeEach(() => {
    localStorage.clear();
    locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
  });

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
});
