import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import {
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { SIM_VERSION } from '@app/engine/domain/version';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';

import { provideAppCore } from './app.providers';
import { routes } from './app.routes';

describe('routes', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    // `enterGame` opens only stored players; the game runs in the in-process engine.
    const database = await openPortfoligoDb();
    await database.put('players', {
      id: 'p1',
      name: 'Anna',
      seed: 'kupfer-falke-731',
      seedKey: [1, 2, 3, 4],
      start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
      simVersion: SIM_VERSION,
      createdAt: Date.UTC(2026, 9, 1),
    });
    database.close();
    const engine = new InProcessEngine({ storage: 'indexed-db' });
    TestBed.configureTestingModule({
      // The app-wide wiring, so route guards and route providers run against the real store.
      providers: [
        provideAppCore(),
        provideRouter(routes),
        provideInProcessEngineWorker(engine),
        providePlayersTestPorts({ locks: engine.locks }),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  it('redirects the empty path to the player selection', async () => {
    await harness.navigateByUrl('/');
    expect(router.url).toBe('/players');
  });

  it('redirects unknown paths to the player selection', async () => {
    await harness.navigateByUrl('/does-not-exist');
    expect(router.url).toBe('/players');
  });

  it('opens the dashboard when entering the game area', async () => {
    await harness.navigateByUrl('/game/p1');
    expect(router.url).toBe('/game/p1/dashboard');
  });

  it.each([
    'dashboard',
    'markets',
    'markets/i1',
    'portfolio',
    'accounts',
    'accounts/a1',
    'banks',
    'orders',
    'taxes',
    'notifications',
    'settings',
  ])('resolves the game area path %s', async (path) => {
    await harness.navigateByUrl(`/game/p1/${path}`);
    expect(router.url).toBe(`/game/p1/${path}`);
  });

  it.each(['lab/components', 'lab/tokens'])('resolves the lab path %s', async (path) => {
    await harness.navigateByUrl(`/${path}`);
    expect(router.url).toBe(`/${path}`);
  });

  it('resolves the new player page', async () => {
    await harness.navigateByUrl('/players/new');
    expect(router.url).toBe('/players/new');
  });
});
