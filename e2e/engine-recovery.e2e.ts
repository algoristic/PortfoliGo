import { Page, Worker } from '@playwright/test';

import { getAccountCard, openSavingsAccount } from './banking.po';
import { expect, expectAccessible, test } from './fixtures';
import { expectGameReady, getSessionOverlay, recordOverlayHeadings } from './game.po';
import { createPlayer } from './players.po';

// Robustness of the engine (AP 6.4, TS §8.5) with the real worker and IndexedDB: an uncaught error
// in the worker, raised through Playwright's access to the worker, makes the `EngineService`
// restart it. The app has no crash hook of its own.

const CRASH_MESSAGE = 'crash of the system test';

// Firefox and WebKit report the crash as an error of the page, Chromium doesn't.
test.use({ allowedPageErrors: [new RegExp(CRASH_MESSAGE)] });

/** The engine worker of the game: the only dedicated worker outside the lab. */
async function engineWorker(page: Page): Promise<Worker> {
  await expect.poll(() => page.workers().length).toBe(1);
  return page.workers()[0];
}

/** Throws in the worker outside any handler, like a bug in the loop, and waits for its end. */
async function crashWorker(page: Page): Promise<void> {
  const worker = await engineWorker(page);
  const closed = new Promise<void>((resolve) => worker.once('close', () => resolve()));
  await worker.evaluate((message) => {
    setTimeout(() => {
      throw new Error(message);
    });
  }, CRASH_MESSAGE);
  await closed;
}

test.describe('engine recovery', () => {
  test('survives a crash of the worker without losing an action', async ({ page }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    await openSavingsAccount(page);

    const headings = await recordOverlayHeadings(page);
    await crashWorker(page);
    await expectGameReady(page);
    expect(await headings()).toContain('Spiel wird neu gestartet');
    await engineWorker(page);
    await expect(getAccountCard(page, 'acc-2')).toBeVisible();

    // The restarted worker accepts new actions, and the account was opened once.
    await page.getByTestId('banking.accounts.open-account').click();
    await page.getByTestId('banking.open-account-dialog.kind.savings').check();
    await page.getByTestId('banking.open-account-dialog.submit').click();
    await expect(getAccountCard(page, 'acc-3')).toBeVisible();
    await expect(getAccountCard(page, 'acc-4')).toBeHidden();
  });

  test('gives up after three crashes within a minute and loads again on „Neu laden“', async ({
    page,
  }) => {
    const game = await createPlayer(page, 'Anna');
    await expectGameReady(page);
    await page.goto(`${game}/accounts`);
    await expectGameReady(page);
    await openSavingsAccount(page);

    for (let crash = 0; crash < 2; crash++) {
      await crashWorker(page);
      await expectGameReady(page);
    }
    await crashWorker(page);
    await expect(page.getByTestId('shell.session-overlay.heading')).toHaveText(
      'Das Spiel konnte nicht laufen',
    );
    await expect(page.getByTestId('shell.session-overlay.export-hint')).toBeVisible();
    expect(page.workers()).toHaveLength(0);
    await expectAccessible(page);

    await page.getByTestId('shell.session-overlay.reload').click();
    await expectGameReady(page);
    await expect(getSessionOverlay(page)).toBeHidden();
    await expect(getAccountCard(page, 'acc-2')).toBeVisible();
  });
});
