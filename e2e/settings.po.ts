import { Page } from '@playwright/test';

/**
 * Stores the appearance in `pgo.settings` before every document of the page loads, like a
 * returning visitor who chose it on the settings page (TS §9.3).
 */
export async function storeColorScheme(
  page: Page,
  colorScheme: 'system' | 'dark' | 'light',
): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem(
      'pgo.settings',
      JSON.stringify({ v: 1, data: { appearance: { colorScheme: value } } }),
    );
  }, colorScheme);
}

/**
 * Records the class of `<html>` in every document of the page: when `<body>` appears (scripts of
 * the head ran, Angular did not start yet, nothing is painted) and every change after it.
 */
export async function recordRootClasses(page: Page): Promise<() => Promise<RootClasses>> {
  await page.addInitScript(() => {
    const record: RootClasses = { atBody: null, changes: [] };
    (window as unknown as { rootClasses: RootClasses }).rootClasses = record;
    let watched: Element | null = null;
    const watchRoot = (): void => {
      const root = document.documentElement;
      if (root !== null && root !== watched) {
        watched = root;
        new MutationObserver(() => record.changes.push(root.className)).observe(root, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    };
    watchRoot();
    const parsing = new MutationObserver(() => {
      watchRoot();
      if (document.body !== null) {
        record.atBody = document.documentElement.className;
        parsing.disconnect();
      }
    });
    parsing.observe(document, { subtree: true, childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { rootClasses: RootClasses }).rootClasses);
}

export interface RootClasses {
  /** Class of `<html>` before Angular starts; `null` if the body never appeared. */
  atBody: string | null;
  /** Every class `<html>` had after a change, from the inline script on. */
  changes: string[];
}
