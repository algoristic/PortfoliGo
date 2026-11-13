import { expect, test } from './fixtures';

// Lab frame and the shared building blocks with real focus handling and keyboard input (J4).

test.describe('lab frame', () => {
  test('redirects to the simulation and navigates between the lab pages', async ({ page }) => {
    await page.goto('#/lab');
    await expect(page).toHaveURL(/#\/lab\/simulation$/);
    await expect(page).toHaveTitle('Simulations-Labor · PortfoliGo');
    await expect(page.getByTestId('lab.nav.simulation')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('lab.nav.components').click();
    await expect(page).toHaveTitle('UI-Bausteine · PortfoliGo');
    await expect(page.getByTestId('lab.nav.components')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('lab.nav.simulation')).not.toHaveAttribute('aria-current');

    await page.getByTestId('lab.nav.tokens').click();
    await expect(page).toHaveTitle('Design-Tokens · PortfoliGo');

    await page.getByTestId('lab.header.app').click();
    await expect(page).toHaveURL(/#\/players$/);
  });
});

test.describe('building blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('#/lab/components');
  });

  test('closes the confirm dialog with Escape and returns the focus', async ({ page }) => {
    const opener = page.getByTestId('lab.components.confirm');
    await opener.click();
    await expect(page.getByTestId('dialog-confirm.confirm')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('dialog-confirm.confirm')).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.getByTestId('lab.components.confirm-result')).toHaveText('Abgebrochen');

    await opener.click();
    await page.getByTestId('dialog-confirm.confirm').click();
    await expect(page.getByTestId('lab.components.confirm-result')).toHaveText('Bestätigt');
  });

  test('shows a toast at the top centre and dismisses it', async ({ page }) => {
    await page.getByTestId('lab.components.toast.success').click();
    const dismiss = page.locator('[data-testid^="toast."][data-testid$=".dismiss"]');
    await expect(dismiss).toHaveCount(1);

    const viewport = page.viewportSize();
    const toast = await page.locator('li[data-testid^="toast."]').boundingBox();
    expect(viewport).not.toBeNull();
    expect(toast).not.toBeNull();
    if (viewport && toast) {
      const centre = toast.x + toast.width / 2;
      expect(Math.abs(centre - viewport.width / 2)).toBeLessThanOrEqual(1);
      expect(toast.y).toBeLessThan(viewport.height / 4);
    }

    await dismiss.click();
    await expect(dismiss).toHaveCount(0);
    // Without toasts, the overlay must not swallow clicks on the header below it.
    const hit = await page.evaluate(
      ([x, y]) => !document.elementFromPoint(x, y)?.closest('.cdk-overlay-container'),
      [(viewport?.width ?? 0) / 2, 8],
    );
    expect(hit).toBe(true);
  });

  test('moves between tabs with the arrow keys, Home and End', async ({ page }) => {
    const overview = page.getByTestId('lab.components.tabs.overview.tab');
    const chart = page.getByTestId('lab.components.tabs.chart.tab');
    const profile = page.getByTestId('lab.components.tabs.profile.tab');
    await overview.click();
    await page.keyboard.press('ArrowRight');
    await expect(chart).toBeFocused();
    await expect(chart).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(profile).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(overview).toHaveAttribute('aria-selected', 'true');
  });
});
