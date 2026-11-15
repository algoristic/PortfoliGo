import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, Page } from '@playwright/test';

// Navigation away from a page cancels pending requests; that is not an error of the app.
const ABORTED = /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i;

/**
 * Every system test fails on console errors, uncaught exceptions and failed requests of the page
 * (TS §14.1).
 */
export const test = base.extend<{ allowedPageErrors: readonly RegExp[]; pageErrors: void }>({
  // Firefox and WebKit also report uncaught errors of a dedicated worker as `pageerror`; a journey
  // that crashes the worker on purpose allows exactly that message.
  allowedPageErrors: [[], { option: true }],
  pageErrors: [
    async ({ page, allowedPageErrors }, use) => {
      const errors: string[] = [];
      const pending: Promise<void>[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          // Angular logs `ERROR` with the error object; resolve it so the report shows the cause.
          pending.push(
            Promise.all(
              message
                .args()
                .map((arg) =>
                  arg
                    .evaluate((value) =>
                      value instanceof Error ? `${value.message}\n${value.stack}` : String(value),
                    )
                    .catch(() => arg.toString()),
                ),
            ).then((parts) => {
              errors.push(`console: ${parts.join(' ') || message.text()}`);
            }),
          );
        }
      });
      page.on('pageerror', (error) => {
        if (!allowedPageErrors.some((allowed) => allowed.test(error.message))) {
          errors.push(`pageerror: ${error.message}`);
        }
      });
      page.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText ?? '';
        if (!ABORTED.test(failure)) {
          errors.push(`requestfailed: ${request.url()} ${failure}`);
        }
      });
      await use();
      await Promise.all(pending);
      expect(errors, 'the page reported errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** No serious or critical WCAG 2.2 AA findings (NF-09); `exclude` takes CSS selectors. */
export async function expectAccessible(page: Page, exclude: readonly string[] = []): Promise<void> {
  await waitForTransitions(page);
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);
  for (const selector of exclude) {
    builder = builder.exclude(selector);
  }
  const { violations } = await builder.analyze();
  const findings = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    );
  expect(findings).toEqual([]);
}

/**
 * axe reads the computed colours: in the middle of a transition (the fading dialog backdrop, a
 * button's `transition-colors` right after a dialog opened) it measures intermediate colours and
 * reports contrast findings that the resting page doesn't have. Waits for the finite animations
 * running now; endless ones (`animate-pulse`) are skipped.
 */
async function waitForTransitions(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Transitions of a style change from the last action (a dialog that just opened) start with
    // the next frame; before it, `getAnimations()` doesn't list them yet.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const running = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    // A cancelled transition rejects `finished`; it has stopped all the same.
    await Promise.allSettled(running.map((animation) => animation.finished));
  });
}
