import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';

import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';

import { installSystemColorScheme, SystemColorScheme } from '../../../../testing/color-scheme';
import { byTestId, click, press, queryByTestId, select, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

/** A new player starts paused at the game start, Monday 01.04.2030, 00:00 (PS US-ZT-01, E-02). */
const GAME_START_TEXT = 'Mo., 01.04.2030, 00:00';

describe('SettingsPage', () => {
  let locks: FakePlayerLocks;
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let system: SystemColorScheme;
  let playerId: string;

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    system = installSystemColorScheme(false);
    locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    await openApp('/players');
    playerId = (await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA))).profile.id;
    await harness.navigateByUrl(`/game/${playerId}/settings`);
    await run(200);
  });

  afterEach(() => {
    setHidden(false);
    system.restore();
    document.documentElement.classList.remove('dark');
  });

  async function openApp(url: string): Promise<void> {
    harness = await renderRoute(url, [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
  }

  /** Closes the tab and opens the settings again with the same localStorage and database. */
  async function reload(): Promise<void> {
    TestBed.resetTestingModule();
    engine = new InProcessEngine({ storage: 'indexed-db', locks, startMs: engine.now() });
    await openApp(`/game/${playerId}/settings`);
    await run(200);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  function input(testId: string): HTMLInputElement {
    return byTestId<HTMLInputElement>(page, testId);
  }

  function selectField(testId: string): HTMLSelectElement {
    return byTestId<HTMLSelectElement>(page, testId);
  }

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function clock(): string {
    return textOf(byTestId(page, 'shell.header.clock'));
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

  it('shows the defaults of a new device: dark appearance and shortcuts on', () => {
    // PS US-UI-01, E-06: dark by default, although the system prefers light here.
    expect(input('settings.device.color-scheme.dark').checked).toBe(true);
    expect(isDark()).toBe(true);
    expect(input('settings.device.shortcuts').checked).toBe(true);
    expect(input('settings.device.shortcuts').getAttribute('role')).toBe('switch');
    expect(input('settings.player.background-mode.realtime').checked).toBe(true);
  });

  it('switches the appearance and follows the system with system', async () => {
    await act(() => click(input('settings.device.color-scheme.light')));
    expect(isDark()).toBe(false);

    await act(() => click(input('settings.device.color-scheme.dark')));
    expect(isDark()).toBe(true);

    await act(() => click(input('settings.device.color-scheme.system')));
    expect(isDark()).toBe(false);
    system.set(true);
    expect(isDark()).toBe(true);
    system.set(false);
    expect(isDark()).toBe(false);

    await act(() => click(input('settings.device.color-scheme.light')));
    system.set(true);
    expect(isDark()).toBe(false);
  });

  it('keeps the device settings after a reload', async () => {
    await act(() => click(input('settings.device.color-scheme.light')));
    await act(() => click(input('settings.device.shortcuts')));

    await reload();
    expect(input('settings.device.color-scheme.light').checked).toBe(true);
    expect(isDark()).toBe(false);
    expect(input('settings.device.shortcuts').checked).toBe(false);
  });

  it('ignores the clock shortcuts while they are switched off', async () => {
    const content = byTestId(page, 'shell.content');
    const togglePause = (): HTMLElement => byTestId(page, 'shell.header.toggle-pause');
    expect(togglePause().getAttribute('aria-label')).toBe('Weiter (Leertaste)');
    expect(togglePause().getAttribute('aria-keyshortcuts')).toBe('Space');

    await act(() => click(input('settings.device.shortcuts')));
    expect(input('settings.device.shortcuts').checked).toBe(false);
    // TS §11.10: switched-off shortcuts are no longer named in the clock bar.
    expect(togglePause().getAttribute('aria-label')).toBe('Weiter');
    expect(togglePause().getAttribute('title')).toBe('Weiter');
    expect(togglePause().hasAttribute('aria-keyshortcuts')).toBe(false);

    content.focus();
    await act(() => press(content, ' '));
    await run(3_000);
    expect(clock()).toBe(GAME_START_TEXT);

    await act(() => click(input('settings.device.shortcuts')));
    content.focus();
    await act(() => press(content, ' '));
    await run(1_500);
    expect(clock()).toBe('Mo., 01.04.2030, 00:01');
  });

  it('lets the time rest in the background after switching the behaviour to pause', async () => {
    // TS §3.6: hidden, the game runs in real time with `realtime` and rests with `pause`.
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(1_500);
    expect(clock()).toBe('Mo., 01.04.2030, 00:01');

    await act(() => click(input('settings.player.background-mode.pause')));
    await run(200);
    expect(
      engine.current?.received
        .filter((message) => message.type === 'setBackgroundMode')
        .map((message) => message.payload),
    ).toEqual([{ mode: 'pause' }]);
    expect(input('settings.player.background-mode.pause').checked).toBe(true);

    // With `realtime`, two minutes of real time would be two game minutes.
    setHidden(true);
    await run(120_000);
    expect(clock()).toBe('Mo., 01.04.2030, 00:01');

    await reload();
    expect(input('settings.player.background-mode.pause').checked).toBe(true);
  });

  it('keeps an own background speed and the deadline and pauses there while hidden', async () => {
    expect(queryByTestId(page, 'settings.player.background-speed')).toBeNull();
    expect(selectField('settings.player.background-pause-after').value).toBe('off');

    await act(() => click(input('settings.player.background-mode.custom-speed')));
    // TS §3.6: a new player has `backgroundSpeed` 1 h/s.
    expect(selectField('settings.player.background-speed').value).toBe('1h');
    await act(() => select(selectField('settings.player.background-speed'), '10min'));
    await act(() => select(selectField('settings.player.background-pause-after'), '15'));
    await run(200);
    expect(
      engine.current?.received
        .filter((message) => message.type === 'setBackgroundMode')
        .map((message) => message.payload),
    ).toEqual([
      { mode: 'custom-speed' },
      { mode: 'custom-speed', speed: '10min' },
      { mode: 'custom-speed', pauseAfter: 15 },
    ]);

    await reload();
    expect(input('settings.player.background-mode.custom-speed').checked).toBe(true);
    expect(selectField('settings.player.background-speed').value).toBe('10min');
    expect(selectField('settings.player.background-pause-after').value).toBe('15');

    // TS §3.6: hidden at the game start, 15 min at 10 min/s = 9,000 ticks = 6 days 6 hours.
    setHidden(true);
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(20 * 60_000);
    setHidden(false);
    await run(200);
    expect(clock()).toBe('So., 07.04.2030, 06:00');
    expect(byTestId(page, 'shell.header.toggle-pause').getAttribute('aria-label')).toBe(
      'Weiter (Leertaste)',
    );

    // The deadline means nothing while the game rests in the background.
    await act(() => click(input('settings.player.background-mode.pause')));
    expect(queryByTestId(page, 'settings.player.background-speed')).toBeNull();
    expect(queryByTestId(page, 'settings.player.background-pause-after')).toBeNull();
  });

  it('counts the time a frozen page misses only in real time', async () => {
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(1_500);
    expect(clock()).toBe('Mo., 01.04.2030, 00:01');

    // TS §3.6: frozen, 4 s at 1 min/s count as 0 ticks instead of 4 (no gap, it is under 5 s).
    await act(() => document.dispatchEvent(new Event('freeze')));
    engine.timeline.suspend(4_000);
    await act(() => document.dispatchEvent(new Event('resume')));
    await run(200);
    expect(
      engine.current?.received
        .filter((message) => message.type === 'setFrozen')
        .map((message) => message.payload),
    ).toEqual([{ frozen: true }, { frozen: false }]);
    expect(clock()).toBe('Mo., 01.04.2030, 00:01');
  });
});
