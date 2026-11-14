import { expect, expectAccessible, test } from './fixtures';
import { createPlayer } from './players.po';
import { waitForServiceWorker } from './pwa.po';

// Installable and offline (AP 6.3, US-UI-07, TS §13): the production build with its service
// worker. The other journeys block service workers (`playwright.config.ts`).
test.use({ serviceWorkers: 'allow' });

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

test.describe('PWA', () => {
  test('links a valid manifest whose icons load', async ({ page }) => {
    await page.goto('#/players');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('manifest.webmanifest');
    const manifestUrl = new URL(href ?? '', page.url());
    const response = await page.request.get(manifestUrl.href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: 'PortfoliGo',
      short_name: 'PortfoliGo',
      lang: 'de',
      display: 'standalone',
      start_url: './',
      scope: './',
    });
    const icons = manifest.icons as ManifestIcon[];
    expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const icon of icons) {
      const image = await page.request.get(new URL(icon.src, manifestUrl).href);
      expect(image.status(), icon.src).toBe(200);
      expect(image.headers()['content-type']).toBe('image/png');
      const [width, height] = icon.sizes.split('x').map(Number);
      // PNG header: width and height as 32-bit big-endian integers at bytes 16 and 20.
      const body = await image.body();
      expect([body.readUInt32BE(16), body.readUInt32BE(20)], icon.src).toEqual([width, height]);
    }
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#/);
  });

  // TS §13: English links its own manifest with the same identity, so it stays one installed app.
  test('links the English manifest when the language is English', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'pgo.settings',
        JSON.stringify({ v: 1, data: { locale: { language: 'en' } } }),
      );
    });
    await page.goto('#/players');
    await expect(page.getByRole('heading', { level: 1, name: 'Choose player' })).toBeVisible();
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('manifest.en.webmanifest');
    const english = await page.request.get(new URL(href ?? '', page.url()).href);
    expect(english.status()).toBe(200);
    expect(english.headers()['content-type']).toContain('application/manifest+json');
    const german = await page.request.get(new URL('manifest.webmanifest', page.url()).href);
    const { description, lang, ...identity } = await english.json();
    const {
      description: germanDescription,
      lang: germanLang,
      ...germanIdentity
    } = await german.json();
    expect([lang, germanLang]).toEqual(['en', 'de']);
    expect(description).toBe('Stock market and personal finance simulation in your browser');
    expect(germanDescription).toBe('Börsen- und Finanzsimulation im Browser');
    expect(identity).toEqual(germanIdentity);
  });

  test('starts and plays offline after the first visit', async ({ page, context }) => {
    test.setTimeout(90_000);
    const game = await createPlayer(page, 'Anna');
    await page.goto('#/players');
    await expect(page.getByTestId('pwa.pre-release-hint')).toBeVisible();
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Spielerauswahl' })).toBeVisible();
    await expect(page.getByText('Anna')).toBeVisible();

    // The game with its engine worker and lazy pages, all from the cache.
    await page.goto(`${game}/settings`);
    await expect(page.getByTestId('settings.player.name')).toHaveText('Anna');
    await expect(page.getByTestId('settings.app.storage-persisted')).not.toBeEmpty();
    await expectAccessible(page);
    await page.goto(`${game}/markets`);
    await expect(page.getByTestId('shell.header.clock')).toContainText('01.04.2030');

    // A new player offline: world generation and the start run in the cached worker.
    await createPlayer(page, 'Ben');
    await expect(page.getByTestId('shell.header.clock')).toContainText('01.04.2030');
    await context.setOffline(false);
  });
});
