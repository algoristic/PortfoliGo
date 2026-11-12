import { GOLDEN_CHECKSUM_IDS, GOLDEN_CHECKSUMS } from '@app/market/domain/golden-master';

import { expect, test } from './fixtures';

// Cross-engine determinism (TS §4.6, J11): the worker of each engine must compute exactly the
// golden checksums that the logic tests froze in Node (V8).

test.describe('self-test', { tag: '@mobile' }, () => {
  test('computes the golden checksums of the seed golden-1 in the worker', async ({ page }) => {
    await page.goto('#/lab/simulation');
    await page.getByTestId('lab.simulation.self-test.run').click();
    for (const id of GOLDEN_CHECKSUM_IDS) {
      await expect(page.getByTestId(`lab.simulation.self-test.${id}.value`)).toHaveText(
        GOLDEN_CHECKSUMS[id],
        { timeout: 60_000 },
      );
    }
  });
});
