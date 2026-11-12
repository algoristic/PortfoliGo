import fc from 'fast-check';

import { createCurveTables, CurveTables, DayCurves } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createMarketContext, MarketContext } from './market-context';
import { advanceMarket, copyMarketDay, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';
import { priceFromLog } from './price-logic';
import { goldenYear } from './testing/golden-year';
import { miniMarket } from './testing/mini-market';

const floor = DEFAULT_MARKET_CONFIG.priceFloor;
/** Market days of the mini world that the properties draw from (about 3.5 months). */
const MINI_DAYS = 105;

let context: MarketContext;
let tables: CurveTables;
let days: readonly MarketDay[];
let miniContext: MarketContext;
let miniTables: CurveTables;
let miniDays: MarketDay[];

beforeAll(() => {
  ({ context, tables, days } = goldenYear());
  miniContext = miniMarket().context;
  miniTables = createCurveTables(miniContext);
  miniDays = [];
  advanceMarket(miniContext, createMarketState(miniContext), MINI_DAYS, {
    onDay: (day) => miniDays.push(copyMarketDay(day)),
  });
});

describe('DayCurves', () => {
  it('hits open and close of every instrument bit for bit', () => {
    const { layout } = context;
    for (const day of [days[0], days[90], days[days.length - 1]]) {
      const curves = new DayCurves(tables).load(day);
      for (let i = 0; i < layout.instrumentIds.length; i++) {
        const curve = curves.instrumentCurve(i);
        const length =
          layout.boundaries[layout.closeBoundary[i]] - layout.boundaries[layout.openBoundary[i]];
        expect(curve).toHaveLength(length + 1);
        expect(curve[0]).toBe(priceFromLog(day.logOpen[i], floor));
        expect(curve[length]).toBe(priceFromLog(day.logClose[i], floor));
        expect(curve.every((price) => price >= floor && Number.isFinite(price))).toBe(true);
      }
    }
  });

  it('hits every factor support point bit for bit, on any day', () => {
    const { layout } = miniContext;
    const boundaryCount = layout.boundaries.length;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: miniDays.length - 1 }), (n) => {
        const day = miniDays[n];
        const curves = new DayCurves(miniTables).load(day);
        for (let k = 0; k < layout.factorIds.length; k++) {
          const curve = curves.factorCurve(k, 0, boundaryCount - 1);
          for (let j = 0; j < boundaryCount; j++) {
            expect(curve[layout.boundaries[j]]).toBe(day.factorLevels[k * boundaryCount + j]);
          }
        }
      }),
      { numRuns: 20 },
    );
  });

  it('computes the same minutes regardless of the order of the requests', () => {
    const { layout } = miniContext;
    const count = layout.instrumentIds.length;
    const arbOrder = fc.shuffledSubarray(
      Array.from({ length: count }, (_value, i) => i),
      { minLength: count, maxLength: count },
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: miniDays.length - 1 }), arbOrder, (n, order) => {
        const day = miniDays[n];
        const forward = new DayCurves(miniTables).load(day);
        const expected = Array.from({ length: count }, (_value, i) =>
          forward.instrumentCurve(i).slice(),
        );
        const shuffled = new DayCurves(miniTables).load(day);
        for (const i of order) {
          expect(shuffled.instrumentCurve(i)).toEqual(expected[i]);
        }
      }),
      { numRuns: 20 },
    );
  });

  it('adds each jump from its minute on', () => {
    const { layout } = context;
    const withJump = days.find((day) => day.jumpTotal > 0) as MarketDay;
    const i = withJump.jumpCount.findIndex((count) => count > 0);
    const start = withJump.jumpStart[i];
    const jumpCount = withJump.jumpCount[i];
    let jumpSum = 0;
    for (let n = start; n < start + jumpCount; n++) {
      jumpSum += withJump.jumpSize[n];
    }
    const withoutJump = copyMarketDay(withJump);
    withoutJump.jumpSize.fill(0, start, start + jumpCount);
    withoutJump.idioClose[i] -= jumpSum;
    withoutJump.logClose[i] -= jumpSum;

    const jumped = new DayCurves(tables).load(withJump).instrumentCurve(i);
    const plain = new DayCurves(tables).load(withoutJump).instrumentCurve(i);
    const open = layout.boundaries[layout.openBoundary[i]];
    jumped.forEach((price, j) => {
      let expected = 0;
      for (let n = start; n < start + jumpCount; n++) {
        expected += withJump.jumpMinute[n] <= open + j ? withJump.jumpSize[n] : 0;
      }
      expect(Math.log(price / plain[j])).toBeCloseTo(expected, 9);
    });
  });

  it('keeps the support points with an intraday volatility profile', () => {
    const { seedKey, world } = goldenYear();
    const profiled = createCurveTables(
      createMarketContext(seedKey, world, {
        ...DEFAULT_MARKET_CONFIG,
        intradayVolProfile: [3, 1, 1, 2],
      }),
    );
    const day = days[60];
    const uniform = new DayCurves(tables).load(day).instrumentCurve(5);
    const shaped = new DayCurves(profiled).load(day).instrumentCurve(5);
    expect(shaped[0]).toBe(uniform[0]);
    expect(shaped[shaped.length - 1]).toBe(uniform[uniform.length - 1]);
    expect(shaped).not.toEqual(uniform);
  });
});
