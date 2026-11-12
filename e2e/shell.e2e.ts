import { expect, test } from './fixtures';

// Player selection and the preview of the game area with real media queries (J5–J7).

test.describe('game area on a phone', { tag: ['@mobile', '@phone'] }, () => {
  test('navigates with the bottom bar, the more menu and the player menu', async ({ page }) => {
    await page.goto('#/players');
    await page.getByTestId('players.list.preview').click();
    await expect(page).toHaveURL(/#\/game\/preview\/dashboard$/);
    await expect(page.getByTestId('shell.bottom-nav.dashboard')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('shell.side-nav.dashboard')).toHaveCount(0);

    await page.getByTestId('shell.bottom-nav.markets').click();
    await expect(page).toHaveURL(/#\/game\/preview\/markets$/);
    await expect(page).toHaveTitle('Märkte · PortfoliGo');

    await page.getByTestId('shell.bottom-nav.more').click();
    await page.getByTestId('shell.bottom-nav.more.taxes').click();
    await expect(page).toHaveURL(/#\/game\/preview\/taxes$/);
    await expect(page).toHaveTitle('Steuern · PortfoliGo');

    await page.getByTestId('shell.header.player-menu').click();
    await page.getByTestId('shell.header.player-menu.switch-player').click();
    await expect(page).toHaveURL(/#\/players$/);
  });

  test('moves the focus to the content with the skip link', async ({ page }) => {
    await page.goto('#/game/preview/dashboard');
    await page.getByTestId('shell.skip-to-content').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('shell.content')).toBeFocused();
  });
});

test.describe('game area on a desktop', () => {
  test('shows the side navigation and the header figures', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('#/game/preview/dashboard');
    await expect(page.getByTestId('shell.side-nav.dashboard')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('shell.bottom-nav.more')).toHaveCount(0);
    await expect(page.getByTestId('shell.header.search')).toBeVisible();
    await expect(page.getByTestId('shell.header.net-worth')).toBeVisible();

    await page.getByTestId('shell.side-nav.notifications').click();
    await expect(page).toHaveURL(/#\/game\/preview\/notifications$/);
  });

  test('switches to the phone layout below 48rem', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('#/game/preview/dashboard');
    await expect(page.getByTestId('shell.bottom-nav.more')).toBeVisible();
    await expect(page.getByTestId('shell.side-nav.dashboard')).toHaveCount(0);
  });
});

test.describe('deep links', () => {
  test('redirects unknown routes, keeps the route on reload and goes back', async ({ page }) => {
    await page.goto('#/does-not-exist');
    await expect(page).toHaveURL(/#\/players$/);

    await page.goto('#/game/preview/markets');
    // Reload only a loaded page: a reload that cancels a lazy chunk is logged as an error.
    await expect(page).toHaveTitle('Märkte · PortfoliGo');
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page).toHaveURL(/#\/game\/preview\/markets$/);
    await expect(page).toHaveTitle('Märkte · PortfoliGo');

    await page.goto('#/game/preview/portfolio');
    await page.goBack();
    await expect(page).toHaveURL(/#\/game\/preview\/markets$/);
  });
});
