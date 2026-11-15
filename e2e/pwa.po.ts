import { expect, Page } from '@playwright/test';

// Page object of the PWA (AP 6.3).

/** Waits until the service worker is active and controls the page. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  // Registered once the app is stable or after 30 s (`registerWhenStable:30000`); `ready`
  // resolves after the installation, i.e. after the prefetch of the whole app, but possibly while
  // the worker is still `activating`.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state), {
      timeout: 10_000,
    })
    .toBe('activated');
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 10_000,
    })
    .toBe(true);
}
