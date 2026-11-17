import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IDBPDatabase } from 'idb';

import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { SIM_VERSION } from '@app/engine/domain/version';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayerProfile } from '@app/players/domain/models/player.model';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { blur, byTestId, click, queryByTestId, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import {
  FakeStoragePersistence,
  providePlayersTestPorts,
} from '../../data-access/testing/fake-players-ports';

const AMOUNT_FIELDS = ['start-capital', 'net-income', 'living-costs'] as const;

describe('NewPlayerPage', () => {
  let database: IDBPDatabase;
  let persistence: FakeStoragePersistence;
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let restorePlatform: () => void;

  beforeEach(async () => {
    // creating a player opens the dashboard with its performance chart
    restorePlatform = installChartPlatform();
    localStorage.clear();
    persistence = new FakeStoragePersistence();
    database = await openPortfoligoDb();
    engine = new InProcessEngine({ storage: 'indexed-db', locks: new FakePlayerLocks() });
    harness = await renderRoute('/players/new', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ persistence, locks: engine.locks }),
    ]);
    page = harness.fixture.nativeElement;
  });

  afterEach(() => {
    database.close();
    restorePlatform();
  });

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  function input(testId: string): HTMLInputElement {
    return byTestId<HTMLInputElement>(page, `players.new.${testId}`);
  }

  async function enter(testId: string, value: string): Promise<void> {
    const element = input(testId);
    typeText(element, value);
    await act(() => blur(element));
  }

  function amounts(): string[] {
    return AMOUNT_FIELDS.map((field) => input(field).value);
  }

  function pressedPresets(): string[] {
    return [...page.querySelectorAll<HTMLElement>('[data-testid^="players.new.preset."]')]
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => textOf(button));
  }

  async function profiles(): Promise<PlayerProfile[]> {
    return (await database.getAll('players')) as PlayerProfile[];
  }

  it('starts with an empty name, a suggested seed and the defaults of „Berufseinstieg“', () => {
    expect(document.title).toBe('Spieler anlegen · PortfoliGo');
    expect(input('name').value).toBe('');
    expect(input('seed').value).toMatch(/^[a-z]+-[a-z]+-\d+$/);
    // PS US-SP-01: 10.000 € / 2.500 € / 1.800 €
    expect(amounts()).toEqual(['10.000', '2.500', '1.800']);
    expect(pressedPresets()).toEqual(['Berufseinstieg']);
    expect(queryByTestId(page, 'players.new.living-costs-hint')).toBeNull();
  });

  it('suggests a new seed and keeps the other entries', async () => {
    const firstSeed = input('seed').value;
    await enter('name', 'Anna');
    await act(() => click(byTestId(page, 'players.new.suggest-seed')));
    expect(input('seed').value).toMatch(/^[a-z]+-[a-z]+-\d+$/);
    expect(input('seed').value).not.toBe(firstSeed);
    expect(input('name').value).toBe('Anna');
  });

  it('fills the amounts from a preset and marks the active preset', async () => {
    await act(() => click(byTestId(page, 'players.new.preset.student')));
    // PS US-SP-01: „Studium“ 2.000 € / 1.000 € / 900 €, „Erfahren“ 50.000 € / 4.500 € / 3.000 €
    expect(amounts()).toEqual(['2.000', '1.000', '900']);
    expect(pressedPresets()).toEqual(['Studium']);

    await act(() => click(byTestId(page, 'players.new.preset.experienced')));
    expect(amounts()).toEqual(['50.000', '4.500', '3.000']);
    expect(pressedPresets()).toEqual(['Erfahren']);

    await enter('net-income', '4.600');
    expect(pressedPresets()).toEqual([]);
  });

  it('shows errors at the touched fields and creates nothing while the form is invalid', async () => {
    expect(queryByTestId(page, 'players.new.name-error')).toBeNull();

    await enter('net-income', '50.000,01');
    expect(textOf(byTestId(page, 'players.new.net-income-error'))).toBe(
      'Der Betrag darf höchstens 50.000 € sein.',
    );
    expect(queryByTestId(page, 'players.new.name-error')).toBeNull();

    await act(() => click(byTestId(page, 'players.new.submit')));
    expect(textOf(byTestId(page, 'players.new.name-error'))).toBe('Bitte gib einen Namen ein.');
    expect(url()).toBe('/players/new');
    expect(await profiles()).toEqual([]);

    await enter('net-income', '50.000');
    expect(queryByTestId(page, 'players.new.net-income-error')).toBeNull();
  });

  it('rejects a seed with other characters at the field (TS §4.1)', async () => {
    await enter('name', 'Anna');
    await enter('seed', 'Café.1');
    expect(textOf(byTestId(page, 'players.new.seed-error'))).toBe(
      'Der Seed darf nur Buchstaben a–z, ä, ö, ü, ß, Ziffern, Leerzeichen, Bindestrich und Unterstrich enthalten.',
    );
    await act(() => click(byTestId(page, 'players.new.submit')));
    expect(url()).toBe('/players/new');
    expect(await profiles()).toEqual([]);

    await enter('seed', 'Größe Übung_2');
    expect(queryByTestId(page, 'players.new.seed-error')).toBeNull();
  });

  it('hints at living costs above the income without blocking the form', async () => {
    await enter('living-costs', '2.500,01');
    expect(textOf(byTestId(page, 'players.new.living-costs-hint'))).toContain(
      'Die Lebenshaltung ist höher als das Einkommen',
    );
    expect(queryByTestId(page, 'players.new.living-costs-error')).toBeNull();

    await enter('name', 'Anna');
    await act(() => click(byTestId(page, 'players.new.submit')));
    expect(url()).toMatch(/^\/game\/p-[0-9a-f]{32}\/dashboard$/);
  });

  it('creates the player, asks for persistent storage and opens the game area', async () => {
    await enter('name', '  Anna ');
    await enter('seed', 'Kupfer-Falke-731');
    await act(() => click(byTestId(page, 'players.new.preset.student')));
    await act(() => click(byTestId(page, 'players.new.submit')));

    const [profile, ...others] = await profiles();
    expect(others).toEqual([]);
    expect(profile).toMatchObject({
      name: 'Anna',
      seed: 'kupfer-falke-731',
      start: { startCapital: 200_000, netIncome: 100_000, livingCosts: 90_000 },
      simVersion: SIM_VERSION,
    });
    expect(url()).toBe(`/game/${profile.id}/dashboard`);
    expect(JSON.parse(localStorage.getItem('pgo.lastPlayerId') ?? 'null')).toEqual({
      v: 1,
      data: profile.id,
    });
    expect(persistence.requests).toBe(1);

    // PS US-SP-01: the game opens paused at the game start, Monday 01.04.2030, 00:00.
    await engine.advance(200);
    await settle(harness.fixture);
    expect(queryByTestId(page, 'shell.session-overlay.heading')).toBeNull();
    expect(textOf(byTestId(page, 'shell.header.clock'))).toBe('Mo., 01.04.2030, 00:00');
    expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert');
    await engine.advance(5_000);
    await settle(harness.fixture);
    expect(textOf(byTestId(page, 'shell.header.clock'))).toBe('Mo., 01.04.2030, 00:00');
  });

  it('opens the game area while the browser does not answer the persistence request', async () => {
    persistence.grant = 'never';
    await enter('name', 'Anna');
    await act(() => click(byTestId(page, 'players.new.submit')));

    const [profile] = await profiles();
    expect(persistence.requests).toBe(1);
    expect(url()).toBe(`/game/${profile.id}/dashboard`);
  });

  it('goes back to the player selection on cancel', async () => {
    await act(() => click(byTestId(page, 'players.new.cancel')));
    expect(url()).toBe('/players');
  });
});
