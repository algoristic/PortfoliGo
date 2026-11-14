import { expect, test } from './fixtures';
import { createPlayerWith } from './notifications.po';
import { waitForServiceWorker } from './pwa.po';

// Browser notifications through the service worker (AP 6.3, US-BN-04, TS §12). The headless shell
// of Chromium denies notifications whatever is granted; the new headless mode of the full Chromium
// build shows them. Only Chromium lets a test grant the permission.
test.use({ channel: 'chromium', serviceWorkers: 'allow' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'permissions are granted only in Chromium',
);

test('shows a warning as a browser notification while the tab is hidden', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['notifications'], { origin: new URL(baseURL ?? '').origin });
  // Without start capital the living costs at 06:00 make the account uncovered (browser on).
  const game = await createPlayerWith(page, 'Anna', { startCapital: '0' });
  await waitForServiceWorker(page);
  await page.goto(`${game}/settings`);
  await expect(page.getByTestId('settings.app.notification-permission')).toHaveText('Erlaubt');
  // The game keeps its speed while hidden (AP 6.7).
  await page.getByTestId('settings.player.background-mode.keep-speed').check();
  await page.getByTestId('shell.header.speed').click();
  await page.getByTestId('shell.header.speed.1h').click();
  await page.getByTestId('shell.header.toggle-pause').click();

  // A hidden tab, as the engine and the app see it; headless browsers never hide a tab.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const shown = async (): Promise<Array<{ title: string; tag: string }>> =>
    page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const notifications = (await registration?.getNotifications()) ?? [];
      return notifications.map(({ title, tag }) => ({ title, tag }));
    });
  await expect
    .poll(shown, { timeout: 20_000 })
    .toEqual([{ title: 'Konto nicht gedeckt', tag: 'pgo-account-uncovered' }]);
});
