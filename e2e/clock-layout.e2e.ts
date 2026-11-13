import { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { expectGameReady, getClock, getPausedBadge, getSpeed, getTogglePause } from './game.po';
import { createPlayer } from './players.po';

// The clock bar keeps its layout (AP 5.9, US-ZT-01, US-ZT-03): neither the weekday nor the pause
// chip moves the pause button or the controls right of the clock. Only a real browser lays out
// the fonts, so the test compares bounding boxes.

/** The first week of the game, Monday 01.04.2030 to Sunday 07.04.2030 (calendar). */
const WEEK = [
  { date: '2030-04-01', text: 'Mo., 01.04.2030, 00:00' },
  { date: '2030-04-02', text: 'Di., 02.04.2030, 00:00' },
  { date: '2030-04-03', text: 'Mi., 03.04.2030, 00:00' },
  { date: '2030-04-04', text: 'Do., 04.04.2030, 00:00' },
  { date: '2030-04-05', text: 'Fr., 05.04.2030, 00:00' },
  { date: '2030-04-06', text: 'Sa., 06.04.2030, 00:00' },
  { date: '2030-04-07', text: 'So., 07.04.2030, 00:00' },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The controls right of the clock; slower, faster and the jump button exist from `md`. */
function controlsRightOfClock(page: Page, compact: boolean): Locator[] {
  const ids = compact
    ? ['toggle-pause', 'speed']
    : ['toggle-pause', 'slower', 'speed', 'faster', 'jump-button'];
  return ids.map((id) => page.getByTestId(`shell.header.${id}`));
}

async function boxesOf(locators: Locator[]): Promise<Box[]> {
  return Promise.all(
    locators.map(async (locator) => {
      const box = await locator.boundingBox();
      if (box === null) {
        throw new Error(`${locator.toString()} is not visible`);
      }
      return box;
    }),
  );
}

/** Jumps through the jump dialog of the speed menu to midnight of a date (`YYYY-MM-DD`). */
async function jumpTo(page: Page, date: string, text: string): Promise<void> {
  await getSpeed(page).click();
  await page.getByTestId('shell.header.speed.jump').click();
  await page.getByTestId('clock.jump-dialog.date-kind').check();
  await page.getByTestId('clock.jump-dialog.date').fill(date);
  await page.getByTestId('clock.jump-dialog.submit').click();
  await expect(getClock(page)).toHaveText(text, { timeout: 30_000 });
  await expect(page.getByTestId('shell.header.jump')).toBeHidden();
}

async function expectStableClockBar(page: Page, compact: boolean): Promise<void> {
  await createPlayer(page, 'Anna');
  await expectGameReady(page);
  await expect(getClock(page)).toHaveText(WEEK[0].text);
  await expect(getPausedBadge(page)).toBeVisible();
  const controls = controlsRightOfClock(page, compact);
  const paused = await boxesOf(controls);

  // Pausing and resuming with two clicks at the same spot (US-ZT-03).
  const toggle = paused[0];
  const center = { x: toggle.x + toggle.width / 2, y: toggle.y + toggle.height / 2 };
  await page.mouse.click(center.x, center.y);
  await expect(getPausedBadge(page)).toBeHidden();
  expect(await boxesOf(controls)).toEqual(paused);
  await page.mouse.click(center.x, center.y);
  await expect(getPausedBadge(page)).toBeVisible();
  expect(await boxesOf(controls)).toEqual(paused);

  // Every weekday (US-ZT-01); the jump keeps the pause.
  for (const { date, text } of WEEK.slice(1)) {
    await jumpTo(page, date, text);
    await expect(getPausedBadge(page)).toBeVisible();
    expect(await boxesOf(controls), text).toEqual(paused);
  }

  // Running on the widest and the narrowest weekday alike.
  await getTogglePause(page).click();
  await expect(getPausedBadge(page)).toBeHidden();
  expect(await boxesOf(controls)).toEqual(paused);
}

test.describe('clock bar layout', () => {
  test('keeps the pause button and the controls in place on every weekday and in the pause', async ({
    page,
  }) => {
    await expectStableClockBar(page, false);
  });
});

test.describe('clock bar layout on a 360 px phone', { tag: ['@mobile', '@phone'] }, () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('keeps the pause button and the speed in place on every weekday and in the pause', async ({
    page,
  }) => {
    await expectStableClockBar(page, true);
  });
});
