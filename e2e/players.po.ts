import { expect, Page } from '@playwright/test';

/**
 * Creates a player through „Spieler anlegen“ with the defaults and waits for the game area.
 * Returns the hash path of the game area, e.g. `#/game/p-…`, for deep links.
 */
export async function createPlayer(page: Page, name: string): Promise<string> {
  await page.goto('#/players/new');
  await page.getByTestId('players.new.name').fill(name);
  await page.getByTestId('players.new.submit').click();
  await expect(page).toHaveURL(/#\/game\/p-[0-9a-f]{32}\/dashboard$/);
  const playerId = /#\/game\/(p-[0-9a-f]{32})\//.exec(page.url())?.[1];
  if (playerId === undefined) {
    throw new Error(`No player ID in ${page.url()}`);
  }
  return `#/game/${playerId}`;
}
