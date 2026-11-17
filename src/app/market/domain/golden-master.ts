import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
} from '@app/clock/domain/calendar-logic';

import { Checksum } from '@app/simulation/util/checksum';
import { withInexactMathTrap } from '@app/simulation/util/inexact-math-trap';

import { deriveSeedKey } from '@app/simulation/util/seed';

import { worldChecksum } from '@app/world/domain/world-checksum';

import { generateWorld } from '@app/world/domain/world-generator';

import { dailyCandlesFromSupport } from './candle-logic';
import { createCurveTables, SupportValues } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { marketChecksum } from './market-checksum';
import { createMarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, createMarketState } from './market-step';
import { priceFromLog } from './price-logic';
import { PriceSource } from './price-source';
import { etfSeries, indexSeries } from './series';

/** Seed of the golden master (TS §4.6). */
export const GOLDEN_SEED = 'golden-1';

export const GOLDEN_CHECKSUM_IDS = [
  'world',
  'prices',
  'minutes',
  'indices',
  'etfs',
  'gameStart',
  'worlds',
] as const;
export type GoldenChecksumId = (typeof GOLDEN_CHECKSUM_IDS)[number];
export type GoldenChecksums = Readonly<Record<GoldenChecksumId, string>>;

/**
 * Frozen checksums of the seed `golden-1` (TS §4.6). They change only when the world or the prices
 * for existing seeds change; then `simVersion` must be raised (TS §15).
 *
 * - `world`: the generated world (`worldChecksum`).
 * - `prices`: opens and closes of all instruments on every market day of 2020.
 * - `minutes`: the minute curves of `GOLDEN_MINUTE_SAMPLE`.
 * - `indices`: daily opens and closes of all price and total return indices in 2020.
 * - `etfs`: daily opens and closes of all ETFs in 2020.
 * - `gameStart`: the market state at the game start, after the whole prehistory.
 * - `worlds`: the worlds of the first `SELF_TEST_WORLD_SEEDS` seeds of `worldSeeds` (AP 7.3a).
 */
export const GOLDEN_CHECKSUMS: GoldenChecksums = {
  world: '3f0d08f488566392b17b7c206df7b095',
  prices: '41344ffcfcdbe21f33b8ec151c4180fb',
  minutes: '4771c60c2a03e9edb698b1cdc3a60251',
  indices: '1fa9e157bfc45c44773e989d75540346',
  etfs: '361e8b8305e25cc385c40d46c91124e1',
  gameStart: 'af17c89923c8dec39c1fd1ddac57a2a0',
  worlds: 'e8fb56389db4cf368ecffedd278ddd97',
};

/** Number of seeds of the checksum over many worlds in the logic tests (AP 7.3a). */
export const GOLDEN_WORLD_SEEDS = 200;
/** Its first seeds, few enough for the self-test in the worker of every engine. */
export const SELF_TEST_WORLD_SEEDS = 20;

/**
 * Frozen checksum over the worlds of all `GOLDEN_WORLD_SEEDS` seeds (TS §4.6). Rare paths of the
 * world generation (non-payers starting at the epoch, small or empty sectors) occur only in some
 * worlds, so one seed would not notice a change of them (AP 7.3a).
 */
export const GOLDEN_WORLDS_CHECKSUM = 'fd5bfc48428b8f0011459abb26d0160b';

/** Seeds `worlds-1` … `worlds-<count>` of the checksum over many worlds. */
export function worldSeeds(count: number): string[] {
  return Array.from({ length: count }, (_, n) => `worlds-${n + 1}`);
}

/** Checksum over the `worldChecksum` of each seed in order, as 32-bit words of the hex digest. */
export function worldsChecksum(seeds: readonly string[]): string {
  const checksum = new Checksum();
  for (const seed of seeds) {
    const digest = worldChecksum(generateWorld(deriveSeedKey(seed)));
    for (let i = 0; i < digest.length; i += 8) {
      checksum.addUint32(Number.parseInt(digest.slice(i, i + 8), 16));
    }
  }
  return checksum.digest();
}

/** First day after the golden year 2020. */
const END_OF_2020_DAY = dayIndex(dateTimeToTick({ year: 2021, month: 1, day: 1 }));

/** Fixed sample of instrument-days for the minute checksum; `days` are market days of 2020. */
export const GOLDEN_MINUTE_SAMPLE = {
  days: [0, 47, 160, 287, END_OF_2020_DAY - 1],
  instruments: [0, 57, 123, 199],
} as const;

/**
 * Computes all golden checksums of a seed in one run: the year 2020 with its prices, then the
 * minute sample, then the prehistory up to the game start, then the worlds of the first
 * `SELF_TEST_WORLD_SEEDS`. Runs in the worker for the self-test in the lab (TS §14.2), so it must
 * stay framework-free. The inexact `Math` functions throw meanwhile (`withInexactMathTrap`).
 */
export function computeGoldenChecksums(seed: string = GOLDEN_SEED): GoldenChecksums {
  return withInexactMathTrap(() => computeChecksums(seed));
}

function computeChecksums(seed: string): GoldenChecksums {
  const seedKey = deriveSeedKey(seed);
  const world = generateWorld(seedKey);
  const config = DEFAULT_MARKET_CONFIG;
  const context = createMarketContext(seedKey, world, config);
  const tables = createCurveTables(context);
  const history = createFactorHistory();
  const state = createMarketState(context);
  const firstIndexSeries = indexSeries(context, 0);
  const firstEtfSeries = etfSeries(context, 0);
  const etfCount = context.etfs.ids.length;

  const prices = new Checksum();
  const indices = new Checksum();
  const etfs = new Checksum();
  advanceMarket(context, state, END_OF_2020_DAY, {
    history,
    onDay: (day) => {
      for (let i = 0; i < day.logOpen.length; i++) {
        prices.addFloat64(priceFromLog(day.logOpen[i], config.priceFloor));
        prices.addFloat64(priceFromLog(day.logClose[i], config.priceFloor));
      }
      const candles = dailyCandlesFromSupport(context, day);
      for (let series = firstIndexSeries; series < firstEtfSeries; series++) {
        indices.addFloat64(candles[series].open);
        indices.addFloat64(candles[series].close);
      }
      const support = new SupportValues(tables, day);
      for (let e = 0; e < etfCount; e++) {
        etfs.addFloat64(support.value(etfSeries(context, e), 'open'));
        etfs.addFloat64(support.value(etfSeries(context, e), 'close'));
      }
    },
  });

  const endOfLastDay = dayStartTick(END_OF_2020_DAY) - 1;
  const source = new PriceSource(context, history, state);
  const minutes = new Checksum();
  for (const day of GOLDEN_MINUTE_SAMPLE.days) {
    for (const i of GOLDEN_MINUTE_SAMPLE.instruments) {
      minutes.addFloat64Array(source.minuteCurve(i, day, endOfLastDay));
    }
  }

  advanceMarket(context, state, dayIndex(GAME_START_TICK), { history });

  return {
    world: worldChecksum(world),
    prices: prices.digest(),
    minutes: minutes.digest(),
    indices: indices.digest(),
    etfs: etfs.digest(),
    gameStart: marketChecksum(state),
    worlds: worldsChecksum(worldSeeds(SELF_TEST_WORLD_SEEDS)),
  };
}
