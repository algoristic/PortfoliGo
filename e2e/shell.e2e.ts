import { expect, test } from './fixtures';
import { expectGameReady } from './game.po';
import { createPlayer } from './players.po';

// The game area of a new player with real media queries (J5–J7, US-UI-03).

test.describe('game area on a phone', { tag: ['@mobile', '@phone'] }, () => {
  test('navigates with the bottom bar, the more menu and the player menu', async ({ page }) => {
    await createPlayer(page, 'Anna');
    await expect(page.getByTestId('shell.bottom-nav.dashboard')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('shell.side-nav.dashboard')).toHaveCount(0);

    await page.getByTestId('shell.bottom-nav.markets').click();
    await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/markets$/);
    await expect(page).toHaveTitle('Märkte · PortfoliGo');

    await page.getByTestId('shell.bottom-nav.more').click();
    await page.getByTestId('shell.bottom-nav.more.taxes').click();
    await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/taxes$/);
    await expect(page).toHaveTitle('Steuern · PortfoliGo');

    await page.getByTestId('shell.header.player-menu').click();
    await page.getByTestId('shell.header.player-menu.switch-player').click();
    await expect(page).toHaveURL(/#\/players$/);
  });

  test('moves the focus to the content with the skip link', async ({ page }) => {
    await createPlayer(page, 'Anna');
    // While the game loads, the overlay holds the focus and the game area is inert.
    await expectGameReady(page);
    await page.getByTestId('shell.skip-to-content').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('shell.content')).toBeFocused();
  });
});

test.describe('game area on a desktop', () => {
  test('shows the side navigation and the header figures', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await createPlayer(page, 'Anna');
    await expect(page.getByTestId('shell.side-nav.dashboard')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('shell.bottom-nav.more')).toHaveCount(0);
    await expect(page.getByTestId('shell.header.command-palette')).toContainText('Suchen');
    await expect(page.getByTestId('shell.header.net-worth')).toBeVisible();

    await page.getByTestId('shell.side-nav.notifications').click();
    await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/notifications$/);
  });

  test('switches to the phone layout below 48rem', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await createPlayer(page, 'Anna');
    await expect(page.getByTestId('shell.bottom-nav.more')).toBeVisible();
    await expect(page.getByTestId('shell.side-nav.dashboard')).toHaveCount(0);
  });
});

test.describe('icons', () => {
  test('links the favicon and the touch icon of the build', async ({ page }) => {
    await page.goto('#/players');
    for (const [rel, type] of [
      ['icon', 'image/svg+xml'],
      ['apple-touch-icon', 'image/png'],
    ]) {
      const href = await page
        .locator(`link[rel="${rel}"]`)
        .evaluate((link: HTMLLinkElement) => link.href);
      const response = await page.request.get(href);
      expect(response.status(), rel).toBe(200);
      expect(response.headers()['content-type'], rel).toBe(type);
    }
  });
});

test.describe('deep links', () => {
  test('redirects unknown routes, keeps the route on reload and goes back', async ({ page }) => {
    await page.goto('#/does-not-exist');
    await expect(page).toHaveURL(/#\/players$/);

    const game = await createPlayer(page, 'Anna');
    await page.goto(`${game}/markets`);
    // Reload only a loaded page: a reload that cancels a lazy chunk is logged as an error.
    await expect(page).toHaveTitle('Märkte · PortfoliGo');
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/markets$/);
    await expect(page).toHaveTitle('Märkte · PortfoliGo');

    await page.goto(`${game}/portfolio`);
    await page.goBack();
    await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/markets$/);
  });
});
