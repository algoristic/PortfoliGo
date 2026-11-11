import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { byTestId, click, queryByTestId } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { installViewport } from '../../../../testing/viewport';

describe('ShellPage', () => {
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  async function open(url: string): Promise<void> {
    harness = await renderRoute(url);
    page = harness.fixture.nativeElement;
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  function current(testId: string): string | null {
    return byTestId(page, testId).getAttribute('aria-current');
  }

  describe('on phones', () => {
    beforeEach(() => open('/game/p1'));

    it('opens the dashboard with the bottom navigation', () => {
      expect(url()).toBe('/game/p1/dashboard');
      expect(document.title).toBe('Übersicht · PortfoliGo');
      expect(current('shell.bottom-nav.dashboard')).toBe('page');
      expect(queryByTestId(page, 'shell.side-nav.dashboard')).toBeNull();
      expect(queryByTestId(page, 'shell.header.search')).toBeNull();
    });

    it('navigates with the bottom navigation', async () => {
      await act(() => click(byTestId(page, 'shell.bottom-nav.markets')));
      expect(url()).toBe('/game/p1/markets');
      expect(document.title).toBe('Märkte · PortfoliGo');
      expect(current('shell.bottom-nav.markets')).toBe('page');
      expect(current('shell.bottom-nav.dashboard')).toBeNull();
    });

    it('navigates to the other areas through the more menu', async () => {
      await act(() => click(byTestId(page, 'shell.bottom-nav.more')));
      await act(() => click(byTestId(page, 'shell.bottom-nav.more.taxes')));
      expect(url()).toBe('/game/p1/taxes');
      expect(document.title).toBe('Steuern · PortfoliGo');
      await act(() => click(byTestId(page, 'shell.bottom-nav.more')));
      expect(current('shell.bottom-nav.more.taxes')).toBe('page');
      expect(current('shell.bottom-nav.more.settings')).toBeNull();
    });

    it('switches the player through the player menu', async () => {
      await act(() => click(byTestId(page, 'shell.header.player-menu')));
      await act(() => click(byTestId(page, 'shell.header.player-menu.switch-player')));
      expect(url()).toBe('/players');
      expect(queryByTestId(page, 'players.list.create')).not.toBeNull();
    });

    it('opens the settings through the player menu', async () => {
      await act(() => click(byTestId(page, 'shell.header.player-menu')));
      await act(() => click(byTestId(page, 'shell.header.player-menu.settings')));
      expect(url()).toBe('/game/p1/settings');
      expect(current('shell.header.player-menu.settings')).toBe('page');
    });

    it('offers the export only as a disabled entry', async () => {
      await act(() => click(byTestId(page, 'shell.header.player-menu')));
      const exportItem = byTestId(page, 'shell.header.player-menu.export');
      expect(exportItem.getAttribute('aria-disabled')).toBe('true');
      await act(() => click(exportItem));
      expect(url()).toBe('/game/p1/dashboard');
    });

    it('moves the focus to the content with the skip link', async () => {
      await act(() => click(byTestId(page, 'shell.skip-to-content')));
      expect(document.activeElement).toBe(byTestId(page, 'shell.content'));
    });
  });

  describe('on desktops', () => {
    let restoreViewport: () => void;

    beforeEach(async () => {
      restoreViewport = installViewport(1024);
      await open('/game/p1');
    });

    afterEach(() => restoreViewport());

    it('shows the side navigation and the full header instead of the bottom navigation', () => {
      expect(current('shell.side-nav.dashboard')).toBe('page');
      expect(queryByTestId(page, 'shell.bottom-nav.dashboard')).toBeNull();
      expect(queryByTestId(page, 'shell.header.search')).not.toBeNull();
      expect(queryByTestId(page, 'shell.header.net-worth')).not.toBeNull();
    });

    it('navigates with the side navigation', async () => {
      await act(() => click(byTestId(page, 'shell.side-nav.notifications')));
      expect(url()).toBe('/game/p1/notifications');
      expect(document.title).toBe('Benachrichtigungen · PortfoliGo');
      expect(current('shell.side-nav.notifications')).toBe('page');
      expect(current('shell.side-nav.dashboard')).toBeNull();
    });
  });
});
