import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import { SpeedId } from '@app/clock/domain/models/speed.model';
import { ClockFacade } from '@app/clock/feature/state/clock.facade';
import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';
import { ShellPage } from '@app/shell/feature/shell/shell.page';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, press, queryByTestId, select, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';

// Notifications in the UI (AP 3.6, US-BN-01–03, US-ZT-06) with the worker code of the mini world.
// The first bank run on Monday, 01.04.2030, 06:00 books the living costs (E-19); without start
// capital the salary account turns negative. Expected values are texts and calendar times.

/** Start capital 0: the living costs make the account uncovered, the overdraft limit holds. */
const UNCOVERED: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 0, netIncome: 250_000, livingCosts: 180_000 },
};

/**
 * Living costs of 2.000 € on a net income of 500 €: allowed, the form only shows a hint. The
 * overdraft limit follows the income (TS §7.4), so the debit exceeds it (critical, auto-pause).
 */
const OVERDRAWN: NewPlayer = {
  name: 'Ben',
  seed: 'kupfer-falke-731',
  start: { startCapital: 0, netIncome: 50_000, livingCosts: 200_000 },
};

const HOME_BANK = generateMiniWorld(UNCOVERED.seed).world.banks[0].name;
const BANK_RUN_TEXT = 'Mo., 01.04.2030, 06:00';
const MINUTE_MS = 60_000;

/** Minutes of the day of a time on 01.04.2030 as the clock shows it, e.g. `06:00` → 360. */
function minutesOf(text: string): number {
  const match = /01\.04\.2030, (\d{2}):(\d{2})$/.exec(text);
  if (match === null) {
    throw new Error(`Not a time on 01.04.2030: ${text}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

const BANK_RUN_MINUTES = 6 * 60;

describe('NotificationsPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;

  let locks: FakePlayerLocks;
  let restorePlatform: () => void;

  // some tests open the dashboard with its performance chart
  beforeEach(() => {
    restorePlatform = installChartPlatform();
  });

  async function open(player: NewPlayer, area = 'notifications'): Promise<void> {
    localStorage.clear();
    locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    playerId = (await firstValueFrom(TestBed.inject(PlayersService).createPlayer(player))).profile
      .id;
    await harness.navigateByUrl(`/game/${playerId}/${area}`);
    await run(200);
  }

  afterEach(() => {
    setHidden(false);
    restorePlatform();
  });

  /** Closes the tab and opens the game again after `awayMs` with the same database. */
  async function reopen(awayMs: number): Promise<void> {
    TestBed.resetTestingModule();
    engine = new InProcessEngine({ storage: 'indexed-db', locks, startMs: engine.now() + awayMs });
    harness = await renderRoute(`/game/${playerId}/dashboard`, [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
  }

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  /** Facades of the game area are provided at the shell route. */
  function gameFacade<T>(token: new (...args: never[]) => T): T {
    return harness.fixture.debugElement.query(By.directive(ShellPage)).injector.get(token);
  }

  /** Lets the game run at `speed` from the paused start. */
  async function start(speed: SpeedId): Promise<void> {
    gameFacade(ClockFacade).setSpeed(speed);
    await run(100);
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
  }

  function clock(): string {
    return textOf(byTestId(page, 'shell.header.clock'));
  }

  function bellLabel(): string | null {
    return byTestId(page, 'shell.header.notifications').getAttribute('aria-label');
  }

  function toastTexts(): string[] {
    return [...document.body.querySelectorAll('[data-testid^="toast."] p')].map(textOf);
  }

  function entry(seq: number): HTMLElement {
    return byTestId(page, `notifications.center.entry.${seq}`);
  }

  function entryText(seq: number, part: string): string {
    return textOf(byTestId(entry(seq), `notifications.center.entry.${part}`));
  }

  /** Dialogs render in an overlay outside the page. */
  function body(testId: string): HTMLElement {
    return byTestId(document.body, testId);
  }

  function setHidden(hidden: boolean): void {
    if (hidden) {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('shows an uncovered account as a toast and in the centre', async () => {
    await open(UNCOVERED);
    expect(textOf(byTestId(page, 'notifications.center.empty'))).toContain(
      'Keine Benachrichtigungen',
    );
    expect(bellLabel()).toBe('Benachrichtigungen');

    await start('1h');
    await run(7_000);

    // US-BN-02: a toast with the account; the amount is a model value.
    expect(
      toastTexts().filter((text) =>
        text.startsWith(`Konto nicht gedeckt: Girokonto 0000000001 · ${HOME_BANK} steht bei -`),
      ),
    ).toHaveLength(1);
    expect(toastTexts().some((text) => text.startsWith('Dispo überschritten'))).toBe(false);
    expect(queryByTestId(page, 'shell.header.paused')).toBeNull();

    // US-BN-01: time, category, severity and text; unread highlighted.
    expect(entryText(1, 'title')).toBe('Konto nicht gedeckt');
    expect(entryText(1, 'time')).toBe(BANK_RUN_TEXT);
    expect(entryText(1, 'category')).toBe('Konto');
    expect(entryText(1, 'severity')).toBe('Warnung');
    expect(entryText(1, 'text')).toContain(`Girokonto 0000000001 · ${HOME_BANK} steht bei -`);
    expect(entry(1).hasAttribute('data-unread')).toBe(true);
    expect(queryByTestId(page, 'notifications.center.entry.2')).toBeNull();
    expect(textOf(byTestId(page, 'notifications.center.range'))).toBe('1–1 von 1');
    expect(bellLabel()).toBe('Benachrichtigungen, 1 ungelesen');
    expect(textOf(byTestId(page, 'shell.header.notifications.unread'))).toBe('1');

    const category = byTestId<HTMLSelectElement>(page, 'notifications.center.category');
    await act(() => select(category, 'system'));
    await run(100);
    expect(queryByTestId(page, 'notifications.center.no-matches')).not.toBeNull();
    await act(() => select(category, 'account'));
    await run(100);
    expect(entryText(1, 'title')).toBe('Konto nicht gedeckt');
  });

  it('pauses at the exceeded overdraft limit and names the reason', async () => {
    // US-ZT-06, TS §3.6: critical, auto-pause by default, while visible.
    await open(OVERDRAWN, 'dashboard');
    await start('1h');
    await run(10_000);
    // The clock event of the pause waits for the clock write (TS §3.6).
    await run(100);

    expect(clock()).toBe(BANK_RUN_TEXT);
    expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert: Dispo überschritten');
    expect(bellLabel()).toBe('Benachrichtigungen, 2 ungelesen');
    expect(toastTexts().filter((text) => text.startsWith('Dispo überschritten: '))).toHaveLength(1);
    expect(toastTexts().filter((text) => text.startsWith('Konto nicht gedeckt: '))).toHaveLength(1);

    // Resuming ends the auto-pause and its reason.
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(1_000);
    expect(queryByTestId(page, 'shell.header.paused')).toBeNull();
    expect(clock()).not.toBe(BANK_RUN_TEXT);
  });

  it('runs on past the overdraft once its auto-pause is switched off', async () => {
    await open(OVERDRAWN, 'settings');
    const overdraft = byTestId<HTMLInputElement>(
      page,
      'settings.player.auto-pause.overdraft-limit-exceeded',
    );
    expect(overdraft.getAttribute('role')).toBe('switch');
    expect(overdraft.checked).toBe(true);
    expect(
      byTestId<HTMLInputElement>(page, 'settings.player.auto-pause.account-uncovered').checked,
    ).toBe(false);
    // The UI's own reminder cannot pause the game (TS §12).
    expect(queryByTestId(page, 'settings.player.auto-pause.backup-reminder')).toBeNull();

    await act(() => click(overdraft));
    await run(200);
    expect(overdraft.checked).toBe(false);
    expect(
      engine.current?.received
        .filter((message) => message.type === 'setAutoPause')
        .map((message) => message.payload),
    ).toEqual([{ code: 'overdraft-limit-exceeded', enabled: false }]);

    await start('1h');
    await run(10_000);
    expect(queryByTestId(page, 'shell.header.paused')).toBeNull();
    expect(minutesOf(clock())).toBeGreaterThan(BANK_RUN_MINUTES);
    expect(bellLabel()).toBe('Benachrichtigungen, 2 ungelesen');
  });

  it('reports the hidden period when the app is visible again', async () => {
    // US-BN-03, TS §12: hidden, the game runs in real time and does not pause.
    await open(UNCOVERED, 'dashboard');
    await start('1h');
    await run(5_900);
    gameFacade(ClockFacade).setSpeed('realtime');
    await run(1_000);
    const hiddenFrom = clock();
    expect(minutesOf(hiddenFrom)).toBeLessThan(BANK_RUN_MINUTES);

    setHidden(true);
    await run(10 * MINUTE_MS);
    expect(queryByTestId(document.body, 'notifications.absence-report.from')).toBeNull();

    setHidden(false);
    await run(200);
    expect(textOf(body('notifications.absence-report.from'))).toBe(hiddenFrom);
    expect(textOf(body('notifications.absence-report.to'))).toBe(clock());
    expect(minutesOf(clock())).toBeGreaterThan(BANK_RUN_MINUTES);
    expect(textOf(body('notifications.absence-report.warning-count'))).toBe('Warnungen (1)');
    expect(textOf(body('notifications.absence-report.warning-title'))).toBe('Konto nicht gedeckt');
    // The living costs lower the net worth.
    expect(textOf(body('notifications.absence-report.net-worth-change'))).toMatch(/^−/);
    expect(textOf(body('notifications.absence-report.flow.living-costs'))).not.toBe('0,00 €');

    // Escape closes the dialog (TS §11.10); it does not come back.
    await act(() => press(document.activeElement ?? document.body, 'Escape'));
    await run(200);
    expect(queryByTestId(document.body, 'notifications.absence-report.from')).toBeNull();
  });

  it('reports the catch-up after the app was closed', async () => {
    // US-ZT-04, US-BN-03: the reply to `loadPlayer` comes before the catch-up, the report after it.
    await open(UNCOVERED, 'dashboard');
    await start('realtime');
    // The clock is stored every 5 s while the tick moves (TS §9.2).
    await run(6_000);
    const closedAt = clock();

    await reopen(7 * 60 * MINUTE_MS);
    await run(200);
    expect(queryByTestId(page, 'shell.session-overlay')).toBeNull();
    expect(textOf(body('notifications.absence-report.from'))).toBe(closedAt);
    expect(minutesOf(textOf(body('notifications.absence-report.to')))).toBeGreaterThan(
      BANK_RUN_MINUTES,
    );
    expect(textOf(body('notifications.absence-report.warning-title'))).toBe('Konto nicht gedeckt');
    // Catching up shows no toasts, the report sums them up (TS §3.7).
    expect(toastTexts()).toEqual([]);

    await act(() => click(body('notifications.absence-report.continue')));
    expect(queryByTestId(document.body, 'notifications.absence-report.from')).toBeNull();
  });

  it('lowers the counter when notifications are marked read', async () => {
    await open(OVERDRAWN);
    await start('1h');
    await run(10_000);
    expect(bellLabel()).toBe('Benachrichtigungen, 2 ungelesen');
    expect(entryText(2, 'title')).toBe('Dispo überschritten');
    expect(entryText(2, 'severity')).toBe('Kritisch');

    await act(() => click(byTestId(page, 'notifications.center.entry.2.mark-read')));
    await run(100);
    expect(bellLabel()).toBe('Benachrichtigungen, 1 ungelesen');
    expect(entry(2).hasAttribute('data-unread')).toBe(false);
    expect(entry(1).hasAttribute('data-unread')).toBe(true);

    await act(() => click(byTestId(page, 'notifications.center.mark-all-read')));
    await run(100);
    expect(bellLabel()).toBe('Benachrichtigungen');
    expect(queryByTestId(page, 'shell.header.notifications.unread')).toBeNull();
    expect(entry(1).hasAttribute('data-unread')).toBe(false);
    expect(byTestId<HTMLButtonElement>(page, 'notifications.center.mark-all-read').disabled).toBe(
      true,
    );
  });
});
