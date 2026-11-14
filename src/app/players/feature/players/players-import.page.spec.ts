import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IDBPDatabase } from 'idb';

import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { gunzipBase64, gzipBase64 } from '@app/persistence/util/text-codec';
import { EXPORT_V1_CONTENT } from '@app/players/domain/testing/export-v1';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, queryByTestId, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { providePlayersTestPorts } from '../../data-access/testing/fake-players-ports';

// US-EX-02, TS §10.3: the frozen export of format version 1 (`export-v1.ts`) is the game of
// „Export Fixture“ on the mini world, exported on Wednesday, 15.05.2030, 14:37.

describe('PlayersPage import', () => {
  let database: IDBPDatabase;
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let restorePlatform: () => void;

  beforeEach(async () => {
    restorePlatform = installChartPlatform();
    localStorage.clear();
    database = await openPortfoligoDb();
    engine = new InProcessEngine({ storage: 'indexed-db', locks: new FakePlayerLocks() });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks: engine.locks }),
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

  function toastTexts(): string[] {
    return [...document.body.querySelectorAll('[data-testid^="toast."] p')].map(textOf);
  }

  async function importText(content: string): Promise<void> {
    await act(() => click(byTestId(page, 'players.list.import')));
    const text = byTestId<HTMLTextAreaElement>(document.body, 'players.import-dialog.text');
    typeText(text, content);
    await act(() => click(byTestId(document.body, 'players.import-dialog.submit')));
  }

  it('imports the export as a new player that continues paused at the export time', async () => {
    await importText(EXPORT_V1_CONTENT);

    const profiles = (await database.getAll('players')) as { id: string; name: string }[];
    expect(profiles.map(({ name }) => name)).toEqual(['Export Fixture (Import)']);
    const [{ id }] = profiles;
    expect(url()).toBe(`/game/${id}/dashboard`);
    expect(toastTexts()).toEqual([
      '„Export Fixture (Import)“ wurde importiert. Das Spiel ist pausiert.',
    ]);

    await engine.advance(200);
    await settle(harness.fixture);
    expect(textOf(byTestId(page, 'shell.header.clock'))).toBe('Mi., 15.05.2030, 14:37');
    expect(textOf(byTestId(page, 'shell.header.paused'))).toBe('Pausiert');
    await engine.advance(5_000);
    await settle(harness.fixture);
    expect(textOf(byTestId(page, 'shell.header.clock'))).toBe('Mi., 15.05.2030, 14:37');

    await harness.navigateByUrl('/players');
    await settle(harness.fixture);
    expect(textOf(byTestId(page, `players.list.${id}.name`))).toBe('Export Fixture (Import)');
    expect(textOf(byTestId(page, `players.list.${id}.game-time`))).toBe('Mi., 15.05.2030, 14:37');
  });

  it('rejects a changed export with a message and creates no player', async () => {
    // Valid encoding, but the content no longer matches its checksum.
    const json = await gunzipBase64(EXPORT_V1_CONTENT);
    const changed = await gzipBase64(json.replace('"Export Fixture"', '"Export Fixtura"'));

    await importText(changed);

    expect(url()).toBe('/players');
    expect(toastTexts()).toEqual([
      'Der Spielstand ist beschädigt oder wurde verändert: Die Prüfsumme stimmt nicht.',
    ]);
    expect(await database.count('players')).toBe(0);
    expect(await database.count('runtime')).toBe(0);
    expect(await database.count('snapshots')).toBe(0);
    expect(queryByTestId(page, 'players.import-progress')).toBeNull();
  });

  it('rejects a damaged export file with a message and creates no player', async () => {
    // One base64 character in the middle of the gzip data changed.
    const middle = Math.floor(EXPORT_V1_CONTENT.length / 2);
    const replaced = EXPORT_V1_CONTENT[middle] === 'A' ? 'B' : 'A';
    const damaged =
      EXPORT_V1_CONTENT.slice(0, middle) + replaced + EXPORT_V1_CONTENT.slice(middle + 1);

    await importText(damaged);

    expect(url()).toBe('/players');
    expect(toastTexts()).toEqual([
      'Die Daten lassen sich nicht lesen. Prüfe, ob du die ganze Datei gewählt oder den ganzen Text eingefügt hast.',
    ]);
    expect(await database.count('players')).toBe(0);
    expect(await database.count('runtime')).toBe(0);
  });

  it('rejects data that is no export and asks for a file or text when both are missing', async () => {
    await act(() => click(byTestId(page, 'players.list.import')));
    await act(() => click(byTestId(document.body, 'players.import-dialog.submit')));
    expect(textOf(byTestId(document.body, 'players.import-dialog.text-error'))).toBe(
      'Bitte wähle eine Datei oder füge den Spielstand als Text ein.',
    );
    await act(() => click(byTestId(document.body, 'players.import-dialog.decline')));
    expect(queryByTestId(document.body, 'players.import-dialog.text')).toBeNull();

    await importText(await gzipBase64('{"format":"portfoligo/settings"}'));
    expect(toastTexts()).toEqual(['Das ist kein PortfoliGo-Spielstand.']);
    expect(await database.count('players')).toBe(0);
  });
});
