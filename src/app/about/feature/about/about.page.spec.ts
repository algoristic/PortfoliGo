import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { THIRD_PARTY_LICENSES } from '@app/about/domain/third-party-licenses';
import { SIM_VERSION } from '@app/engine/domain/version';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';

import { version } from '../../../../../package.json';
import { byTestId, click, queryByTestId, textOf } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';

// US-UI-08, E-26: the legal notes are reachable without a game, from the players page and the
// page for a new player.

describe('AboutPage', () => {
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
  });

  async function openApp(url: string): Promise<void> {
    harness = await renderRoute(url, [providePlayersTestPorts()]);
    page = harness.fixture.nativeElement;
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  it('shows the disclaimer, the versions and the licenses with the TradingView attribution', async () => {
    await openApp('/about');
    expect(document.title).toBe('Über PortfoliGo · PortfoliGo');
    const disclaimer = textOf(byTestId(page, 'about.disclaimer'));
    expect(disclaimer).toContain('keine Anlageberatung');
    expect(disclaimer).toContain('erfunden');
    expect(disclaimer).toContain('vereinfacht');
    expect(textOf(byTestId(page, 'about.app-version'))).toBe(version);
    expect(textOf(byTestId(page, 'about.sim-version'))).toBe(String(SIM_VERSION));

    for (const license of THIRD_PARTY_LICENSES) {
      expect(textOf(byTestId(page, `about.license.${license.id}.id`))).toBe(license.license);
    }
    expect(textOf(byTestId(page, 'about.license.lightweight-charts.id'))).toBe('Apache-2.0');
    expect(textOf(byTestId(page, 'about.tradingview'))).toContain('TradingView, Inc.');
    const link = byTestId<HTMLAnchorElement>(page, 'about.tradingview.link');
    expect(link.getAttribute('href')).toBe('https://www.tradingview.com/');
    expect(link.getAttribute('rel')).toContain('noopener');

    await act(() => click(byTestId(page, 'about.back')));
    expect(url()).toBe('/players');
  });

  it('links the notes from the players page and the page for a new player', async () => {
    await openApp('/players');
    expect(textOf(byTestId(page, 'about.disclaimer-hint'))).toContain('keine Anlageberatung');
    await act(() => click(byTestId(page, 'about.disclaimer-hint.link')));
    expect(url()).toBe('/about');
    expect(queryByTestId(page, 'about.licenses')).not.toBeNull();

    await harness.navigateByUrl('/players/new');
    await settle(harness.fixture);
    await act(() => click(byTestId(page, 'about.disclaimer-hint.link')));
    expect(url()).toBe('/about');
  });
});
