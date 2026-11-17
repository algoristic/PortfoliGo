import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import {
  computeGoldenChecksums,
  GOLDEN_CHECKSUMS,
  GOLDEN_SEED,
  GOLDEN_WORLD_SEEDS,
  GOLDEN_WORLDS_CHECKSUM,
  SELF_TEST_WORLD_SEEDS,
  worldsChecksum,
  worldSeeds,
} from './golden-master';
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
      // `worlds` covers fixed seeds and doesn't depend on the golden seed.
      if (id !== 'worlds') {
        expect(checksum, id).not.toBe(GOLDEN_CHECKSUMS[id as keyof typeof GOLDEN_CHECKSUMS]);
      }
    }
  });
});

describe('worldsChecksum', () => {
  it('reproduces the frozen checksum over many worlds (AP 7.3a)', () => {
    expect(
      worldsChecksum(worldSeeds(GOLDEN_WORLD_SEEDS)),
      'the world of some seeds changed: raise SIM_VERSION (TS §15)',
    ).toBe(GOLDEN_WORLDS_CHECKSUM);
  });

  it('covers the seeds of the self-test as its first seeds', () => {
    expect(worldSeeds(GOLDEN_WORLD_SEEDS).slice(0, SELF_TEST_WORLD_SEEDS)).toEqual(
      worldSeeds(SELF_TEST_WORLD_SEEDS),
    );
  });

  it('depends on the order of the seeds', () => {
    const seeds = worldSeeds(2);
    expect(worldsChecksum(seeds)).not.toBe(worldsChecksum([...seeds].reverse()));
  });
});
