import { EnvironmentProviders, Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideAppCore } from '../app/app.providers';
import { routes } from '../app/app.routes';

/**
 * Opens `url` in the app's real routes with the app-wide providers, so guards, route providers,
 * store and effects run as in the app. `providers` replace process boundaries, e.g. the worker.
 */
export async function renderRoute(
  url: string,
  providers: Array<Provider | EnvironmentProviders> = [],
): Promise<RouterTestingHarness> {
  TestBed.configureTestingModule({
    providers: [provideAppCore(), provideRouter(routes), ...providers],
  });
  const harness = await RouterTestingHarness.create(url);
  await settle(harness.fixture);
  return harness;
}

/**
 * Waits until the app is stable, then for a few animation frames (charts report their visible
 * range in a frame) and again for what these frames started.
 */
export async function settle(fixture: ComponentFixture<unknown>, frames = 3): Promise<void> {
  await fixture.whenStable();
  await nextFrames(frames);
  await fixture.whenStable();
}

export async function nextFrames(count = 1): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
