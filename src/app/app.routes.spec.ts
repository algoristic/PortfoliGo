import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideAppCore } from './app.providers';
import { routes } from './app.routes';

describe('routes', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      // The app-wide wiring, so route guards and route providers run against the real store.
      providers: [provideAppCore(), provideRouter(routes)],
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
