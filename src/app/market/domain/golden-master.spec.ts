import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { computeGoldenChecksums, GOLDEN_CHECKSUMS, GOLDEN_SEED } from './golden-master';
import { marketChecksum } from './market-checksum';
import { runPrehistory } from './prehistory';

describe('computeGoldenChecksums', () => {
  it('reproduces the frozen checksums of the golden seed', () => {
    expect(
      computeGoldenChecksums(GOLDEN_SEED),
      'the world or the prices of existing seeds changed: raise SIM_VERSION (TS §15)',
    ).toEqual(GOLDEN_CHECKSUMS);
  });

  it('reaches the game start state of an uninterrupted prehistory', () => {
    const seedKey = deriveSeedKey(GOLDEN_SEED);
    const { state } = runPrehistory(seedKey, generateWorld(seedKey));
    expect(marketChecksum(state)).toBe(GOLDEN_CHECKSUMS.gameStart);
  });

  it('gives different checksums for another seed', () => {
    const other = computeGoldenChecksums('golden-2');
    for (const [id, checksum] of Object.entries(other)) {
      expect(checksum, id).not.toBe(GOLDEN_CHECKSUMS[id as keyof typeof GOLDEN_CHECKSUMS]);
    }
  });
});
