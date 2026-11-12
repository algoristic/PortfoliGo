import { expect, Locator, Page } from '@playwright/test';

// Page object of the game area: clock bar, session overlay and the stored clock (AP 2.5).

/** Game time of a new player (US-SP-01, TS §3.1). */
export const GAME_START_TEXT = 'Mo., 01.04.2030, 00:00';

export const getClock = (page: Page): Locator => page.getByTestId('shell.header.clock');
export const getPausedBadge = (page: Page): Locator => page.getByTestId('shell.header.paused');
export const getTogglePause = (page: Page): Locator =>
  page.getByTestId('shell.header.toggle-pause');
export const getSpeed = (page: Page): Locator => page.getByTestId('shell.header.speed');
export const getSessionOverlay = (page: Page): Locator => page.getByTestId('shell.session-overlay');

/** The player ID of a game path such as `#/game/p-…`. */
export function playerIdOf(game: string): string {
  const playerId = /p-[0-9a-f]{32}/.exec(game)?.[0];
  if (playerId === undefined) {
    throw new Error(`No player ID in ${game}`);
  }
  return playerId;
}

/**
 * Game time shown as `Mo., 01.04.2030, 00:00` in milliseconds of UTC, read independently of the
 * app's formatting functions, so that tests can compare times.
 */
export function parseGameTime(text: string | null): number {
  const match = /(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2})/.exec(text ?? '');
  if (match === null) {
    throw new Error(`No game time in "${text}"`);
  }
  const [, day, month, year, hours, minutes] = match.map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes);
}

export async function readGameTime(page: Page): Promise<number> {
  return parseGameTime(await getClock(page).textContent());
}

/** Waits until the game is loaded and rests or runs without overlay. */
export async function expectGameReady(page: Page): Promise<void> {
  await expect(getClock(page)).toBeVisible({ timeout: 30_000 });
  await expect(getSessionOverlay(page)).toBeHidden({ timeout: 30_000 });
}

export async function resume(page: Page): Promise<void> {
  await expect(getPausedBadge(page)).toBeVisible();
  await getTogglePause(page).click();
  await expect(getPausedBadge(page)).toBeHidden();
}

export async function pause(page: Page): Promise<void> {
  await expect(getPausedBadge(page)).toBeHidden();
  await getTogglePause(page).click();
  await expect(getPausedBadge(page)).toBeVisible();
}

/** Chooses a speed in the speed menu (`realtime`, `1min`, …, `1w`). */
export async function selectSpeed(page: Page, speedId: string, label: string): Promise<void> {
  await getSpeed(page).click();
  await page.getByTestId(`shell.header.speed.${speedId}`).click();
  await expect(getSpeed(page)).toHaveText(label);
}

/** Waits until the shown game time is later than `afterMs` (the clock runs). */
export async function expectClockRunsPast(page: Page, afterMs: number): Promise<void> {
  await expect.poll(() => readGameTime(page), { timeout: 15_000 }).toBeGreaterThan(afterMs);
}

/**
 * Waits until no tab of the context holds the Web Lock of the player any more (TS §9.4), i.e. its
 * worker is gone and wrote everything it was going to write.
 */
export async function expectPlayerUnlocked(page: Page, playerId: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const { held = [] } = await navigator.locks.query();
        return held.some((lock) => lock.name?.includes(id) === true);
      }, playerId),
    )
    .toBe(false);
}

/**
 * Waits until the stored clock (store `runtime`, TS §9.1) has the pause and speed the clock bar
 * shows. The worker reports a clock change to the UI before its write to IndexedDB has finished, so
 * a reload or close right after a click could still find the previous state; this waits for the
 * resting state without a fixed delay.
 */
export async function expectClockStored(
  page: Page,
  playerId: string,
  expected: { paused: boolean; speed: string },
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('portfoligo');
          request.onsuccess = (): void => resolve(request.result);
          request.onerror = (): void => reject(request.error);
        });
        try {
          return await new Promise<{ paused: boolean; speed: string } | null>((resolve, reject) => {
            const read = db.transaction('runtime').objectStore('runtime').get(id);
            read.onsuccess = (): void => {
              const record = read.result as { paused: boolean; speed: string } | undefined;
              resolve(record === undefined ? null : { paused: record.paused, speed: record.speed });
            };
            read.onerror = (): void => reject(read.error);
          });
        } finally {
          db.close();
        }
      }, playerId),
    )
    .toEqual(expected);
}

/**
 * Moves `lastSeenAt` of the stored clock (store `runtime`, TS §9.1) back by `ms`, as if the app had
 * been closed that much longer. Only for the catch-up journey: real time yields one tick per minute,
 * and the clock of the worker can't be controlled from Playwright (`clock.install` only reaches the
 * window), so waiting for the absence is not an option (exception in TS §14.1).
 */
export async function moveLastSeenBack(page: Page, playerId: string, ms: number): Promise<void> {
  await page.evaluate(
    async ({ id, shiftMs }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('portfoligo');
        request.onsuccess = (): void => resolve(request.result);
        request.onerror = (): void => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('runtime', 'readwrite');
          const store = transaction.objectStore('runtime');
          const read = store.get(id);
          read.onsuccess = (): void => {
            const record = read.result as { lastSeenAt: number } | undefined;
            if (record === undefined) {
              transaction.abort();
              return;
            }
            store.put({ ...record, lastSeenAt: record.lastSeenAt - shiftMs });
          };
          transaction.oncomplete = (): void => resolve();
          transaction.onabort = (): void => reject(new Error(`No stored clock of ${id}`));
        });
      } finally {
        db.close();
      }
    },
    { id: playerId, shiftMs: ms },
  );
}

/** Waits until finite CSS animations and transitions (e.g. a dialog fading in) have ended. */
export async function settleAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  );
}

/**
 * Records every heading the session overlay shows in the current document (navigations within the
 * app keep it). A short catch-up shows its overlay only for a moment, too short to poll for it.
 */
export async function recordOverlayHeadings(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const headings: string[] = [];
    (window as unknown as { overlayHeadings: string[] }).overlayHeadings = headings;
    new MutationObserver(() => {
      const text = document
        .querySelector('[data-testid="shell.session-overlay.heading"]')
        ?.textContent?.trim();
      if (text !== undefined && headings.at(-1) !== text) {
        headings.push(text);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  return () =>
    page.evaluate(() => (window as unknown as { overlayHeadings: string[] }).overlayHeadings);
}
