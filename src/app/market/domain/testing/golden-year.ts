import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';

import { deriveSeedKey, SeedKey } from '@app/simulation/util/seed';

import { World } from '@app/world/domain/models/world.model';

import { generateWorld } from '@app/world/domain/world-generator';

import { createCurveTables, CurveTables } from '../day-curve';
import { DEFAULT_MARKET_CONFIG } from '../default-market-config';
import { GOLDEN_SEED } from '../golden-master';
import { createMarketContext, MarketContext } from '../market-context';
import { createFactorHistory } from '../market-history';
import { advanceMarket, copyMarketDay, createMarketState } from '../market-step';
import { MarketDay } from '../models/market-day.model';
import { FactorHistory, MarketState } from '../models/market-state.model';
import { PriceSource } from '../price-source';

/** First day after the golden year 2020. */
export const END_OF_2020_DAY = dayIndex(dateTimeToTick({ year: 2021, month: 1, day: 1 }));

/** Number of trailing days that the live price source remembers, as the engine would. */
const REMEMBERED_DAYS = 8;

export interface GoldenYear {
  seedKey: SeedKey;
  world: World;
  context: MarketContext;
  tables: CurveTables;
  history: FactorHistory;
  /** Market state at the start of 2021. Tests must not advance it. */
  state: MarketState;
  /** Copies of all market days of 2020. */
  days: readonly MarketDay[];
  /** Price source that saw the last days live (`rememberDay`). */
  live: PriceSource;
  /** Days that `live` remembers. */
  liveDays: readonly number[];
  /** Thursday, 31.12.2020: the last stepped day. */
  today: number;
  /** Last tick of `today`; queries use it as `now`. */
  endOfToday: number;
}

let goldenYearRun: GoldenYear | null = null;

/**
 * The standard world of the golden seed, run through 2020 once per test file (call it in
 * `beforeAll`). Replaces the setup that several market specs used to repeat.
 */
export function goldenYear(): GoldenYear {
  if (goldenYearRun !== null) {
    return goldenYearRun;
  }
  const seedKey = deriveSeedKey(GOLDEN_SEED);
  const world = generateWorld(seedKey);
  const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
  const history = createFactorHistory();
  const state = createMarketState(context);
  const live = new PriceSource(context, history, state);
  const days: MarketDay[] = [];
  const liveDays: number[] = [];
  advanceMarket(context, state, END_OF_2020_DAY, {
    history,
    onDay: (day) => {
      days.push(copyMarketDay(day));
      if (day.day >= END_OF_2020_DAY - REMEMBERED_DAYS) {
        live.rememberDay(day);
        liveDays.push(day.day);
      }
    },
  });
  const today = END_OF_2020_DAY - 1;
  goldenYearRun = {
    seedKey,
    world,
    context,
    tables: createCurveTables(context),
    history,
    state,
    days,
    live,
    liveDays,
    today,
    endOfToday: dayStartTick(today + 1) - 1,
  };
  return goldenYearRun;
}
