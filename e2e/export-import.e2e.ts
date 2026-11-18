import { Page } from '@playwright/test';

import { readFile } from 'node:fs/promises';

import { expect, expectAccessible, expectDialogReady, test } from './fixtures';
import { expectGameReady, getClock, getPausedBadge, getSpeed } from './game.po';
import { createPlayer } from './players.po';

// Export and import (AP 6.1, US-EX-01, US-EX-02, TS §10): a real download and upload, which only
// a browser shows; the file's content (gzip, base64) comes from the worker of each engine.

/** Jumps through the jump dialog of the speed menu (on phones too) to a time of a date. */
async function jumpTo(page: Page, date: string, time: string, text: string): Promise<void> {
  await getSpeed(page).click();
  await page.getByTestId('shell.header.speed.jump').click();
  await expectDialogReady(page, 'clock.jump-dialog');
  await page.getByTestId('clock.jump-dialog.date-kind').check();
  await page.getByTestId('clock.jump-dialog.date').fill(date);
  await page.getByTestId('clock.jump-dialog.time').fill(time);
  await page.getByTestId('clock.jump-dialog.submit').click();
  await expect(getClock(page)).toHaveText(text, { timeout: 30_000 });
}

test('exports a player as a file and imports it as a paused copy on the same game day', async ({
  page,
}, testInfo) => {
  const game = await createPlayer(page, 'Anna');
  await expectGameReady(page);
  await jumpTo(page, '2030-04-03', '10:00', 'Mi., 03.04.2030, 10:00');

  await page.goto(`${game}/settings`);
  await expectGameReady(page);
  await expect(page.getByTestId('settings.player.last-export')).toHaveText(
    'Auf diesem Gerät noch nicht exportiert.',
  );
  await page.getByTestId('settings.player.export').click();
  await expect(page.getByTestId('players.export-dialog.file-name')).toHaveText(
    'Anna-2030-04-03.pgo',
  );
  await expectAccessible(page);
  const downloading = page.waitForEvent('download');
  await page.getByTestId('players.export-dialog.download').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Anna-2030-04-03.pgo');
  const path = testInfo.outputPath('Anna-2030-04-03.pgo');
  await download.saveAs(path);
  // base64 of gzip starts with its magic bytes 1f 8b 08 (RFC 1952)
  expect(await readFile(path, 'utf8')).toMatch(/^H4sI[A-Za-z0-9+/]+=*$/);
  await expect(page.getByTestId('settings.player.last-export')).toContainText(
    'Zuletzt auf diesem Gerät exportiert:',
  );

  await page.goto('#/players');
  await page.getByTestId('players.list.import').click();
  await page.getByTestId('players.import-dialog.file').setInputFiles(path);
  await expect(page.getByTestId('players.import-dialog.file-name')).toHaveText(
    'Anna-2030-04-03.pgo',
  );
  await expectAccessible(page);
  const started = Date.now();
  await page.getByTestId('players.import-dialog.submit').click();
  await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/dashboard$/, { timeout: 30_000 });
  await expectGameReady(page);
  testInfo.annotations.push({
    type: 'import-ms',
    description: `${Date.now() - started} ms until the imported game was ready`,
  });
  expect(page.url()).not.toContain(game);
  await expect(getClock(page)).toHaveText('Mi., 03.04.2030, 10:00');
  await expect(getPausedBadge(page)).toBeVisible();

  await page.goto('#/players');
  await expect(page.getByRole('heading', { name: 'Anna (Import)' })).toBeVisible();
});

test('copies the export to the clipboard and imports the pasted text', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'reading the clipboard needs a permission of Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const game = await createPlayer(page, 'Ben');
  await page.goto(`${game}/settings`);
  await expectGameReady(page);
  await page.getByTestId('settings.player.export').click();
  await page.getByTestId('players.export-dialog.copy').click();
  await expect(page.getByTestId('players.export-dialog.copy')).toHaveCount(0);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^H4sI[A-Za-z0-9+/]+=*$/);

  await page.goto('#/players');
  await page.getByTestId('players.list.import').click();
  await expectDialogReady(page, 'players.import-dialog');
  await page.getByTestId('players.import-dialog.text').fill(copied);
  await page.getByTestId('players.import-dialog.submit').click();
  await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/dashboard$/, { timeout: 30_000 });
  await expectGameReady(page);
  await expect(getClock(page)).toHaveText('Mo., 01.04.2030, 00:00');
});
