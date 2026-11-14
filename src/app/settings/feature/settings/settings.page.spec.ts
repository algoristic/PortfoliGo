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
import {
  provideRecordingFileDownload,
  RecordingFileDownload,
} from '@app/shared/data-access/testing/recording-file-download';
import { VALUE_FLASH_ENABLED } from '@app/shared/ui/value-flash/value-flash.config';

import { installSystemColorScheme, SystemColorScheme } from '../../../../testing/color-scheme';
import {
  byTestId,
  click,
  press,
  queryByTestId,
  select,
  textOf,
  typeText,
} from '../../../../testing/dom';
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
  let downloads: RecordingFileDownload;
  /** Wall clock of the `PlayersService` (creation, export and reminder times). */
  let wallClock: number;

  beforeEach(async () => {
    localStorage.clear();
    wallClock = Date.UTC(2026, 10, 13, 12);
    downloads = new RecordingFileDownload();
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
    document.documentElement.classList.remove('dark', 'colors-blue-orange');
  });

  async function openApp(url: string): Promise<void> {
    harness = await renderRoute(url, [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks, clock: () => wallClock }),
      provideRecordingFileDownload(downloads),
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

  function isBlueOrange(): boolean {
    return document.documentElement.classList.contains('colors-blue-orange');
  }

  function toastTexts(): string[] {
    return [...document.body.querySelectorAll('[data-testid^="toast."] p')].map(textOf);
  }

  /** The CDK copies through `execCommand`, which jsdom lacks: the platform boundary. */
  async function withClipboard(result: boolean, action: () => Promise<void>): Promise<string[]> {
    const copied: string[] = [];
    const execCommand = document.execCommand;
    document.execCommand = (command: string): boolean => {
      copied.push(`${command}:${[...document.querySelectorAll('textarea')].at(-1)?.value}`);
      return result;
    };
    try {
      await action();
    } finally {
      document.execCommand = execCommand;
    }
    return copied;
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

  it('shows the complete page: device and player sections with their defaults', () => {
    // PS US-UI-09: on the device appearance, colours, highlight, shortcuts and notifications.
    expect(input('settings.device.change-colors.green-red').checked).toBe(true);
    expect(isBlueOrange()).toBe(false);
    expect(textOf(byTestId(page, 'settings.device.change-colors.up'))).toBe('+1,23 %');
    expect(textOf(byTestId(page, 'settings.device.change-colors.down'))).toBe('−0,45 %');
    expect(input('settings.device.price-highlight').checked).toBe(true);
    expect(input('settings.device.price-highlight').getAttribute('role')).toBe('switch');

    // TS §12: toast and browser defaults per code, grouped by category.
    const notification = (code: string, channel: string): HTMLInputElement =>
      input(`settings.device.notifications.${code}.${channel}`);
    expect(notification('order-executed', 'toast').checked).toBe(true);
    expect(notification('order-executed', 'browser').checked).toBe(false);
    expect(notification('account-uncovered', 'browser').checked).toBe(true);
    expect(notification('dividend-received', 'toast').checked).toBe(false);
    expect(notification('backup-reminder', 'toast').checked).toBe(true);
    expect(queryByTestId(page, 'settings.device.notifications.backup-reminder.browser')).toBeNull();
    expect(notification('order-rejected', 'browser').getAttribute('aria-label')).toBe(
      'Order abgelehnt: Browser',
    );
    expect(
      byTestId(page, 'settings.device.notifications.system').contains(
        notification('backup-reminder', 'toast'),
      ),
    ).toBe(true);

    // For the player: name, seed, background, auto-pause, backup.
    expect(textOf(byTestId(page, 'settings.player.name'))).toBe('Anna');
    expect(textOf(byTestId(page, 'settings.player.seed'))).toBe('kupfer-falke-731');
    expect(input('settings.player.background-mode.realtime').checked).toBe(true);
    expect(input('settings.player.auto-pause.overdraft-limit-exceeded').checked).toBe(true);
    expect(queryByTestId(page, 'settings.player.export')).not.toBeNull();
  });

  it('switches the gain and loss colours at once and the price highlight of the app', async () => {
    await act(() => click(input('settings.device.change-colors.blue-orange')));
    expect(isBlueOrange()).toBe(true);
    await act(() => click(input('settings.device.change-colors.green-red')));
    expect(isBlueOrange()).toBe(false);

    const flashEnabled = TestBed.inject(VALUE_FLASH_ENABLED);
    expect(flashEnabled()).toBe(true);
    await act(() => click(input('settings.device.price-highlight')));
    expect(flashEnabled()).toBe(false);
  });

  it('renames the player and copies the seed', async () => {
    await act(() => click(byTestId(page, 'settings.player.rename')));
    const name = byTestId<HTMLInputElement>(document.body, 'players.rename-dialog.name');
    expect(name.value).toBe('Anna');
    typeText(name, 'Anna Depot');
    await act(() => click(byTestId(document.body, 'players.rename-dialog.submit')));
    expect(textOf(byTestId(page, 'settings.player.name'))).toBe('Anna Depot');
    const players = await firstValueFrom(TestBed.inject(PlayersService).loadPlayers());
    expect(players.map((player) => player.name)).toEqual(['Anna Depot']);

    const copied = await withClipboard(true, () =>
      act(() => click(byTestId(page, 'settings.player.copy-seed'))),
    );
    expect(copied).toEqual(['copy:kupfer-falke-731']);
    expect(toastTexts()).toContain('Kopiert: Der Seed ist in der Zwischenablage.');

    await withClipboard(false, () => act(() => click(byTestId(page, 'settings.player.copy-seed'))));
    expect(toastTexts()).toContain(
      'Das Kopieren hat nicht geklappt. Markiere den Seed und kopiere ihn selbst.',
    );

    await reload();
    expect(textOf(byTestId(page, 'settings.player.name'))).toBe('Anna Depot');
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
    await act(() => click(input('settings.device.change-colors.blue-orange')));
    await act(() => click(input('settings.device.price-highlight')));
    await act(() => click(input('settings.device.shortcuts')));
    await act(() => click(input('settings.device.notifications.order-executed.toast')));
    await act(() => click(input('settings.device.notifications.year-closed.browser')));

    document.documentElement.classList.remove('colors-blue-orange');
    await reload();
    expect(input('settings.device.color-scheme.light').checked).toBe(true);
    expect(isDark()).toBe(false);
    expect(input('settings.device.change-colors.blue-orange').checked).toBe(true);
    expect(isBlueOrange()).toBe(true);
    expect(input('settings.device.price-highlight').checked).toBe(false);
    expect(TestBed.inject(VALUE_FLASH_ENABLED)()).toBe(false);
    expect(input('settings.device.shortcuts').checked).toBe(false);
    expect(input('settings.device.notifications.order-executed.toast').checked).toBe(false);
    expect(input('settings.device.notifications.year-closed.browser').checked).toBe(true);
    // TS §9.3: only deviations from TS §12 are stored.
    expect(JSON.parse(localStorage.getItem('pgo.settings') ?? 'null')).toEqual({
      v: 1,
      data: {
        appearance: { colorScheme: 'light', changeColors: 'blue-orange' },
        motion: { priceHighlight: false },
        shortcuts: { enabled: false },
        notifications: {
          toast: { 'order-executed': false },
          browser: { 'year-closed': true },
        },
      },
    });
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

  describe('export (US-EX-01, TS §10.2)', () => {
    /** `PLAYERS_CLOCK` of `providePlayersTestPorts`: 13.11.2026, 12:00 UTC. */
    const NOW = Date.UTC(2026, 10, 13, 12);

    function storedBackup(): unknown {
      return JSON.parse(localStorage.getItem('pgo.backup') ?? 'null');
    }

    it('saves the export as a file and in the clipboard and notes the time', async () => {
      expect(textOf(byTestId(page, 'settings.player.last-export'))).toBe(
        'Auf diesem Gerät noch nicht exportiert.',
      );
      expect(selectField('settings.player.backup-interval').value).toBe('7');

      await act(() => click(byTestId(page, 'settings.player.export')));
      // TS §10.1: <name>-<game date of the export tick>.pgo
      expect(textOf(byTestId(document.body, 'players.export-dialog.file-name'))).toBe(
        'Anna-2030-04-01.pgo',
      );
      expect(storedBackup()).toBeNull();
      await act(() => click(byTestId(document.body, 'players.export-dialog.download')));

      expect(downloads.files).toHaveLength(1);
      const [file] = downloads.files;
      expect(file.fileName).toBe('Anna-2030-04-01.pgo');
      expect(file.type).toBe('application/octet-stream');
      // base64 of gzip starts with its magic bytes 1f 8b 08 (RFC 1952)
      expect(file.content).toMatch(/^H4sI[A-Za-z0-9+/]+=*$/);
      expect(queryByTestId(document.body, 'players.export-dialog.file-name')).toBeNull();
      expect(storedBackup()).toEqual({
        v: 1,
        data: { intervalDays: 7, players: { [playerId]: { exportedAt: NOW } } },
      });
      expect(textOf(byTestId(page, 'settings.player.last-export'))).toMatch(
        /^Zuletzt auf diesem Gerät exportiert: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/,
      );

      // The CDK copies through `execCommand`, which jsdom lacks: the platform boundary.
      const copied: string[] = [];
      const execCommand = document.execCommand;
      document.execCommand = (command: string): boolean => {
        copied.push(`${command}:${[...document.querySelectorAll('textarea')].at(-1)?.value}`);
        return true;
      };
      try {
        await act(() => click(byTestId(page, 'settings.player.export')));
        await act(() => click(byTestId(document.body, 'players.export-dialog.copy')));
      } finally {
        document.execCommand = execCommand;
      }
      expect(copied).toEqual([`copy:${file.content}`]);
      expect(toastTexts()).toContain('Der Spielstand ist in der Zwischenablage.');
    });

    it('keeps the game when copying fails and lets the reminder be switched off', async () => {
      const execCommand = document.execCommand;
      document.execCommand = (): boolean => false;
      try {
        await act(() => click(byTestId(page, 'settings.player.export')));
        await act(() => click(byTestId(document.body, 'players.export-dialog.copy')));
      } finally {
        document.execCommand = execCommand;
      }
      expect(textOf(byTestId(document.body, 'players.export-dialog.copy-error'))).toBe(
        'Das Kopieren hat nicht geklappt. Lade den Spielstand stattdessen als Datei herunter.',
      );
      await act(() => click(byTestId(document.body, 'players.export-dialog.close')));
      expect(storedBackup()).toBeNull();

      await act(() => select(selectField('settings.player.backup-interval'), 'off'));
      expect(storedBackup()).toEqual({ v: 1, data: { intervalDays: null, players: {} } });
      await reload();
      expect(selectField('settings.player.backup-interval').value).toBe('off');
    });

    it('imports the exported file as a new player with the same game day and settings', async () => {
      await act(() => click(input('settings.player.background-mode.pause')));
      await act(() => click(input('settings.player.auto-pause.account-uncovered')));
      await run(200);
      await act(() => click(byTestId(page, 'settings.player.export')));
      await act(() => click(byTestId(document.body, 'players.export-dialog.download')));
      const [file] = downloads.files;

      await harness.navigateByUrl('/players');
      await settle(harness.fixture);
      await act(() => click(byTestId(page, 'players.list.import')));
      typeText(
        byTestId<HTMLTextAreaElement>(document.body, 'players.import-dialog.text'),
        file.content,
      );
      await act(() => click(byTestId(document.body, 'players.import-dialog.submit')));

      const players = await firstValueFrom(TestBed.inject(PlayersService).loadPlayers());
      const imported = players.find(({ name }) => name === 'Anna (Import)');
      expect(imported).toBeDefined();
      const importedId = imported?.id ?? '';
      expect(importedId).not.toBe(playerId);
      await run(200);
      expect(clock()).toBe(GAME_START_TEXT);
      expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert');

      await harness.navigateByUrl(`/game/${importedId}/settings`);
      await run(200);
      expect(input('settings.player.background-mode.pause').checked).toBe(true);
      // PS US-UI-09: the player settings travel with the export, the seed with the world.
      expect(input('settings.player.auto-pause.account-uncovered').checked).toBe(true);
      expect(textOf(byTestId(page, 'settings.player.seed'))).toBe('kupfer-falke-731');
    });
  });

  describe('backup reminder (US-EX-03, TS §9.3)', () => {
    const DAY_MS = 86_400_000;
    const REMINDER =
      'Sicherung empfohlen: Exportiere deinen Spielstand unter Einstellungen → Spieler. So bleibt er erhalten, auch wenn der Browser seine Daten löscht.';

    it('reminds seven days after the creation, then a day later again, not after an export', async () => {
      expect(toastTexts()).not.toContain(REMINDER);

      wallClock += 7 * DAY_MS - 60_000;
      await reload();
      expect(toastTexts()).not.toContain(REMINDER);

      wallClock += 60_000;
      await reload();
      expect(toastTexts()).toContain(REMINDER);

      // „später“: the next reminder waits a day
      wallClock += DAY_MS - 60_000;
      await reload();
      expect(toastTexts()).not.toContain(REMINDER);
      wallClock += 60_000;
      await reload();
      expect(toastTexts()).toContain(REMINDER);

      await act(() => click(byTestId(page, 'settings.player.export')));
      await act(() => click(byTestId(document.body, 'players.export-dialog.download')));
      wallClock += 6 * DAY_MS;
      await reload();
      expect(toastTexts()).not.toContain(REMINDER);
      wallClock += DAY_MS;
      await reload();
      expect(toastTexts()).toContain(REMINDER);
    });

    it('does not remind while its toast is switched off on this device', async () => {
      // TS §12: `backup-reminder` is a toast only; switched off, it is neither shown nor noted.
      await act(() => click(input('settings.device.notifications.backup-reminder.toast')));
      wallClock += 7 * DAY_MS;
      await reload();
      expect(toastTexts()).not.toContain(REMINDER);

      await act(() => click(input('settings.device.notifications.backup-reminder.toast')));
      await reload();
      expect(toastTexts()).toContain(REMINDER);
    });

    it('does not remind with the reminder switched off', async () => {
      await act(() => select(selectField('settings.player.backup-interval'), 'off'));
      wallClock += 30 * DAY_MS;
      await reload();
      expect(toastTexts()).not.toContain(REMINDER);
    });
  });
});
