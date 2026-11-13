import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IDBPDatabase } from 'idb';

import { TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';

import { byTestId, click, queryByTestId, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseEuros } from '../../../../testing/parse';
import {
  FakeBroadcastHub,
  providePlayersTestPorts,
} from '../../data-access/testing/fake-players-ports';

const MS_PER_MINUTE = 60_000;

/** Tick of a game time given in UTC: game minutes since 01.01.2020, 00:00 (TS §4.2). */
function tickAt(utcMs: number): number {
  return ((utcMs - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE) * TICKS_PER_MINUTE;
}

const ANNA = 'p-anna';
const BEN = 'p-ben';
/** Wednesday, 03.04.2030, 09:30 in the game. */
const ANNA_TICK = tickAt(Date.UTC(2030, 3, 3, 9, 30));
/** Built from local date parts, so the page shows 12.11.2026, 14:30 in every time zone. */
const ANNA_LAST_SEEN = new Date(2026, 10, 12, 14, 30).getTime();

interface StoredPlayer {
  id: string;
  name: string;
  createdAt?: number;
  simVersion?: number;
  /** Clock and snapshot as the worker writes them once it loaded the player. */
  runtime?: { tick: number; lastSeenAt: number; schemaVersion?: number; netWorth?: number };
}

async function storePlayer(database: IDBPDatabase, player: StoredPlayer): Promise<void> {
  await database.put('players', {
    id: player.id,
    name: player.name,
    seed: 'kupfer-falke-731',
    seedKey: [1, 2, 3, 4],
    start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
    simVersion: player.simVersion ?? SIM_VERSION,
    createdAt: player.createdAt ?? Date.UTC(2026, 9, 1),
  });
  if (player.runtime !== undefined) {
    const { tick, lastSeenAt, schemaVersion, netWorth } = player.runtime;
    await database.put('runtime', {
      playerId: player.id,
      tick,
      speed: '1h',
      paused: true,
      lastSeenAt,
      ...(netWorth === undefined ? {} : { netWorth }),
    });
    await database.put('snapshots', {
      playerId: player.id,
      tick,
      simVersion: SIM_VERSION,
      schemaVersion: schemaVersion ?? SCHEMA_VERSION,
      state: {},
    });
  }
}

describe('PlayersPage', () => {
  let database: IDBPDatabase;
  let locks: FakePlayerLocks;
  let hub: FakeBroadcastHub;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    locks = new FakePlayerLocks();
    hub = new FakeBroadcastHub();
    database = await openPortfoligoDb();
  });

  afterEach(() => database.close());

  async function open(): Promise<void> {
    harness = await renderRoute('/players', [providePlayersTestPorts({ locks, hub })]);
    page = harness.fixture.nativeElement;
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  function shownPlayerIds(): string[] {
    return [...page.querySelectorAll<HTMLElement>('li[data-testid^="players.list."]')].map((item) =>
      (item.dataset['testid'] ?? '').replace('players.list.', ''),
    );
  }

  function toastTexts(): string[] {
    return [...document.body.querySelectorAll('[data-testid^="toast."] p')].map(textOf);
  }

  function lastPlayerId(): unknown {
    const entry = localStorage.getItem('pgo.lastPlayerId');
    return entry === null ? undefined : (JSON.parse(entry) as { data: unknown }).data;
  }

  function confirmButton(): HTMLElement {
    return byTestId(document.body, 'dialog-confirm.confirm');
  }

  describe('with players', () => {
    beforeEach(async () => {
      await storePlayer(database, {
        id: ANNA,
        name: 'Anna',
        runtime: { tick: ANNA_TICK, lastSeenAt: ANNA_LAST_SEEN, netWorth: 1_234_567 },
      });
      await storePlayer(database, { id: BEN, name: 'Ben' });
      localStorage.setItem('pgo.lastPlayerId', JSON.stringify({ v: 1, data: ANNA }));
      await open();
    });

    it('lists the players with game time and last use, the last used one first and highlighted', () => {
      expect(document.title).toBe('Spielerauswahl · PortfoliGo');
      expect(shownPlayerIds()).toEqual([ANNA, BEN]);
      expect(textOf(byTestId(page, 'players.list.p-anna.name'))).toBe('Anna');
      expect(textOf(byTestId(page, 'players.list.p-anna.game-time'))).toBe(
        'Mi., 03.04.2030, 09:30',
      );
      expect(textOf(byTestId(page, 'players.list.p-anna.last-seen'))).toBe('12.11.2026, 14:30');
      expect(parseEuros(textOf(byTestId(page, 'players.list.p-anna.net-worth')))).toBe(12_345.67);
      expect(queryByTestId(page, 'players.list.p-anna.last-played')).not.toBeNull();
      // Never loaded by the worker: no game time and no last use yet.
      expect(textOf(byTestId(page, 'players.list.p-ben.game-time'))).toBe('–');
      expect(textOf(byTestId(page, 'players.list.p-ben.last-seen'))).toBe('–');
      expect(textOf(byTestId(page, 'players.list.p-ben.net-worth'))).toBe('–');
      expect(queryByTestId(page, 'players.list.p-ben.last-played')).toBeNull();
      expect(queryByTestId(page, 'players.list.p-anna.outdated')).toBeNull();
      expect(byTestId(page, 'players.list.p-ben.open').getAttribute('aria-label')).toBe(
        'Ben öffnen',
      );
    });

    it('opens the game area of the selected player and remembers it', async () => {
      await act(() => click(byTestId(page, 'players.list.p-ben.open')));
      expect(url()).toBe('/game/p-ben/dashboard');
      expect(lastPlayerId()).toBe(BEN);
    });

    it('renames a player after checking the name', async () => {
      await act(() => click(byTestId(page, 'players.list.p-ben.rename')));
      const nameInput = byTestId<HTMLInputElement>(document.body, 'players.rename-dialog.name');
      expect(nameInput.value).toBe('Ben');

      typeText(nameInput, '   ');
      await act(() => click(byTestId(document.body, 'players.rename-dialog.submit')));
      expect(textOf(byTestId(document.body, 'players.rename-dialog.name-error'))).toBe(
        'Bitte gib einen Namen ein.',
      );

      typeText(nameInput, '  Benjamin ');
      await act(() => click(byTestId(document.body, 'players.rename-dialog.submit')));
      expect(queryByTestId(document.body, 'players.rename-dialog.name')).toBeNull();
      expect(textOf(byTestId(page, 'players.list.p-ben.name'))).toBe('Benjamin');
      expect(((await database.get('players', BEN)) as { name: string }).name).toBe('Benjamin');
      expect(shownPlayerIds()).toEqual([ANNA, BEN]);
    });

    it('keeps the name when the rename dialog is cancelled', async () => {
      await act(() => click(byTestId(page, 'players.list.p-ben.rename')));
      typeText(byTestId<HTMLInputElement>(document.body, 'players.rename-dialog.name'), 'Bob');
      await act(() => click(byTestId(document.body, 'players.rename-dialog.decline')));
      expect(textOf(byTestId(page, 'players.list.p-ben.name'))).toBe('Ben');
      expect(((await database.get('players', BEN)) as { name: string }).name).toBe('Ben');
    });

    it('deletes a player with all its data after the confirmation', async () => {
      const deleteButton = byTestId(page, 'players.list.p-anna.delete');
      deleteButton.focus();
      await act(() => click(deleteButton));
      const dialog = document.body.querySelector('[role="alertdialog"]');
      expect(dialog === null ? '' : textOf(dialog)).toContain('„Anna“');
      await act(() => click(confirmButton()));

      expect(shownPlayerIds()).toEqual([BEN]);
      expect(toastTexts()).toContain('„Anna“ wurde gelöscht.');
      expect(await database.get('players', ANNA)).toBeUndefined();
      expect(await database.get('runtime', ANNA)).toBeUndefined();
      expect(await database.count('snapshots')).toBe(0);
      expect(lastPlayerId()).toBeUndefined();
      expect(locks.held).toEqual([]);
      // TS §11.10: the focused row is gone, so the focus moves to „Neuer Spieler“.
      expect(document.activeElement).toBe(byTestId(page, 'players.list.create'));
    });

    it('moves the focus to „Neuer Spieler“ of the empty list after deleting the last player', async () => {
      for (const id of [ANNA, BEN]) {
        const deleteButton = byTestId(page, `players.list.${id}.delete`);
        deleteButton.focus();
        await act(() => click(deleteButton));
        await act(() => click(confirmButton()));
      }

      expect(shownPlayerIds()).toEqual([]);
      expect(textOf(page)).toContain('Noch keine Spieler');
      expect(document.activeElement).toBe(byTestId(page, 'players.list.create'));
    });

    it('keeps the player when the deletion is not confirmed', async () => {
      await act(() => click(byTestId(page, 'players.list.p-anna.delete')));
      await act(() => click(byTestId(document.body, 'dialog-confirm.decline')));
      expect(shownPlayerIds()).toEqual([ANNA, BEN]);
      expect(await database.get('players', ANNA)).toBeDefined();
    });

    it('does not delete a player that is open in another tab', async () => {
      const otherTab = await locks.acquire(ANNA);

      await act(() => click(byTestId(page, 'players.list.p-anna.delete')));
      await act(() => click(confirmButton()));

      expect(toastTexts().join(' ')).toContain('„Anna“ ist in einem anderen Tab geöffnet');
      expect(shownPlayerIds()).toEqual([ANNA, BEN]);
      expect(await database.get('players', ANNA)).toBeDefined();
      expect(await database.get('runtime', ANNA)).toBeDefined();
      otherTab?.release();
    });

    it('shows the players another tab created', async () => {
      await storePlayer(database, { id: 'p-cleo', name: 'Cleo', createdAt: Date.UTC(2026, 10, 1) });
      hub.postFromOtherTab({ type: 'players-changed', change: 'created', playerId: 'p-cleo' });
      await settle(harness.fixture);
      expect(shownPlayerIds()).toEqual([ANNA, 'p-cleo', BEN]);
    });
  });

  describe('with outdated players', () => {
    beforeEach(async () => {
      // One profile of another simulation version, one snapshot of another schema version (E-25).
      await storePlayer(database, { id: ANNA, name: 'Anna', simVersion: SIM_VERSION + 1 });
      await storePlayer(database, {
        id: BEN,
        name: 'Ben',
        runtime: { tick: ANNA_TICK, lastSeenAt: ANNA_LAST_SEEN, schemaVersion: SCHEMA_VERSION + 1 },
      });
      await open();
    });

    it.each([ANNA, BEN])('marks %s as outdated and only offers to delete it', async (playerId) => {
      expect(textOf(byTestId(page, `players.list.${playerId}.outdated`))).toBe('Veraltet');
      const openButton = byTestId<HTMLButtonElement>(page, `players.list.${playerId}.open`);
      expect(openButton.disabled).toBe(true);
      expect(queryByTestId(page, `players.list.${playerId}.rename`)).toBeNull();

      await act(() => click(openButton));
      expect(url()).toBe('/players');

      await act(() => click(byTestId(page, `players.list.${playerId}.delete`)));
      await act(() => click(confirmButton()));
      expect(shownPlayerIds()).not.toContain(playerId);
    });
  });

  describe('without players', () => {
    beforeEach(() => open());

    it('offers to create the first player and the lab', async () => {
      expect(textOf(page)).toContain('Noch keine Spieler');
      expect(queryByTestId(page, 'players.list.lab')).not.toBeNull();
      await act(() => click(byTestId(page, 'players.list.create')));
      expect(url()).toBe('/players/new');
    });
  });
});
