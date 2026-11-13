import fc from 'fast-check';

import { HeldPosition, PositionFigures } from './models/portfolio.model';
import {
  combinePositions,
  nextPositionSort,
  positionOverview,
  sortPositions,
} from './position-overview-logic';

// TS §7.9 „Depotübersicht“: share A and ETF E
const SHARE: HeldPosition = {
  instrumentId: 'a',
  name: 'Aktie A',
  quantity: 10_000_000,
  cost: 101_300,
  bid: 110,
};
const ETF: HeldPosition = {
  instrumentId: 'e',
  name: 'ETF E',
  quantity: 20_000_000,
  cost: 200_670,
  bid: 95.505,
};

describe('positionOverview', () => {
  // TS §7.9 „Depotübersicht“
  it.each([
    [SHARE, 101.3, 110_000, 8_700, 8_700 / 101_300, 110_000 / 301_010],
    [ETF, 100.335, 191_010, -9_660, -9_660 / 200_670, 191_010 / 301_010],
  ])('computes the row of %o', (position, averageCost, value, gain, gainRatio, share) => {
    const row = positionOverview([SHARE, ETF]).rows.find(
      (candidate) => candidate.instrumentId === position.instrumentId,
    );
    expect(row?.averageCost).toBeCloseTo(averageCost, 10);
    expect(row?.price).toBe(position.bid);
    expect(row?.value).toBe(value);
    expect(row?.gain).toBe(gain);
    expect(row?.gainRatio).toBeCloseTo(gainRatio, 12);
    expect(row?.share).toBeCloseTo(share, 12);
  });

  it('sums cost, value and gain in the total row', () => {
    const { totals } = positionOverview([SHARE, ETF]);
    expect(totals.cost).toBe(301_970);
    expect(totals.value).toBe(301_010);
    expect(totals.gain).toBe(-960);
    expect(totals.gainRatio).toBeCloseTo(-960 / 301_970, 12);
  });

  it('leaves value, gain and every share open while a quote is missing', () => {
    const { rows, totals } = positionOverview([SHARE, { ...ETF, bid: null }]);
    expect(rows[0]).toMatchObject({ value: 110_000, gain: 8_700, share: null });
    expect(rows[1]).toMatchObject({ price: null, value: null, gain: null, gainRatio: null });
    expect(rows[1].averageCost).toBeCloseTo(100.335, 10);
    expect(totals).toEqual({ cost: 301_970, value: null, gain: null, gainRatio: null });
  });

  it('has no gain ratio without acquisition cost', () => {
    const { rows } = positionOverview([{ ...SHARE, cost: 0 }]);
    expect(rows[0].gain).toBe(110_000);
    expect(rows[0].gainRatio).toBeNull();
  });

  const arbPosition = fc.record({
    instrumentId: fc.string({ minLength: 1, maxLength: 4 }),
    name: fc.string({ maxLength: 6 }),
    quantity: fc.integer({ min: 1, max: 1e10 }),
    cost: fc.integer({ min: 0, max: 1e9 }),
    bid: fc.double({ min: 0.0001, max: 10_000, noNaN: true }),
  });

  it('gives shares that add up to 1 and values that add up to the total', () => {
    fc.assert(
      fc.property(fc.array(arbPosition, { minLength: 1, maxLength: 12 }), (positions) => {
        const { rows, totals } = positionOverview(positions);
        expect(rows.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBe(totals.value);
        expect(totals.gain).toBe((totals.value ?? 0) - totals.cost);
        if ((totals.value ?? 0) > 0) {
          expect(rows.reduce((sum, row) => sum + (row.share ?? 0), 0)).toBeCloseTo(1, 9);
        }
      }),
    );
  });
});

describe('combinePositions', () => {
  it('adds shares and costs of the same instrument in several depots', () => {
    expect(combinePositions([SHARE, ETF, { ...SHARE, quantity: 5_000_000, cost: 52_000 }])).toEqual(
      [{ ...SHARE, quantity: 15_000_000, cost: 153_300 }, ETF],
    );
  });
});

describe('nextPositionSort', () => {
  it('reverses the direction of the same column', () => {
    expect(nextPositionSort({ key: 'value', direction: 'descending' }, 'value')).toEqual({
      key: 'value',
      direction: 'ascending',
    });
  });

  it.each([
    ['name', 'ascending'],
    ['quantity', 'descending'],
    ['gainRatio', 'descending'],
  ] as const)('starts %s %s', (key, direction) => {
    expect(nextPositionSort({ key: 'value', direction: 'descending' }, key)).toEqual({
      key,
      direction,
    });
  });
});

describe('sortPositions', () => {
  function row(instrumentId: string, name: string, value: number | null): PositionFigures {
    return {
      instrumentId,
      name,
      quantity: 1,
      cost: 0,
      averageCost: 0,
      price: value,
      value,
      gain: value,
      gainRatio: null,
      share: null,
    };
  }
  const rows = [
    row('c', 'Ölwerke', 300),
    row('a', 'Zink', null),
    row('b', 'Apfel', 300),
    row('d', 'Bau', 100),
  ];

  it('sorts names with German collation', () => {
    expect(sortPositions(rows, { key: 'name', direction: 'ascending' }).map((r) => r.name)).toEqual(
      ['Apfel', 'Bau', 'Ölwerke', 'Zink'],
    );
    expect(
      sortPositions(rows, { key: 'name', direction: 'descending' }).map((r) => r.name),
    ).toEqual(['Zink', 'Ölwerke', 'Bau', 'Apfel']);
  });

  it('keeps missing values last in both directions, ties by name', () => {
    expect(
      sortPositions(rows, { key: 'value', direction: 'descending' }).map((r) => r.instrumentId),
    ).toEqual(['b', 'c', 'd', 'a']);
    expect(
      sortPositions(rows, { key: 'value', direction: 'ascending' }).map((r) => r.instrumentId),
    ).toEqual(['d', 'b', 'c', 'a']);
  });
});
