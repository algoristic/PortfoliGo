import fc from 'fast-check';

import { REGION_IDS, SECTOR_IDS } from '@app/world/domain/models/taxonomy.model';

import {
  CompositionMember,
  dividendHistory,
  dividendHistoryStart,
  figureWindowDays,
  indexComposition,
  MAX_DIVIDEND_HISTORY,
  MAX_TOP_POSITIONS,
  scheduledExDays,
  windowBeta,
  windowVolatility,
} from './instrument-figures-logic';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;

function dayOf(year: number, month: number, day: number): number {
  return (Date.UTC(year, month - 1, day) - EPOCH_MS) / DAY_MS;
}

function isWeekday(day: number): boolean {
  const weekday = new Date(EPOCH_MS + day * DAY_MS).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** Closes from 100 along the given daily log returns. */
function closesOf(returns: readonly number[]): number[] {
  const closes = [100];
  for (const r of returns) {
    closes.push(closes[closes.length - 1] * Math.exp(r));
  }
  return closes;
}

const PATTERN = [0.01, -0.02, 0.03, 0];
/** 252 returns: the pattern of TS §8.2 63 times. */
const RETURNS = Array.from({ length: 252 }, (_, n) => PATTERN[n % 4]);

describe('figureWindowDays', () => {
  it('takes the 253 market days up to the day before today', () => {
    // Brute force over the weekdays before Wed 12.06.2030.
    const today = dayOf(2030, 6, 12);
    const expected: number[] = [];
    for (let day = today - 1; expected.length < 253; day--) {
      if (isWeekday(day)) {
        expected.unshift(day);
      }
    }
    expect(figureWindowDays(today)).toEqual(expected);
    expect(expected.at(-1)).toBe(dayOf(2030, 6, 11));
    // At the weekend and on Monday, the window ends on Friday.
    expect(figureWindowDays(dayOf(2030, 6, 17))?.at(-1)).toBe(dayOf(2030, 6, 14));
    expect(figureWindowDays(dayOf(2030, 6, 16))).toEqual(figureWindowDays(dayOf(2030, 6, 17)));
  });

  it('is null while the window reaches before the epoch', () => {
    // 2020 has 262 weekdays; the 254th weekday (index 253) is the first with a full window.
    const weekdays: number[] = [];
    for (let day = 0; weekdays.length < 254; day++) {
      if (isWeekday(day)) {
        weekdays.push(day);
      }
    }
    expect(figureWindowDays(weekdays[252])).toBeNull();
    expect(figureWindowDays(weekdays[253])?.[0]).toBe(0);
  });
});

// TS §8.2 (AP 4.5): volatility and beta of hand-computed return series.
describe('windowVolatility and windowBeta', () => {
  it('annualises the sample standard deviation of the log returns with √252', () => {
    // Squared deviations of the pattern: 0.0013 per 4 returns, 63 times; n − 1 = 251.
    const expected = Math.sqrt(((63 * 0.0013) / 251) * 252);
    expect(windowVolatility(closesOf(RETURNS))).toBeCloseTo(expected, 9);
    expect(windowVolatility(closesOf(RETURNS.map(() => 0.001)))).toBeCloseTo(0, 9);
  });

  it.each<[string, (r: number) => number, number]>([
    ['the benchmark itself', (r) => r, 1],
    ['twice the benchmark', (r) => 2 * r, 2],
    ['the inverse benchmark', (r) => -r, -1],
    ['the benchmark plus a drift', (r) => r + 0.0005, 1],
  ])('gives the beta of %s', (_name, map, expected) => {
    const benchmark = closesOf(RETURNS);
    expect(windowBeta(closesOf(RETURNS.map(map)), benchmark)).toBeCloseTo(expected, 9);
  });

  it('is null without a full window or without benchmark variance', () => {
    const short = closesOf(RETURNS.slice(1));
    expect(windowVolatility(short)).toBeNull();
    expect(windowBeta(short, closesOf(RETURNS))).toBeNull();
    expect(windowBeta(closesOf(RETURNS), short)).toBeNull();
    expect(windowBeta(short, short)).toBeNull();
    expect(windowBeta(closesOf(RETURNS), closesOf(RETURNS.map(() => 0)))).toBeNull();
  });
});

describe('dividends', () => {
  it('starts the history five years back', () => {
    expect(dividendHistoryStart(dayOf(2030, 6, 12))).toBe(dayOf(2025, 6, 13));
    expect(dividendHistoryStart(dayOf(2022, 3, 1))).toBe(0);
  });

  it('lists the ex-dates of the rhythm, moved to the next market day', () => {
    // 15.03.2030 Fri, 15.06. Sat → Mon 17.06., 15.09. Sun → Mon 16.09., 15.12. Sun → Mon 16.12.
    const days = scheduledExDays(
      { firstMonth: 3, day: 15 },
      'quarterly',
      dayOf(2030, 3, 15),
      dayOf(2030, 12, 16),
    );
    expect(days).toEqual([
      dayOf(2030, 3, 15),
      dayOf(2030, 6, 17),
      dayOf(2030, 9, 16),
      dayOf(2030, 12, 16),
    ]);
    expect(
      scheduledExDays(
        { firstMonth: 3, day: 15 },
        'quarterly',
        dayOf(2030, 3, 16),
        dayOf(2030, 12, 15),
      ),
    ).toEqual([dayOf(2030, 6, 17), dayOf(2030, 9, 16)]);
    expect(
      scheduledExDays({ firstMonth: 5, day: 2 }, 'annual', dayOf(2030, 5, 3), dayOf(2031, 5, 1)),
    ).toEqual([]);
  });

  it('keeps paid amounts newest first and at most 40', () => {
    const payments = Array.from({ length: 50 }, (_, n) => ({
      exDay: 100 + n,
      paymentDay: 102 + n,
      cents: n % 7 === 3 ? 0 : n,
    }));
    const history = dividendHistory(payments);
    expect(history).toHaveLength(MAX_DIVIDEND_HISTORY);
    expect(history[0]).toEqual({ exDay: 149, paymentDay: 151, cents: 49 });
    expect(history.every(({ cents }) => cents > 0)).toBe(true);
    expect(history.map(({ exDay }) => exDay)).toEqual(
      [...history.map(({ exDay }) => exDay)].sort((a, b) => b - a),
    );
  });
});

describe('indexComposition', () => {
  const member = (
    n: number,
    value: number,
    regionId: CompositionMember['regionId'],
    sectorId: CompositionMember['sectorId'],
  ): CompositionMember => ({ id: `cmp-${n}`, series: n, name: `C${n}`, regionId, sectorId, value });

  it('weights the constituents by their index value', () => {
    const composition = indexComposition('idx-a', [
      member(0, 50, 'north-america', 'technology'),
      member(1, 20, 'europe', 'energy'),
      member(2, 30, 'europe', 'technology'),
    ]);
    expect(composition.indexId).toBe('idx-a');
    expect(composition.constituentCount).toBe(3);
    expect(composition.top.map(({ id, weight }) => [id, weight])).toEqual([
      ['cmp-0', 0.5],
      ['cmp-2', 0.3],
      ['cmp-1', 0.2],
    ]);
    // Equal weights: ordered by code.
    expect(composition.regions).toEqual([
      { key: 'europe', weight: 0.5 },
      { key: 'north-america', weight: 0.5 },
    ]);
    expect(composition.sectors).toEqual([
      { key: 'technology', weight: 0.8 },
      { key: 'energy', weight: 0.2 },
    ]);
  });

  it('orders equal region and sector weights by code', () => {
    const { regions, sectors } = indexComposition('idx', [
      member(0, 10, 'north-america', 'utilities'),
      member(1, 10, 'emerging-markets', 'energy'),
      member(2, 10, 'europe', 'technology'),
      member(3, 10, 'asia-pacific', 'financials'),
    ]);
    expect(regions.map(({ key }) => key)).toEqual([
      'asia-pacific',
      'emerging-markets',
      'europe',
      'north-america',
    ]);
    expect(sectors.map(({ key }) => key)).toEqual([
      'energy',
      'financials',
      'technology',
      'utilities',
    ]);
  });

  it('keeps the ten largest positions, ties in constituent order', () => {
    const members = Array.from({ length: 12 }, (_, n) =>
      member(n, n < 4 ? 10 : n, 'europe', 'energy'),
    );
    const { top } = indexComposition('idx', members);
    expect(top.map(({ series }) => series)).toEqual([11, 0, 1, 2, 3, 10, 9, 8, 7, 6]);
  });

  it('has weights that sum to 1 in every view and descend', () => {
    const arbMember = fc.record({
      value: fc.double({ min: 1, max: 1e9, noNaN: true }),
      regionId: fc.constantFrom(...REGION_IDS),
      sectorId: fc.constantFrom(...SECTOR_IDS),
    });
    fc.assert(
      fc.property(fc.array(arbMember, { minLength: 1, maxLength: 40 }), (values) => {
        const members = values.map(({ value, regionId, sectorId }, n) =>
          member(n, value, regionId, sectorId),
        );
        const composition = indexComposition('idx', members);
        expect(composition.top).toHaveLength(Math.min(MAX_TOP_POSITIONS, members.length));
        for (const shares of [composition.regions, composition.sectors]) {
          expect(shares.reduce((sum, { weight }) => sum + weight, 0)).toBeCloseTo(1, 9);
          shares.slice(1).forEach(({ weight }, n) => {
            expect(weight).toBeLessThanOrEqual(shares[n].weight);
          });
        }
        const weights = composition.top.map(({ weight }) => weight);
        expect(weights).toEqual([...weights].sort((a, b) => b - a));
        const total = values.reduce((sum, { value }) => sum + value, 0);
        const largest = Math.max(...values.map(({ value }) => value));
        expect(weights[0]).toBeCloseTo(largest / total, 12);
      }),
    );
  });
});
