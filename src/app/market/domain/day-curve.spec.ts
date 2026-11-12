import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { createCurveTables, DayCurves } from './day-curve';
import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createMarketContext } from './market-context';
import { advanceMarket, copyMarketDay, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';
import { priceFromLog } from './price-logic';

const seedKey = deriveSeedKey('golden-1');
const world = generateWorld(seedKey);
const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
const tables = createCurveTables(context);
const { layout } = context;
const floor = DEFAULT_MARKET_CONFIG.priceFloor;

const days: MarketDay[] = [];
advanceMarket(context, createMarketState(context), 260, {
  onDay: (day) => days.push(copyMarketDay(day)),
});

describe('DayCurves', () => {
  it('hits open and close of every instrument bit for bit', () => {
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

  it('hits every factor support point bit for bit', () => {
    const day = days[17];
    const curves = new DayCurves(tables).load(day);
    const boundaryCount = layout.boundaries.length;
    for (let k = 0; k < layout.factorIds.length; k++) {
      const curve = curves.factorCurve(k, 0, boundaryCount - 1);
      for (let j = 0; j < boundaryCount; j++) {
        expect(curve[layout.boundaries[j]]).toBe(day.factorLevels[k * boundaryCount + j]);
      }
    }
  });

  it('computes the same minutes regardless of the order of the requests', () => {
    const day = days[42];
    const forward = new DayCurves(tables).load(day);
    const backward = new DayCurves(tables).load(day);
    const count = layout.instrumentIds.length;
    const first = Array.from({ length: count }, (_value, i) => forward.instrumentCurve(i).slice());
    for (let i = count - 1; i >= 0; i--) {
      expect(backward.instrumentCurve(i)).toEqual(first[i]);
    }
  });

  it('adds each jump from its minute on', () => {
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

  it('computes one game year with all minute curves within the CI bound', () => {
    const curves = new DayCurves(tables);
    const intervals = layout.boundaries.length - 1;
    let tradingDays = 0;
    const start = performance.now();
    advanceMarket(context, createMarketState(context), 366, {
      onDay: (day) => {
        curves.load(day);
        for (let k = 0; k < layout.factorIds.length; k++) {
          curves.factorCurve(k, 0, intervals);
        }
        for (let i = 0; i < layout.instrumentIds.length; i++) {
          curves.instrumentCurve(i);
        }
        tradingDays++;
      },
    });
    const duration = performance.now() - start;
    console.info(`one game year with all minute curves: ${duration.toFixed(0)} ms`);
    expect(tradingDays).toBe(262);
    expect(duration).toBeLessThan(15000);
  }, 30000);
});
