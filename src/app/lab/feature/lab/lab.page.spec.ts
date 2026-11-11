import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { provideInProcessLabWorker } from '../../data-access/testing/in-process-lab-worker';

describe('LabPage', () => {
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let router: Router;
  let restorePlatform: () => void;

  beforeEach(async () => {
    restorePlatform = installChartPlatform();
    harness = await renderRoute('/lab', [provideInProcessLabWorker()]);
    page = harness.fixture.nativeElement;
    router = TestBed.inject(Router);
  });

  afterEach(() => restorePlatform());

  async function navigate(testId: string): Promise<void> {
    click(byTestId(page, testId));
    await settle(harness.fixture);
  }

  function heading(): string {
    return textOf(page.querySelector('main h1') as HTMLElement);
  }

  it('opens the simulation and marks it as the current page', () => {
    expect(router.url).toBe('/lab/simulation');
    expect(heading()).toBe('Simulations-Labor');
    expect(byTestId(page, 'lab.nav.simulation').getAttribute('aria-current')).toBe('page');
    expect(byTestId(page, 'lab.nav.tokens').getAttribute('aria-current')).toBeNull();
  });

  it('switches between the lab pages through the navigation', async () => {
    await navigate('lab.nav.components');
    expect(router.url).toBe('/lab/components');
    expect(heading()).toBe('UI-Bausteine');
    expect(TestBed.inject(Title).getTitle()).toContain('UI-Bausteine');
    expect(byTestId(page, 'lab.nav.components').getAttribute('aria-current')).toBe('page');

    await navigate('lab.nav.tokens');
    expect(router.url).toBe('/lab/tokens');
    expect(heading()).toBe('Design-Tokens');
    expect(TestBed.inject(Title).getTitle()).toContain('Design-Tokens');

    await navigate('lab.nav.simulation');
    expect(router.url).toBe('/lab/simulation');
    expect(heading()).toBe('Simulations-Labor');
  });

  it('leads back to the player selection', async () => {
    await navigate('lab.header.app');
    expect(router.url).toBe('/players');
  });
});
